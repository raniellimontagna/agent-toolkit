import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AriadneStateError } from "./schema.js";
import type { AriadneStory } from "./types.js";

export type GitExec = (
  command: "git",
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) => {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
};

type GitResult = ReturnType<GitExec>;

export type AriadneStageCertificate = {
  parentHead: string;
  ref: string;
  tree: string;
};

export type AriadnePublicationCertificate = AriadneStageCertificate & {
  commit: string;
};

type PendingStage = AriadneStageCertificate & {
  indexPath: string;
  indexMode: number;
  originalIndex: Buffer;
  privateIndex: Buffer;
  privateIndexPath: string;
};

type PublishedState = AriadnePublicationCertificate & {
  indexPath: string;
  indexMode: number;
  originalIndex: Buffer;
  publishedIndex: Buffer;
};

const MACHINE_LOCAL_IGNORE_PROBES = [
  ".ariadne/lock",
  ".ariadne/runs/.lock-coordinator/root.json",
  ".ariadne/runs/ariadne-safety-probe/prompt.md",
  ".ariadne-quarantine.json",
  ".ariadne-quarantine.checkpoint.json",
] as const;
const STAGE_BATCH_SIZE = 256;
const OBJECT_ID = /^[0-9a-f]{40,64}$/i;

function nulSeparatedPaths(value: string): string[] {
  return value.split("\0").filter(Boolean);
}

function isMachineLocalPath(value: string): boolean {
  const folded = value.replaceAll("\\", "/").toLowerCase();
  return (
    folded === ".ariadne/lock" ||
    folded.startsWith(".ariadne/lock/") ||
    folded === ".ariadne/runs" ||
    folded.startsWith(".ariadne/runs/") ||
    folded === ".ariadne-quarantine.json" ||
    folded.startsWith(".ariadne-quarantine.json/") ||
    folded.startsWith(".ariadne-quarantine.tmp-") ||
    folded === ".ariadne-quarantine.checkpoint.json" ||
    folded.startsWith(".ariadne-quarantine.checkpoint.json/") ||
    folded.startsWith(".ariadne-quarantine.checkpoint.tmp-")
  );
}

function literalPathspec(value: string): string {
  return `:(literal)${value}`;
}

function sameFile(left: fs.Stats, right: fs.Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.nlink === right.nlink
  );
}

export class AriadneGit {
  private pendingStage?: PendingStage;
  private publishedState?: PublishedState;

  constructor(
    readonly root: string,
    private readonly exec: GitExec,
  ) {}

  private capture(args: string[], env?: NodeJS.ProcessEnv): GitResult {
    return this.exec("git", args, this.root, env);
  }

