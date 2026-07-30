import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AriadneStateError, validateConfig, validatePrd } from "./schema.js";
import type {
  AriadneConfig,
  AriadneOwnershipViolation,
  AriadneOwnershipViolationChange,
  AriadnePrd,
} from "./types.js";

export type AriadnePaths = {
  root: string;
  config: string;
  prd: string;
  progress: string;
  lock: string;
  runs: string;
  ownershipViolation: string;
  ownershipCheckpoint: string;
  archive: string;
};

export type AriadnePathIdentity = {
  source: string;
  kind: "directory" | "file";
  device: number;
  inode: number;
  links: number;
};

export type AriadneCanonicalFileCertificate = AriadnePathIdentity & {
  kind: "file";
  contents: string;
};

export type AriadneExternalFileIdentity = Pick<
  AriadnePathIdentity,
  "source" | "device" | "inode" | "links"
>;

export type AriadneRunBoundary = {
  runId: string;
  root: AriadnePathIdentity;
  runs: AriadnePathIdentity;
  directory: AriadnePathIdentity;
  artifacts: AriadnePathIdentity[];
};

export type AriadnePersistedCanonicalCertificate = Pick<
  AriadneCanonicalFileCertificate,
  "device" | "inode" | "links"
> & { sha256: string };

export type AriadneOwnershipCheckpoint = {
  schemaVersion: 1;
  runId: string;
  storyId: string;
  certifiedAt: string;
  certifiedHead: string;
  certifiedRef: string;
  prd: AriadnePersistedCanonicalCertificate;
  progress: AriadnePersistedCanonicalCertificate;
};

export const ARIADNE_OWNERSHIP_CHECKPOINT_MARKER =
  "<!-- ariadne-ownership-checkpoint:v1 -->";

const OWNERSHIP_CHANGES = new Set<AriadneOwnershipViolationChange>([
  "head",
  "prd",
  "progress",
  "operational",
]);

function ownershipMarkerError(message: string): never {
  throw new AriadneStateError(
    ".ariadne-quarantine.json",
    `invalid ownership violation marker: ${message}`,
  );
}

function validateOwnershipViolation(input: unknown): AriadneOwnershipViolation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    ownershipMarkerError("expected an object");
  }
  const marker = input as Record<string, unknown>;
  const allowed = new Set([
    "schemaVersion",
    "runId",
    "storyId",
    "detectedAt",
    "certifiedHead",
    "observedHead",
    "certifiedRef",
    "observedRef",
    "changed",
  ]);
  if (Object.keys(marker).some((key) => !allowed.has(key))) {
    ownershipMarkerError("contains an unsupported field");
  }
  if (marker.schemaVersion !== 1) {
    ownershipMarkerError("expected schema version 1");
  }
  for (const key of [
    "runId",
    "storyId",
    "detectedAt",
    "certifiedHead",
    "observedHead",
  ] as const) {
    if (typeof marker[key] !== "string" || marker[key].trim() === "") {
      ownershipMarkerError(`${key} must be a non-empty string`);
    }
  }
  const hasCertifiedRef = marker.certifiedRef !== undefined;
  const hasObservedRef = marker.observedRef !== undefined;
  if (hasCertifiedRef !== hasObservedRef) {
    ownershipMarkerError(
      "certifiedRef and observedRef must either both be present or both be absent",
    );
  }
  if (
    hasCertifiedRef &&
    (typeof marker.certifiedRef !== "string" ||
      marker.certifiedRef.trim() === "" ||
      typeof marker.observedRef !== "string" ||
      marker.observedRef.trim() === "")
  ) {
    ownershipMarkerError(
      "certifiedRef and observedRef must be non-empty strings",
    );
  }
  if (Number.isNaN(Date.parse(marker.detectedAt as string))) {
    ownershipMarkerError("detectedAt must be an ISO timestamp");
  }
  if (
    !Array.isArray(marker.changed) ||
    marker.changed.length === 0 ||
    marker.changed.some(
      (change) =>
        typeof change !== "string" ||
        !OWNERSHIP_CHANGES.has(change as AriadneOwnershipViolationChange),
    ) ||
    new Set(marker.changed).size !== marker.changed.length
  ) {
    ownershipMarkerError("changed must contain unique ownership surfaces");
  }
  return {
    schemaVersion: 1,
    runId: marker.runId as string,
    storyId: marker.storyId as string,
    detectedAt: marker.detectedAt as string,
    certifiedHead: marker.certifiedHead as string,
    observedHead: marker.observedHead as string,
    ...(hasCertifiedRef
      ? {
          certifiedRef: marker.certifiedRef as string,
          observedRef: marker.observedRef as string,
        }
      : {}),
    changed: [...marker.changed] as AriadneOwnershipViolationChange[],
  };
}