  private require(
    args: string[],
    description: string,
    env?: NodeJS.ProcessEnv,
  ): string {
    const result = this.capture(args, env);
    if (!result.ok) {
      const detail = result.stderr.trim() || result.stdout.trim();
      throw new AriadneStateError(
        "$git",
        `Unable to ${description} (git exited ${result.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    return result.stdout.trim();
  }

  private privateIndexEnv(indexPath: string): NodeJS.ProcessEnv {
    return { GIT_INDEX_FILE: indexPath };
  }

  private removePrivateIndex(indexPath: string): void {
    try {
      fs.unlinkSync(indexPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private discardPendingStage(): void {
    if (!this.pendingStage) return;
    const privateIndexPath = this.pendingStage.privateIndexPath;
    this.pendingStage = undefined;
    this.removePrivateIndex(privateIndexPath);
  }

  private readRegularFile(filePath: string, description: string): Buffer {
    let before: fs.Stats;
    try {
      before = fs.lstatSync(filePath);
    } catch {
      throw new AriadneStateError("$git", `Unable to read ${description}`);
    }
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
      throw new AriadneStateError(
        "$git",
        `${description} must be one regular, unlinked file`,
      );
    }
    let contents: Buffer;
    let after: fs.Stats;
    try {
      contents = fs.readFileSync(filePath);
      after = fs.lstatSync(filePath);
    } catch {
      throw new AriadneStateError("$git", `Unable to read ${description}`);
    }
    if (!sameFile(before, after)) {
      throw new AriadneStateError(
        "$git",
        `${description} changed while Ariadne read it`,
      );
    }
    return contents;
  }

  private writeExclusive(
    filePath: string,
    contents: Buffer,
    mode: number,
  ): void {
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(
        filePath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        mode & 0o777,
      );
      fs.writeFileSync(descriptor, contents);
      fs.fsyncSync(descriptor);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }

  private gitIndexPath(): string {
    const discovered = this.require(
      ["rev-parse", "--path-format=absolute", "--git-path", "index"],
      "locate the Git index",
    );
    return path.isAbsolute(discovered)
      ? path.normalize(discovered)
      : path.resolve(this.root, discovered);
  }

  private assertIndexMatches(
    indexPath: string,
    expected: Buffer,
    description: string,
  ): void {
    const observed = this.readRegularFile(indexPath, description);
    if (!observed.equals(expected)) {
      throw new AriadneStateError("$git", `${description} changed`);
    }
  }

  private atomicReplaceIndex(
    indexPath: string,
    expectedCurrent: Buffer,
    replacement: Buffer,
    mode: number,
  ): void {
    const lockPath = `${indexPath}.lock`;
    let descriptor: number | undefined;
    let renamed = false;
    try {
      descriptor = fs.openSync(
        lockPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        mode & 0o777,
      );
      this.assertIndexMatches(indexPath, expectedCurrent, "shared Git index");
      fs.writeFileSync(descriptor, replacement);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(lockPath, indexPath);
      renamed = true;
      try {
        const directory = fs.openSync(
          path.dirname(indexPath),
          fs.constants.O_RDONLY,
        );
        try {
          fs.fsyncSync(directory);
        } finally {
          fs.closeSync(directory);
        }
      } catch {
        // The atomic rename is the security boundary. Some platforms do not
        // permit fsync on directories, so durability there is best effort.
      }
    } catch (error) {
      if (error instanceof AriadneStateError) throw error;
      throw new AriadneStateError(
        "$git",
        "Unable to atomically install the certified Git index",
      );
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (!renamed) {
        try {
          fs.unlinkSync(lockPath);
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            // Preserve the primary publication error. A retained standard Git
            // lock makes subsequent mutations fail closed.
          }
        }
      }
    }
  }

  private restoreIndexIfSafe(state: {
    indexPath: string;
    indexMode: number;
    originalIndex: Buffer;
    publishedIndex: Buffer;
  }): boolean {
    try {
      this.assertIndexMatches(
        state.indexPath,
        state.publishedIndex,
        "published Git index",
      );
      this.atomicReplaceIndex(
        state.indexPath,
        state.publishedIndex,
        state.originalIndex,
        state.indexMode,
      );
      return true;
    } catch {
      return false;
    }
  }

  private indexTree(index: Buffer, indexPath: string, mode: number): string {
    const probePath = path.join(
      path.dirname(indexPath),
      `${path.basename(indexPath)}.ariadne-probe-${randomUUID()}`,
    );
    this.writeExclusive(probePath, index, mode);
    try {
      return this.require(
        ["write-tree"],
        "verify the certified Git index tree",
        this.privateIndexEnv(probePath),
      );
    } finally {
      this.removePrivateIndex(probePath);
    }
  }

  assertRepository(): void {
    const result = this.capture(["rev-parse", "--show-toplevel"]);
    if (!result.ok) {
      throw new AriadneStateError(
        "$git",
        `Ariadne requires a Git repository: ${this.root}`,
      );
    }

    let configuredRoot: string;
    let discoveredRoot: string;
    try {
      // Native realpath expands Windows 8.3 short names and normalizes case,
      // so both sides compare as the same canonical repository root.
      configuredRoot = fs.realpathSync.native(this.root);
      discoveredRoot = fs.realpathSync.native(result.stdout.trim());
    } catch {
      throw new AriadneStateError(
        "$git",
        "Ariadne could not resolve the Git repository root",
      );
    }
    if (configuredRoot !== discoveredRoot) {
      throw new AriadneStateError(
        "$git",
        `Ariadne must run from the repository root: ${discoveredRoot}`,
      );
    }
  }

  currentBranch(): string {
    return this.require(["branch", "--show-current"], "read current branch");
  }

  headRef(): string {
    const ref = this.require(
      ["symbolic-ref", "--quiet", "HEAD"],
      "read symbolic HEAD reference",
    );
    if (!ref.startsWith("refs/heads/") || /[\r\n]/.test(ref)) {
      throw new AriadneStateError(
        "$git",
        "Ariadne requires HEAD to name one fully-qualified branch reference",
      );
    }
    return ref;
  }

  head(): string {
    return this.require(["rev-parse", "HEAD"], "read HEAD");
  }

  private refObject(ref: string): string {
    const object = this.require(
      ["rev-parse", "--verify", `${ref}^{commit}`],
      `read certified reference ${ref}`,
    );
    if (!OBJECT_ID.test(object)) {
      throw new AriadneStateError(
        "$git",
        "Git returned an invalid certified reference object id",
      );
    }
    return object;
  }

  private captureRefState(): { ref: string; head: string } {
    const ref = this.headRef();
    const head = this.refObject(ref);
    const confirmedRef = this.headRef();
    const confirmedHead = this.head();
    if (confirmedRef !== ref || confirmedHead !== head) {
      throw new AriadneStateError(
        "$git",
        "Ariadne symbolic HEAD reference changed while it was certified",
      );
    }
    return { ref, head };
  }

  private assertRefState(
    expectedRef: string,
    expectedHead: string,
    phase: string,
  ): void {
    const observed = this.captureRefState();
    if (observed.ref !== expectedRef) {
      throw new AriadneStateError(
        "$git",
        `Ariadne certified symbolic HEAD reference changed ${phase}: expected ${expectedRef}, found ${observed.ref}`,
      );
    }
    if (observed.head !== expectedHead) {
      throw new AriadneStateError(
        "$git",
        `Ariadne certified HEAD changed ${phase}: expected ${expectedHead}, found ${observed.head}`,
      );
    }
  }

  statusPorcelain(): string {
    const result = this.capture([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    if (!result.ok) {
      const detail = result.stderr.trim() || result.stdout.trim();
      throw new AriadneStateError(
        "$git",
        `Unable to read worktree status (git exited ${result.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    return result.stdout;
  }

  assertReady(expectedBranch: string, allowActiveDiff: boolean): void {
    this.assertRepository();
    const actualBranch = this.currentBranch();
    if (actualBranch !== expectedBranch) {
      throw new AriadneStateError(
        "$git",
        `Ariadne expected branch ${JSON.stringify(expectedBranch)}, found ${JSON.stringify(actualBranch)}`,
      );
    }
    if (!allowActiveDiff && this.statusPorcelain() !== "") {
      throw new AriadneStateError(
        "$git",
        "Ariadne requires a clean worktree before starting",
      );
    }
  }

  private indexPaths(env?: NodeJS.ProcessEnv): string[] {
    const result = this.capture(["ls-files", "-z"], env);
    if (!result.ok) {
      throw new AriadneStateError("$git", "Unable to inspect the Git index");
    }
    return nulSeparatedPaths(result.stdout);
  }

  private treePaths(tree: string): string[] {
    const result = this.capture(["ls-tree", "-r", "--name-only", "-z", tree]);
    if (!result.ok) {
      throw new AriadneStateError("$git", "Unable to inspect the Git tree");
    }
    return nulSeparatedPaths(result.stdout);
  }

  private machineLocalIndexPaths(env?: NodeJS.ProcessEnv): string[] {
    return this.indexPaths(env).filter(isMachineLocalPath);
  }

  private machineLocalTreePaths(tree: string): string[] {
    return this.treePaths(tree).filter(isMachineLocalPath);
  }

  private assertMachineLocalBoundary(): void {
    const indexed = this.machineLocalIndexPaths();
    if (indexed.length > 0) {
      throw new AriadneStateError(
        "$git",
        `Ariadne machine-local artifacts are staged or present in the index: ${indexed.join(", ")}`,
      );
    }
    const tracked = this.machineLocalTreePaths("HEAD");
    if (tracked.length > 0) {
      throw new AriadneStateError(
        "$git",
        `Ariadne machine-local artifacts are tracked: ${tracked.join(", ")}`,
      );
    }
    for (const probe of MACHINE_LOCAL_IGNORE_PROBES) {
      const ignored = this.capture([
        "check-ignore",
        "--quiet",
        "--no-index",
        "--",
        probe,
      ]);
      if (!ignored.ok) {
        throw new AriadneStateError(
          "$git",
          `Ariadne machine-local paths must remain effectively ignored before staging: ${probe}`,
        );
      }
    }
  }

  private storyDeltaPaths(env?: NodeJS.ProcessEnv): string[] {
    const tracked = this.capture(["diff", "--name-only", "-z"], env);
    if (!tracked.ok) {
      throw new AriadneStateError(
        "$git",
        "Unable to inspect unstaged Ariadne story paths",
      );
    }
    const untracked = this.capture(
      ["ls-files", "--others", "--exclude-standard", "-z"],
      env,
    );
    if (!untracked.ok) {
      throw new AriadneStateError(
        "$git",
        "Unable to inspect untracked Ariadne story paths",
      );
    }
    const candidates = [
      ...new Set([
        ...nulSeparatedPaths(tracked.stdout),
        ...nulSeparatedPaths(untracked.stdout),
      ]),
    ];
    const unsafe = candidates.filter(isMachineLocalPath);
    if (unsafe.length > 0) {
      throw new AriadneStateError(
        "$git",
        `Ariadne found unignored machine-local paths in the project delta: ${unsafe.join(", ")}`,
      );
    }
    return candidates;
  }

  private assertCompleteDelta(env?: NodeJS.ProcessEnv): void {
    const remaining = this.storyDeltaPaths(env);
    if (remaining.length > 0) {
      throw new AriadneStateError(
        "$git",
        `Ariadne refuses an incomplete project delta: ${remaining.join(", ")}`,
      );
    }
  }

  stageAll(
    expectedHead?: string,
    expectedRef?: string,
  ): AriadneStageCertificate {
    this.discardPendingStage();
    this.publishedState = undefined;
    this.assertMachineLocalBoundary();
    const certifiedRef = this.captureRefState();
    if (expectedHead !== undefined && certifiedRef.head !== expectedHead) {
      throw new AriadneStateError(
        "$git",
        `Ariadne certified HEAD changed before private staging: expected ${expectedHead}, found ${certifiedRef.head}`,
      );
    }
    if (expectedRef !== undefined && certifiedRef.ref !== expectedRef) {
      throw new AriadneStateError(
        "$git",
        `Ariadne certified symbolic HEAD reference changed before private staging: expected ${expectedRef}, found ${certifiedRef.ref}`,
      );
    }

    const indexPath = this.gitIndexPath();
    const indexStat = fs.lstatSync(indexPath);
    const originalIndex = this.readRegularFile(indexPath, "shared Git index");
    const privateIndexPath = path.join(
      path.dirname(indexPath),
      `${path.basename(indexPath)}.ariadne-stage-${randomUUID()}`,
    );
    this.writeExclusive(privateIndexPath, originalIndex, indexStat.mode);
    const env = this.privateIndexEnv(privateIndexPath);

    try {
      const paths = this.storyDeltaPaths();
      for (let offset = 0; offset < paths.length; offset += STAGE_BATCH_SIZE) {
        this.require(
          [
            "add",
            "--all",
            "--",
            ...paths
              .slice(offset, offset + STAGE_BATCH_SIZE)
              .map(literalPathspec),
          ],
          "stage the Ariadne story delta in the private index",
          env,
        );
      }
      this.assertCompleteDelta(env);
      const tree = this.require(
        ["write-tree"],
        "write the certified private Git tree",
        env,
      );
      if (!OBJECT_ID.test(tree)) {
        throw new AriadneStateError(
          "$git",
          "Git returned an invalid certified tree object id",
        );
      }
      const unsafe = this.machineLocalTreePaths(tree);
      if (unsafe.length > 0) {
        throw new AriadneStateError(
          "$git",
          `Ariadne candidate tree contains machine-local artifacts: ${unsafe.join(", ")}`,
        );
      }
      const privateIndex = this.readRegularFile(
        privateIndexPath,
        "private Git index",
      );
      this.assertRefState(
        certifiedRef.ref,
        certifiedRef.head,
        "during private staging",
      );
      this.assertMachineLocalBoundary();
      this.assertIndexMatches(
        indexPath,
        originalIndex,
        "shared Git index during private staging",
      );
      this.assertCompleteDelta(env);

      this.pendingStage = {
        parentHead: certifiedRef.head,
        ref: certifiedRef.ref,
        tree,
        indexPath,
        indexMode: indexStat.mode,
        originalIndex,
        privateIndex,
        privateIndexPath,
      };
      return { parentHead: certifiedRef.head, ref: certifiedRef.ref, tree };
    } catch (error) {
      this.removePrivateIndex(privateIndexPath);
      throw error;
    }
  }

  private assertPrePublication(
    stage: PendingStage,
    assertPublicationBoundary: () => void,
  ): void {
    const inspect = (): void => {
      this.assertRefState(
        stage.ref,
        stage.parentHead,
        "before reference publication",
      );
      this.assertIndexMatches(
        stage.indexPath,
        stage.originalIndex,
        "shared Git index before reference publication",
      );
      this.assertIndexMatches(
        stage.privateIndexPath,
        stage.privateIndex,
        "private Git index before reference publication",
      );
      this.assertMachineLocalBoundary();
      this.assertCompleteDelta(this.privateIndexEnv(stage.privateIndexPath));
    };
    inspect();
    assertPublicationBoundary();
    inspect();
  }

  private assertPublishedState(state: PublishedState): void {
    this.assertRefState(state.ref, state.commit, "after reference publication");
    this.assertIndexMatches(
      state.indexPath,
      state.publishedIndex,
      "published Git index",
    );
    const tree = this.indexTree(
      state.publishedIndex,
      state.indexPath,
      state.indexMode,
    );
    if (tree !== state.tree) {
      throw new AriadneStateError(
        "$git",
        "Ariadne published Git index no longer matches the certified tree",
      );
    }
    this.assertMachineLocalBoundary();
    this.assertCompleteDelta();
  }

  private disabledHooksPath(): string {
    return path.join(os.tmpdir(), `ariadne-disabled-hooks-${randomUUID()}`);
  }

  private rollbackPublishedState(state: PublishedState): {
    ref: boolean;
    index: boolean;
  } {
    const rolledBackRef = this.capture([
      "-c",
      `core.hooksPath=${this.disabledHooksPath()}`,
      "update-ref",
      "-m",
      `ariadne rollback ${state.commit}`,
      state.ref,
      state.parentHead,
      state.commit,
    ]).ok;
    const restoredIndex = this.restoreIndexIfSafe(state);
    return { ref: rolledBackRef, index: restoredIndex };
  }

  commit(
    story: AriadneStory,
    expectedHead: string,
    assertPublicationBoundary: () => void = () => {},
    expectedRef?: string,
  ): string {
    if (/\r|\n/.test(story.id) || /\r|\n/.test(story.title)) {
      throw new AriadneStateError(
        "$git",
        "Ariadne commit IDs and titles cannot contain newlines",
      );
    }
    const stage = this.pendingStage;
    if (!stage) {
      throw new AriadneStateError(
        "$git",
        "Ariadne requires a certified private stage before publication",
      );
    }
    if (stage.parentHead !== expectedHead) {
      throw new AriadneStateError(
        "$git",
        `Ariadne private stage parent differs from the certified HEAD: expected ${expectedHead}, found ${stage.parentHead}`,
      );
    }
    if (expectedRef !== undefined && stage.ref !== expectedRef) {
      throw new AriadneStateError(
        "$git",
        `Ariadne private stage reference differs from the certified reference: expected ${expectedRef}, found ${stage.ref}`,
      );
    }

    const message = `feat(ariadne): ${story.id} ${story.title}`;
    let commitObject: string | undefined;
    let installed = false;
    let published = false;
    try {
      this.assertPrePublication(stage, assertPublicationBoundary);
      commitObject = this.require(
        ["commit-tree", stage.tree, "-p", stage.parentHead, "-m", message],
        "create the certified Ariadne commit object",
      );
      if (!OBJECT_ID.test(commitObject)) {
        throw new AriadneStateError(
          "$git",
          "Git returned an invalid Ariadne commit object id",
        );
      }
      this.assertPrePublication(stage, assertPublicationBoundary);

      this.atomicReplaceIndex(
        stage.indexPath,
        stage.originalIndex,
        stage.privateIndex,
        stage.indexMode,
      );
      installed = true;
      this.assertIndexMatches(
        stage.indexPath,
        stage.privateIndex,
        "installed certified Git index",
      );
      const installedTree = this.indexTree(
        stage.privateIndex,
        stage.indexPath,
        stage.indexMode,
      );
      if (installedTree !== stage.tree) {
        throw new AriadneStateError(
          "$git",
          "Installed Git index differs from the certified tree",
        );
      }
      this.assertRefState(
        stage.ref,
        stage.parentHead,
        "immediately before reference publication",
      );
      this.assertMachineLocalBoundary();
      this.assertCompleteDelta();
      assertPublicationBoundary();
      this.assertRefState(
        stage.ref,
        stage.parentHead,
        "at reference publication",
      );
      this.assertIndexMatches(
        stage.indexPath,
        stage.privateIndex,
        "installed certified Git index at reference publication",
      );
      this.assertCompleteDelta();

      this.require(
        [
          "-c",
          `core.hooksPath=${this.disabledHooksPath()}`,
          "update-ref",
          "-m",
          message,
          stage.ref,
          commitObject,
          stage.parentHead,
        ],
        "publish the certified Ariadne commit",
      );
      published = true;
      const state: PublishedState = {
        commit: commitObject,
        parentHead: stage.parentHead,
        ref: stage.ref,
        tree: stage.tree,
        indexPath: stage.indexPath,
        indexMode: stage.indexMode,
        originalIndex: stage.originalIndex,
        publishedIndex: stage.privateIndex,
      };
      this.assertPublishedState(state);
      this.publishedState = state;
      return commitObject;
    } catch (error) {
      let state: PublishedState | undefined;
      if (commitObject) {
        state = {
          commit: commitObject,
          parentHead: stage.parentHead,
          ref: stage.ref,
          tree: stage.tree,
          indexPath: stage.indexPath,
          indexMode: stage.indexMode,
          originalIndex: stage.originalIndex,
          publishedIndex: stage.privateIndex,
        };
      }
      if (!published && state) {
        try {
          published = this.refObject(stage.ref) === commitObject;
        } catch {
          published = false;
        }
      }
      if (published && state) {
        const recovery = this.rollbackPublishedState(state);
        this.publishedState = undefined;
        throw new AriadneStateError(
          "$git",
          `Ariadne post-publication verification failed; explicit ref rollback ${recovery.ref ? "succeeded" : "failed"} and original index restore ${recovery.index ? "succeeded" : "was not safe"}`,
        );
      }
      if (installed && state) this.restoreIndexIfSafe(state);
      throw error;
    } finally {
      this.pendingStage = undefined;
      try {
        this.removePrivateIndex(stage.privateIndexPath);
      } catch {
        // The private index is unreachable from the worktree and certified ref.
        // Cleanup failure must never overturn an already verified publication
        // or mask the primary rollback result.
      }
    }
  }

  assertPublished(commit?: string): void {
    const state = this.publishedState;
    if (!state || (commit !== undefined && commit !== state.commit)) {
      throw new AriadneStateError(
        "$git",
        "Ariadne has no matching publication certificate",
      );
    }
    try {
      this.assertPublishedState(state);
    } catch {
      const recovery = this.rollbackPublishedState(state);
      this.publishedState = undefined;
      throw new AriadneStateError(
        "$git",
        `Ariadne published state changed after certification; explicit ref rollback ${recovery.ref ? "succeeded" : "failed"} and original index restore ${recovery.index ? "succeeded" : "was not safe"}`,
      );
    }
  }

  publicationCertificate(): AriadnePublicationCertificate | undefined {
    const state = this.publishedState;
    if (!state) return undefined;
    return {
      commit: state.commit,
      parentHead: state.parentHead,
      ref: state.ref,
      tree: state.tree,
    };
  }
}