function checkpointError(message: string): never {
  throw new AriadneStateError(
    ".ariadne-quarantine.checkpoint.json",
    `invalid ownership checkpoint: ${message}`,
  );
}

function validatePersistedCertificate(
  value: unknown,
  label: string,
): AriadnePersistedCanonicalCertificate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    checkpointError(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => !["device", "inode", "links", "sha256"].includes(key),
    ) ||
    !Number.isSafeInteger(record.device) ||
    !Number.isSafeInteger(record.inode) ||
    record.links !== 1 ||
    typeof record.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/i.test(record.sha256)
  ) {
    checkpointError(`${label} contains invalid certificate fields`);
  }
  return {
    device: record.device as number,
    inode: record.inode as number,
    links: 1,
    sha256: (record.sha256 as string).toLowerCase(),
  };
}

function validateOwnershipCheckpoint(
  input: unknown,
): AriadneOwnershipCheckpoint {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    checkpointError("expected an object");
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set([
    "schemaVersion",
    "runId",
    "storyId",
    "certifiedAt",
    "certifiedHead",
    "certifiedRef",
    "prd",
    "progress",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    checkpointError("contains an unsupported field");
  }
  if (record.schemaVersion !== 1) checkpointError("expected schema version 1");
  for (const key of [
    "runId",
    "storyId",
    "certifiedAt",
    "certifiedHead",
    "certifiedRef",
  ] as const) {
    if (typeof record[key] !== "string" || record[key].trim() === "") {
      checkpointError(`${key} must be a non-empty string`);
    }
  }
  if (Number.isNaN(Date.parse(record.certifiedAt as string))) {
    checkpointError("certifiedAt must be an ISO timestamp");
  }
  return {
    schemaVersion: 1,
    runId: record.runId as string,
    storyId: record.storyId as string,
    certifiedAt: record.certifiedAt as string,
    certifiedHead: record.certifiedHead as string,
    certifiedRef: record.certifiedRef as string,
    prd: validatePersistedCertificate(record.prd, "prd"),
    progress: validatePersistedCertificate(record.progress, "progress"),
  };
}

function safePathPart(value: string, label: string): string {
  if (
    !value ||
    path.basename(value) !== value ||
    value === "." ||
    value === ".."
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

export class AriadneStore {
  readonly paths: AriadnePaths;

  constructor(readonly projectRoot: string) {
    const root = path.join(projectRoot, ".ariadne");
    this.paths = {
      root,
      config: path.join(root, "config.json"),
      prd: path.join(root, "prd.json"),
      progress: path.join(root, "progress.md"),
      lock: path.join(root, "lock"),
      runs: path.join(root, "runs"),
      ownershipViolation: path.join(projectRoot, ".ariadne-quarantine.json"),
      ownershipCheckpoint: path.join(
        projectRoot,
        ".ariadne-quarantine.checkpoint.json",
      ),
      archive: path.join(root, "archive"),
    };
  }

  ensureLayout(): void {
    this.ensureRealDirectory(this.paths.root, "Ariadne state directory");
    this.ensureRealDirectory(this.paths.archive, "Ariadne archive directory");
  }

  loadConfig(): AriadneConfig {
    return validateConfig(this.readJson(this.paths.config));
  }

  loadPrd(): AriadnePrd {
    return validatePrd(this.readJson(this.paths.prd));
  }

  hasCanonicalState(): boolean {
    return fs.existsSync(this.paths.prd) && fs.existsSync(this.paths.progress);
  }

  saveConfig(config: AriadneConfig): void {
    this.writeJsonAtomic(this.paths.config, validateConfig(config));
  }

  savePrd(prd: AriadnePrd): AriadneCanonicalFileCertificate {
    return this.writeJsonAtomic(this.paths.prd, validatePrd(prd));
  }

  loadOwnershipViolation(): AriadneOwnershipViolation | undefined {
    const contents = this.readProjectRootFile(
      this.paths.ownershipViolation,
      "ownership violation marker",
    );
    if (contents === undefined) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(contents) as unknown;
    } catch {
      ownershipMarkerError("contains malformed JSON");
    }
    return validateOwnershipViolation(value);
  }

  saveOwnershipViolation(marker: AriadneOwnershipViolation): void {
    this.writeQuarantineAtomic(validateOwnershipViolation(marker));
  }

  loadOwnershipCheckpoint(): AriadneOwnershipCheckpoint | undefined {
    const contents = this.readProjectRootFile(
      this.paths.ownershipCheckpoint,
      "ownership checkpoint",
    );
    if (contents === undefined) return undefined;
    try {
      return validateOwnershipCheckpoint(JSON.parse(contents) as unknown);
    } catch (error) {
      if (error instanceof AriadneStateError) throw error;
      checkpointError("contains malformed JSON");
    }
  }

  saveOwnershipCheckpoint(input: {
    runId: string;
    storyId: string;
    certifiedAt: string;
    certifiedHead: string;
    certifiedRef: string;
    prd: AriadneCanonicalFileCertificate;
    progress: AriadneCanonicalFileCertificate;
  }): AriadneOwnershipCheckpoint {
    if (input.prd.source !== this.paths.prd) {
      checkpointError("prd certificate has an unexpected source");
    }
    if (input.progress.source !== this.paths.progress) {
      checkpointError("progress certificate has an unexpected source");
    }
    this.assertCanonicalCertificate(input.prd);
    this.assertCanonicalCertificate(input.progress);
    const certificate = (
      value: AriadneCanonicalFileCertificate,
    ): AriadnePersistedCanonicalCertificate => ({
      device: value.device,
      inode: value.inode,
      links: value.links,
      sha256: createHash("sha256").update(value.contents).digest("hex"),
    });
    const checkpoint = validateOwnershipCheckpoint({
      schemaVersion: 1,
      runId: input.runId,
      storyId: input.storyId,
      certifiedAt: input.certifiedAt,
      certifiedHead: input.certifiedHead,
      certifiedRef: input.certifiedRef,
      prd: certificate(input.prd),
      progress: certificate(input.progress),
    });
    this.writeProjectRootAtomic(
      this.paths.ownershipCheckpoint,
      checkpoint,
      ".ariadne-quarantine.checkpoint.tmp-",
      "Ariadne ownership checkpoint",
    );
    return checkpoint;
  }

  ownershipCheckpointChanges(
    checkpoint: AriadneOwnershipCheckpoint,
  ): AriadneOwnershipViolationChange[] {
    const changes: AriadneOwnershipViolationChange[] = [];
    const changed = (
      source: string,
      expected: AriadnePersistedCanonicalCertificate,
    ): boolean => {
      try {
        const actual = this.captureCanonicalCertificate(source);
        return (
          actual.device !== expected.device ||
          actual.inode !== expected.inode ||
          actual.links !== expected.links ||
          createHash("sha256").update(actual.contents).digest("hex") !==
            expected.sha256
        );
      } catch {
        return true;
      }
    };
    if (changed(this.paths.prd, checkpoint.prd)) changes.push("prd");
    if (changed(this.paths.progress, checkpoint.progress)) {
      changes.push("progress");
    }
    return changes;
  }

  ownershipCheckpointRequired(): boolean {
    if (!fs.existsSync(this.paths.progress) && !fs.existsSync(this.paths.prd)) {
      return false;
    }
    return this.captureCanonicalCertificate(
      this.paths.progress,
    ).contents.includes(ARIADNE_OWNERSHIP_CHECKPOINT_MARKER);
  }

  assertNoOwnershipViolation(): void {
    const violation = this.loadOwnershipViolation();
    if (!violation) return;
    throw new AriadneStateError(
      ".ariadne-quarantine.json",
      `Unresolved runtime ownership violation from run ${violation.runId} (${violation.changed.join(", ")}); inspect and restore Git/canonical state, then deliberately remove ${this.paths.ownershipViolation}`,
    );
  }

  appendProgress(
    entry: string,
    expected?: AriadneCanonicalFileCertificate,
  ): AriadneCanonicalFileCertificate {
    this.ensureRealDirectory(this.paths.root, "Ariadne state directory");
    const flags =
      fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW;
    let descriptor: number;
    try {
      descriptor = fs.openSync(this.paths.progress, flags);
    } catch {
      throw new AriadneStateError(
        this.paths.progress,
        "Ariadne progress file is unavailable or unsafe",
      );
    }
    try {
      const before = this.certificateFromDescriptor(
        this.paths.progress,
        descriptor,
        "Ariadne progress",
      );
      if (expected && !this.sameCertificate(before, expected)) {
        throw new AriadneStateError(
          this.paths.progress,
          "Ariadne progress changed before the coordinator append",
        );
      }
      const addition = `${entry}\n`;
      fs.writeFileSync(descriptor, addition, "utf8");
      fs.fsyncSync(descriptor);
      const afterStat = fs.fstatSync(descriptor);
      const after = {
        source: this.paths.progress,
        kind: "file",
        device: afterStat.dev,
        inode: afterStat.ino,
        links: afterStat.nlink,
        contents: `${before.contents}${addition}`,
      } satisfies AriadneCanonicalFileCertificate;
      this.assertCanonicalCertificate(after);
      return after;
    } finally {
      fs.closeSync(descriptor);
    }
  }

  captureCanonicalCertificate(source: string): AriadneCanonicalFileCertificate {
    const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
    let descriptor: number;
    try {
      descriptor = fs.openSync(source, flags);
    } catch {
      throw new AriadneStateError(
        source,
        "Ariadne canonical state is unavailable or unsafe",
      );
    }
    try {
      return this.certificateFromDescriptor(
        source,
        descriptor,
        "Ariadne canonical state",
      );
    } finally {
      fs.closeSync(descriptor);
    }
  }

  assertCanonicalCertificate(
    certificate: AriadneCanonicalFileCertificate,
  ): void {
    const current = this.captureCanonicalCertificate(certificate.source);
    if (!this.sameCertificate(current, certificate)) {
      throw new AriadneStateError(
        certificate.source,
        "Coordinator-owned canonical Ariadne state changed after coordinator certification",
      );
    }
  }

  createRunDir(runId: string): string {
    const safeRunId = safePathPart(runId, "run id");
    this.ensureRunsDirectory();
    const directory = path.join(this.paths.runs, safeRunId);
    this.ensureRealDirectory(directory, "Ariadne run directory");
    return this.assertRunDirectory(safeRunId);
  }

  assertRunDirectory(runId: string): string {
    const safeRunId = safePathPart(runId, "run id");
    this.assertRealDirectory(this.paths.root, "Ariadne state directory");
    this.assertRealDirectory(this.paths.runs, "Ariadne runs directory");
    const directory = path.join(this.paths.runs, safeRunId);
    this.assertRealDirectory(directory, "Ariadne run directory");
    const canonicalRuns = fs.realpathSync(this.paths.runs);
    const canonicalDirectory = fs.realpathSync(directory);
    if (path.dirname(canonicalDirectory) !== canonicalRuns) {
      throw new AriadneStateError(
        directory,
        "Ariadne run directory escaped the machine-local runs root",
      );
    }
    return directory;
  }

  assertRunArtifacts(runId: string, names: string[]): void {
    const directory = this.assertRunDirectory(runId);
    for (const name of names) {
      const safeName = safePathPart(name, "run file name");
      const source = path.join(directory, safeName);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(source);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (stat.isSymbolicLink()) {
        throw new AriadneStateError(
          source,
          "Ariadne run artifact must not be a symbolic link",
        );
      }
      if (!stat.isFile()) {
        throw new AriadneStateError(
          source,
          "Ariadne run artifact must be a regular file",
        );
      }
      if (stat.nlink !== 1) {
        throw new AriadneStateError(
          source,
          "Ariadne run artifact must have a single link and must not be hard-linked",
        );
      }
    }
  }

  assertRunDirectoryContents(runId: string): void {
    const directory = this.assertRunDirectory(runId);
    this.assertRunArtifacts(runId, fs.readdirSync(directory));
  }

  certifyRunBoundary(
    runId: string,
    requiredArtifacts: string[] = [],
    expectedArtifacts: AriadneExternalFileIdentity[] = [],
  ): AriadneRunBoundary {
    const safeRunId = safePathPart(runId, "run id");
    const directory = this.assertRunDirectory(safeRunId);
    const artifacts = requiredArtifacts.map((name) => {
      const safeName = safePathPart(name, "run file name");
      return this.capturePathIdentity(
        path.join(directory, safeName),
        "file",
        "Ariadne required run artifact",
      );
    });
    const boundary = {
      runId: safeRunId,
      root: this.capturePathIdentity(
        this.paths.root,
        "directory",
        "Ariadne state directory",
      ),
      runs: this.capturePathIdentity(
        this.paths.runs,
        "directory",
        "Ariadne runs directory",
      ),
      directory: this.capturePathIdentity(
        directory,
        "directory",
        "Ariadne run directory",
      ),
      artifacts,
    } satisfies AriadneRunBoundary;
    this.assertExpectedArtifacts(boundary, expectedArtifacts);
    this.assertRunBoundary(boundary);
    return boundary;
  }

  extendRunBoundary(
    boundary: AriadneRunBoundary,
    expectedArtifacts: AriadneExternalFileIdentity[],
  ): AriadneRunBoundary {
    this.assertRunBoundary(boundary);
    const expectedDirectory = boundary.directory.source;
    const additions = expectedArtifacts.map((expected) => {
      if (path.dirname(expected.source) !== expectedDirectory) {
        throw new AriadneStateError(
          expected.source,
          "Ariadne output identity escaped the certified run directory",
        );
      }
      const captured = this.capturePathIdentity(
        expected.source,
        "file",
        "Ariadne certified output artifact",
      );
      if (!this.sameIdentity(captured, expected)) {
        throw new AriadneStateError(
          expected.source,
          "Ariadne output identity changed before run-boundary certification",
        );
      }
      return captured;
    });
    const sources = new Set(
      boundary.artifacts.map((artifact) => artifact.source),
    );
    if (additions.some((artifact) => sources.has(artifact.source))) {
      throw new AriadneStateError(
        expectedDirectory,
        "Ariadne run boundary cannot certify an artifact twice",
      );
    }
    const extended = {
      ...boundary,
      artifacts: [...boundary.artifacts, ...additions],
    } satisfies AriadneRunBoundary;
    this.assertRunBoundary(extended);
    return extended;
  }

  assertRunBoundary(boundary: AriadneRunBoundary): void {
    const safeRunId = safePathPart(boundary.runId, "run id");
    const expectedDirectory = path.join(this.paths.runs, safeRunId);
    if (
      boundary.root.source !== this.paths.root ||
      boundary.runs.source !== this.paths.runs ||
      boundary.directory.source !== expectedDirectory ||
      boundary.artifacts.some(
        (artifact) => path.dirname(artifact.source) !== expectedDirectory,
      )
    ) {
      throw new AriadneStateError(
        expectedDirectory,
        "Ariadne run boundary does not match the managed state layout",
      );
    }
    this.assertPathIdentity(boundary.root);
    this.assertPathIdentity(boundary.runs);
    this.assertPathIdentity(boundary.directory);
    for (const artifact of boundary.artifacts) {
      this.assertPathIdentity(artifact);
    }
    this.assertRunDirectoryContents(safeRunId);
  }

  writeRunJson(runId: string, name: string, value: unknown): string {
    const destination = path.join(
      this.createRunDir(runId),
      safePathPart(name, "run file name"),
    );
    this.writeJsonAtomic(destination, value);
    return destination;
  }

  writeRunTextExclusive(
    runId: string,
    name: string,
    contents: string,
  ): AriadnePathIdentity {
    const destination = path.join(
      this.createRunDir(runId),
      safePathPart(name, "run file name"),
    );
    let descriptor: number;
    try {
      descriptor = fs.openSync(destination, "wx", 0o600);
    } catch {
      throw new AriadneStateError(
        destination,
        "Ariadne run artifact already exists or cannot be created safely",
      );
    }
    try {
      fs.writeFileSync(descriptor, contents, "utf8");
      fs.fsyncSync(descriptor);
      const stat = fs.fstatSync(descriptor);
      const identity = {
        source: destination,
        kind: "file",
        device: stat.dev,
        inode: stat.ino,
        links: stat.nlink,
      } satisfies AriadnePathIdentity;
      this.assertPathIdentity(identity);
      return identity;
    } finally {
      fs.closeSync(descriptor);
    }
  }

  archiveImportedPrd(sourceText: string, timestamp: string): string {
    const normalized = new Date(timestamp)
      .toISOString()
      .replace(/:/g, "-")
      .replace(".", "-");
    const destination = path.join(
      this.paths.archive,
      `import-${normalized}`,
      "prd.json",
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, sourceText, "utf8");
    return destination;
  }

  private readJson(source: string): unknown {
    let contents: string;
    try {
      contents = fs.readFileSync(source, "utf8");
    } catch {
      throw new AriadneStateError(source, "unable to read Ariadne state");
    }
    try {
      return JSON.parse(contents) as unknown;
    } catch {
      throw new AriadneStateError(source, "contains malformed JSON");
    }
  }

  private assertRealDirectory(source: string, label: string): void {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(source);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw error;
      throw new AriadneStateError(source, `${label} is unavailable`);
    }
    if (stat.isSymbolicLink()) {
      throw new AriadneStateError(
        source,
        `${label} must not be a symbolic link`,
      );
    }
    if (!stat.isDirectory()) {
      throw new AriadneStateError(source, `${label} must be a directory`);
    }
  }

  private capturePathIdentity(
    source: string,
    kind: AriadnePathIdentity["kind"],
    label: string,
  ): AriadnePathIdentity {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(source);
    } catch {
      throw new AriadneStateError(source, `${label} is unavailable`);
    }
    if (
      stat.isSymbolicLink() ||
      (kind === "directory" ? !stat.isDirectory() : !stat.isFile())
    ) {
      throw new AriadneStateError(source, `${label} must be a real ${kind}`);
    }
    if (kind === "file" && stat.nlink !== 1) {
      throw new AriadneStateError(
        source,
        `${label} must have a single link and must not be hard-linked`,
      );
    }
    return {
      source,
      kind,
      device: stat.dev,
      inode: stat.ino,
      links: stat.nlink,
    };
  }

  private assertPathIdentity(identity: AriadnePathIdentity): void {
    const current = this.capturePathIdentity(
      identity.source,
      identity.kind,
      `Ariadne ${identity.kind} boundary`,
    );
    if (
      current.device !== identity.device ||
      current.inode !== identity.inode ||
      (identity.kind === "file" && current.links !== identity.links)
    ) {
      throw new AriadneStateError(
        identity.source,
        `Ariadne ${identity.kind} boundary changed during the run`,
      );
    }
  }

  private ensureRealDirectory(source: string, label: string): void {
    try {
      this.assertRealDirectory(source, label);
      return;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    fs.mkdirSync(source, { mode: 0o700 });
    this.assertRealDirectory(source, label);
  }

  private ensureRunsDirectory(): void {
    this.ensureRealDirectory(this.paths.root, "Ariadne state directory");
    this.ensureRealDirectory(this.paths.runs, "Ariadne runs directory");
  }

  private assertProjectRoot(): void {
    this.assertRealDirectory(this.projectRoot, "Ariadne project root");
  }

  private readProjectRootFile(
    source: string,
    label: string,
  ): string | undefined {
    this.assertProjectRoot();
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(
        source,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new AriadneStateError(
        source,
        `${label} must be a regular non-symbolic file`,
      );
    }
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.nlink !== 1) {
        throw new AriadneStateError(
          source,
          `${label} must be a regular non-symbolic single-link file`,
        );
      }
      const pathIdentity = this.capturePathIdentity(source, "file", label);
      if (
        pathIdentity.device !== stat.dev ||
        pathIdentity.inode !== stat.ino ||
        pathIdentity.links !== stat.nlink
      ) {
        throw new AriadneStateError(source, `${label} changed while open`);
      }
      const contents = fs.readFileSync(descriptor, "utf8");
      this.assertPathIdentity(pathIdentity);
      return contents;
    } finally {
      fs.closeSync(descriptor);
    }
  }

  private sameIdentity(
    left: AriadneExternalFileIdentity,
    right: AriadneExternalFileIdentity,
  ): boolean {
    return (
      left.source === right.source &&
      left.device === right.device &&
      left.inode === right.inode &&
      left.links === right.links
    );
  }

  private sameCertificate(
    left: AriadneCanonicalFileCertificate,
    right: AriadneCanonicalFileCertificate,
  ): boolean {
    return this.sameIdentity(left, right) && left.contents === right.contents;
  }

  private assertExpectedArtifacts(
    boundary: AriadneRunBoundary,
    expectedArtifacts: AriadneExternalFileIdentity[],
  ): void {
    for (const expected of expectedArtifacts) {
      const actual = boundary.artifacts.find(
        (artifact) => artifact.source === expected.source,
      );
      if (!actual || !this.sameIdentity(actual, expected)) {
        throw new AriadneStateError(
          expected.source,
          "Ariadne run artifact does not match its creator-certified identity",
        );
      }
    }
  }

  private certificateFromDescriptor(
    source: string,
    descriptor: number,
    label: string,
  ): AriadneCanonicalFileCertificate {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new AriadneStateError(
        source,
        `${label} must be a regular single-link file`,
      );
    }
    const pathIdentity = this.capturePathIdentity(source, "file", label);
    const identity = {
      source,
      kind: "file",
      device: stat.dev,
      inode: stat.ino,
      links: stat.nlink,
    } satisfies AriadnePathIdentity;
    if (!this.sameIdentity(pathIdentity, identity)) {
      throw new AriadneStateError(source, `${label} path changed while open`);
    }
    const contents = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < contents.length) {
      const read = fs.readSync(
        descriptor,
        contents,
        offset,
        contents.length - offset,
        offset,
      );
      if (read === 0) break;
      offset += read;
    }
    if (offset !== contents.length) {
      throw new AriadneStateError(source, `${label} changed while being read`);
    }
    this.assertPathIdentity(identity);
    return { ...identity, contents: contents.toString("utf8") };
  }

  private writeQuarantineAtomic(marker: AriadneOwnershipViolation): void {
    this.writeProjectRootAtomic(
      this.paths.ownershipViolation,
      marker,
      ".ariadne-quarantine.tmp-",
      "Ariadne quarantine marker",
    );
  }

  private writeProjectRootAtomic(
    destination: string,
    value: unknown,
    temporaryPrefix: string,
    label: string,
  ): void {
    this.assertProjectRoot();
    const temporary = path.join(
      this.projectRoot,
      `${temporaryPrefix}${randomUUID()}`,
    );
    try {
      const descriptor = fs.openSync(temporary, "wx", 0o600);
      try {
        fs.writeFileSync(
          descriptor,
          `${JSON.stringify(value, null, 2)}\n`,
          "utf8",
        );
        fs.fsyncSync(descriptor);
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.nlink !== 1) {
          throw new AriadneStateError(
            temporary,
            `${label} temporary must be a regular single-link file`,
          );
        }
      } finally {
        fs.closeSync(descriptor);
      }
      this.assertProjectRoot();
      fs.renameSync(temporary, destination);
      this.capturePathIdentity(destination, "file", label);
      const parentDescriptor = fs.openSync(this.projectRoot, "r");
      try {
        fs.fsyncSync(parentDescriptor);
      } finally {
        fs.closeSync(parentDescriptor);
      }
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  private writeJsonAtomic(
    destination: string,
    value: unknown,
  ): AriadneCanonicalFileCertificate {
    const parent = path.dirname(destination);
    if (parent === this.paths.root) {
      this.ensureRealDirectory(parent, "Ariadne state directory");
    } else if (parent === this.paths.runs) {
      this.ensureRunsDirectory();
    } else if (path.dirname(parent) === this.paths.runs) {
      this.assertRunDirectory(path.basename(parent));
    } else {
      throw new AriadneStateError(
        destination,
        "Ariadne atomic write escaped the managed state layout",
      );
    }
    const temporary = `${destination}.tmp-${randomUUID()}`;
    const contents = `${JSON.stringify(value, null, 2)}\n`;
    try {
      const descriptor = fs.openSync(temporary, "wx", 0o600);
      let identity: Omit<AriadneCanonicalFileCertificate, "contents">;
      try {
        fs.writeFileSync(descriptor, contents, "utf8");
        fs.fsyncSync(descriptor);
        const stat = fs.fstatSync(descriptor);
        identity = {
          source: destination,
          kind: "file",
          device: stat.dev,
          inode: stat.ino,
          links: stat.nlink,
        };
        if (!stat.isFile() || stat.nlink !== 1) {
          throw new AriadneStateError(
            destination,
            "Ariadne atomic write must remain a regular single-link file",
          );
        }
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, destination);
      this.assertPathIdentity(identity);
      return { ...identity, contents };
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
}
