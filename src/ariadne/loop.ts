import fs from "node:fs";
import path from "node:path";
import type { QualityCheckResult, runQualityChecks } from "./checks.js";
import type { AriadneGit } from "./git.js";
import type { AriadneLockHandle, acquireProjectLock } from "./lock.js";
import {
  type AriadneOwnershipCertification,
  assertOwnershipCertification,
  assertPersistedOwnership,
  captureOwnershipCertification,
  saveOwnershipCertification,
} from "./ownership.js";
import type { runAgentProcess } from "./process.js";
import { buildIterationPrompt } from "./prompt.js";
import {
  type AgentResult,
  formatCoordinatorProgressEntry,
  formatProgressEntry,
  readAgentResult,
  sanitizeDurableValue,
  sanitizeQualityCheckResult,
  sanitizeValidatedResult,
} from "./result.js";
import type {
  AgentInvocation,
  AriadneRuntimeAdapter,
  RuntimeDetection,
} from "./runtimes/types.js";
import {
  AriadneStateError,
  assertRunnableConfig,
  assertStoryTransition,
} from "./schema.js";
import type {
  AriadneCanonicalFileCertificate,
  AriadneRunBoundary,
  AriadneStore,
} from "./store.js";
import { ARIADNE_OWNERSHIP_CHECKPOINT_MARKER } from "./store.js";
import type {
  AriadneOwnershipViolationChange,
  AriadnePrd,
  AriadneRunOptions,
  AriadneRunOutcome,
  AriadneRunSummary,
  AriadneStory,
  AttemptFailure,
} from "./types.js";

export const ARIADNE_EXIT_CODES: Record<AriadneRunOutcome, number> = {
  complete: 0,
  incomplete: 1,
  blocked: 1,
  budget_exhausted: 1,
  interrupted: 130,
  structural_error: 4,
};

export type AriadneLoopDeps = {
  store: AriadneStore;
  git: AriadneGit;
  adapter: AriadneRuntimeAdapter;
  detection?: RuntimeDetection;
  selectionCertification?: AriadneOwnershipCertification;
  acquireLock: typeof acquireProjectLock;
  runProcess: typeof runAgentProcess;
  runChecks: typeof runQualityChecks;
  now: () => Date;
  createRunId: () => string;
};

type SanitizedInvocation = Pick<AgentInvocation, "command" | "args" | "cwd">;

type CanonicalSnapshot = {
  initialHead: string;
  initialRef: string;
  prd: AriadneCanonicalFileCertificate;
  progress: AriadneCanonicalFileCertificate;
};

class RuntimeOwnershipViolationError extends AriadneStateError {
  constructor(
    readonly certifiedHead: string,
    readonly observedHead: string,
    readonly certifiedRef: string,
    readonly observedRef: string,
    readonly changed: AriadneOwnershipViolationChange[],
  ) {
    super(
      changed.includes("head") ? "$git" : "$.ariadne",
      changed.includes("head")
        ? "Ariadne runtime changed Git HEAD; runtime agents must not commit"
        : "Ariadne runtime edited canonical Ariadne state; only the coordinator may update prd.json or progress.md",
    );
  }
}

type AttemptMetadata = {
  runId: string;
  storyId: string;
  attempt: number;
  startedAt: string;
  startedMs: number;
  runtimeVersion?: string;
  initialHead: string;
  initialRef: string;
  invocation: SanitizedInvocation;
  process?: {
    status: number | null;
    signal: NodeJS.Signals | null;
    durationMs: number;
    timedOut: boolean;
    aborted: boolean;
    stdoutPath: string;
    stderrPath: string;
  };
  validatedResult?: {
    outcome: AgentResult["outcome"];
    summary: string;
    filesChanged: string[];
    learnings: string[];
  };
  checks?: Array<
    Pick<
      QualityCheckResult,
      | "command"
      | "status"
      | "signal"
      | "durationMs"
      | "timedOut"
      | "timeoutOrigin"
      | "aborted"
    >
  >;
};

function selectStory(prd: AriadnePrd): AriadneStory | undefined {
  const active = prd.userStories.find(
    (story) => story.status === "in_progress",
  );
  if (active) return active;

  let selected: AriadneStory | undefined;
  for (const story of prd.userStories) {
    if (story.status !== "pending") continue;
    if (!selected || story.priority < selected.priority) selected = story;
  }
  return selected;
}

function transitionStory(
  story: AriadneStory,
  status: AriadneStory["status"],
): void {
  assertStoryTransition(story.status, status);
  story.status = status;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function summary(input: {
  options: AriadneRunOptions;
  outcome: AriadneRunSummary["outcome"];
  iterations: number;
  completedStoryIds: string[];
  activeStoryId?: string;
  blockedStoryId?: string;
  lastRunId?: string;
  commit?: string;
  inspection?: AriadneRunSummary["inspection"];
}): AriadneRunSummary {
  return {
    schemaVersion: 1,
    command: "run",
    outcome: input.outcome,
    runtime: input.options.runtime,
    iterations: input.iterations,
    completedStoryIds: input.completedStoryIds,
    ...(input.activeStoryId ? { activeStoryId: input.activeStoryId } : {}),
    ...(input.blockedStoryId ? { blockedStoryId: input.blockedStoryId } : {}),
    ...(input.lastRunId ? { lastRunId: input.lastRunId } : {}),
    ...(input.commit ? { commit: input.commit } : {}),
    ...(input.inspection ? { inspection: input.inspection } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeAttemptFailure(failure: AttemptFailure): AttemptFailure {
  return { ...failure, message: sanitizeDurableValue(failure.message) };
}

const FAILURE_CATEGORIES = new Set<AttemptFailure["category"]>([
  "process",
  "result",
  "criterion",
  "check",
  "commit",
  "invariant",
]);

function readPriorAttemptFailure(
  store: AriadneStore,
  storyId: string,
): AttemptFailure | undefined {
  let runIds: string[];
  try {
    runIds = fs.readdirSync(store.paths.runs);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  const failures: AttemptFailure[] = [];
  for (const runId of runIds) {
    const runDir = path.join(store.paths.runs, runId);
    try {
      if (!fs.lstatSync(runDir).isDirectory()) continue;
      const attempt = JSON.parse(
        fs.readFileSync(path.join(runDir, "attempt.json"), "utf8"),
      ) as Record<string, unknown>;
      const failure = JSON.parse(
        fs.readFileSync(path.join(runDir, "failure.json"), "utf8"),
      ) as Record<string, unknown>;
      if (
        attempt.storyId !== storyId ||
        failure.runId !== runId ||
        typeof failure.category !== "string" ||
        !FAILURE_CATEGORIES.has(
          failure.category as AttemptFailure["category"],
        ) ||
        typeof failure.message !== "string" ||
        failure.message === "" ||
        typeof failure.timestamp !== "string" ||
        Number.isNaN(Date.parse(failure.timestamp))
      ) {
        continue;
      }
      failures.push(sanitizeAttemptFailure(failure as AttemptFailure));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  return failures.sort(
    (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
  )[0];
}

export function recordFailedAttempt(
  prd: AriadnePrd,
  storyId: string,
  failure: AttemptFailure,
  maxAttempts: number,
): { prd: AriadnePrd; blocked: boolean } {
  const story = prd.userStories.find((candidate) => candidate.id === storyId);
  if (!story) {
    throw new Error(
      `Unable to record ${failure.category} failure for missing story ${storyId}`,
    );
  }
  const blocked = story.attempts >= maxAttempts;
  transitionStory(story, blocked ? "blocked" : "in_progress");
  return { prd, blocked };
}

function assertAdapterMatches(
  options: AriadneRunOptions,
  deps: AriadneLoopDeps,
) {
  if (deps.adapter.name !== options.runtime) {
    throw new Error(
      `Ariadne runtime adapter mismatch: expected ${options.runtime}, received ${deps.adapter.name}`,
    );
  }
}

function acquireIterationLock(
  runId: string,
  deps: AriadneLoopDeps,
): AriadneLockHandle {
  return deps.acquireLock({
    lockPath: deps.store.paths.lock,
    runId,
    runDir: path.join(deps.store.paths.runs, runId),
    pid: process.pid,
    now: deps.now,
    isProcessAlive,
  });
}

function sanitizeInvocation(invocation: AgentInvocation): SanitizedInvocation {
  const credential =
    /(?:api[-_]?key|token|password|secret|authorization|credential)/i;
  let redactNext = false;
  const args = invocation.args.map((argument) => {
    if (redactNext) {
      redactNext = false;
      return "[REDACTED]";
    }
    const equals = argument.indexOf("=");
    if (equals > 0 && credential.test(argument.slice(0, equals))) {
      return `${argument.slice(0, equals + 1)}[REDACTED]`;
    }
    if (credential.test(argument) && argument.startsWith("-")) {
      redactNext = true;
    }
    return argument;
  });
  return { command: invocation.command, args, cwd: invocation.cwd };
}

function captureCanonicalSnapshot(
  deps: AriadneLoopDeps,
  prd: AriadneCanonicalFileCertificate,
  expectedBranch?: string,
  progress?: AriadneCanonicalFileCertificate,
): CanonicalSnapshot {
  const initialRef = deps.git.headRef();
  const initialHead = deps.git.head();
  if (deps.git.headRef() !== initialRef || deps.git.head() !== initialHead) {
    throw new AriadneStateError(
      "$git",
      "Ariadne symbolic HEAD changed while the runtime boundary was certified",
    );
  }
  if (
    expectedBranch !== undefined &&
    initialRef !== `refs/heads/${expectedBranch}`
  ) {
    throw new AriadneStateError(
      "$git",
      `Ariadne expected symbolic HEAD refs/heads/${expectedBranch}, found ${initialRef}`,
    );
  }
  return {
    initialHead,
    initialRef,
    prd,
    progress:
      progress ??
      deps.store.captureCanonicalCertificate(deps.store.paths.progress),
  };
}

function assertRuntimeOwnership(
  snapshot: CanonicalSnapshot,
  deps: AriadneLoopDeps,
): void {
  const changed: AriadneOwnershipViolationChange[] = [];
  let observedHead = "unavailable";
  let observedRef = "unavailable";
  try {
    observedRef = deps.git.headRef();
    observedHead = deps.git.head();
    if (
      deps.git.headRef() !== observedRef ||
      deps.git.head() !== observedHead ||
      observedHead !== snapshot.initialHead ||
      observedRef !== snapshot.initialRef
    ) {
      changed.push("head");
    }
  } catch {
    changed.push("head");
  }
  try {
    deps.store.assertCanonicalCertificate(snapshot.prd);
  } catch {
    changed.push("prd");
  }
  try {
    deps.store.assertCanonicalCertificate(snapshot.progress);
  } catch {
    changed.push("progress");
  }
  if (changed.length > 0) {
    throw new RuntimeOwnershipViolationError(
      snapshot.initialHead,
      observedHead,
      snapshot.initialRef,
      observedRef,
      changed,
    );
  }
}

function inspectDryRun(
  options: AriadneRunOptions,
  deps: AriadneLoopDeps,
): AriadneRunSummary {
  const config = deps.store.loadConfig();
  const prd = deps.store.loadPrd();
  const blocked = prd.userStories.find((story) => story.status === "blocked");
  const active = blocked ?? selectStory(prd);
  deps.git.assertReady(
    prd.branchName,
    prd.userStories.some(
      (story) => story.status === "in_progress" || story.status === "blocked",
    ),
  );

  const promptPath = path.join(deps.store.paths.runs, "dry-run", "prompt.md");
  const invocation = deps.adapter.buildInvocation({
    runId: "dry-run",
    projectRoot: deps.store.projectRoot,
    promptPath,
    relativePromptPath: path.relative(deps.store.projectRoot, promptPath),
  });
  const detection = deps.detection ?? deps.adapter.detect();
  const inspection: NonNullable<AriadneRunSummary["inspection"]> = {
    project: {
      root: deps.store.projectRoot,
      name: prd.project,
      branch: prd.branchName,
    },
    selectedStory: active ? { ...active } : null,
    blockedStory: blocked ? { ...blocked } : null,
    promptPath,
    invocation: sanitizeInvocation(invocation),
    runtime: {
      name: detection.name,
      state: detection.state,
      ...(detection.version ? { version: detection.version } : {}),
    },
    checks: [...config.qualityChecks],
    limits: {
      maxAttemptsPerStory: config.maxAttemptsPerStory,
      maxIterations: options.maxIterations ?? null,
      maxRuntimeMs: options.maxRuntimeMs ?? null,
    },
  };
  return summary({
    options,
    outcome: blocked ? "blocked" : active ? "incomplete" : "complete",
    iterations: 0,
    completedStoryIds: [],
    ...(active ? { activeStoryId: active.id } : {}),
    ...(blocked ? { blockedStoryId: blocked.id } : {}),
    inspection,
  });
}

export async function runAriadneLoop(
  options: AriadneRunOptions,
  deps: AriadneLoopDeps,
): Promise<AriadneRunSummary> {
  assertAdapterMatches(options, deps);
  if (deps.selectionCertification) {
    assertOwnershipCertification({
      store: deps.store,
      git: deps.git,
      now: deps.now,
      certification: deps.selectionCertification,
    });
  }
  assertPersistedOwnership({ store: deps.store, git: deps.git, now: deps.now });
  if (options.dryRun) {
    const certification =
      deps.selectionCertification ??
      captureOwnershipCertification({
        store: deps.store,
        git: deps.git,
        runId: "dry-run",
        storyId: selectStory(deps.store.loadPrd())?.id ?? "dry-run",
      });
    const inspection = inspectDryRun(options, deps);
    assertOwnershipCertification({
      store: deps.store,
      git: deps.git,
      now: deps.now,
      certification,
    });
    return inspection;
  }

  const completedStoryIds: string[] = [];
  let iterations = 0;
  let lastRunId: string | undefined;
  let commit: string | undefined;
  let currentAttempt: AttemptMetadata | undefined;
  let activeCertification: AriadneOwnershipCertification | undefined;
  const finalizedAttemptRunIds = new Set<string>();
  const startedAt = deps.now().getTime();
  const priorFailures = new Map<string, AttemptFailure>();
  let parentSignal: "SIGINT" | "SIGTERM" | undefined;
  const onParentSigint = () => {
    parentSignal = "SIGINT";
  };
  const onParentSigterm = () => {
    parentSignal = "SIGTERM";
  };

  const runtimeBudgetReached = () =>
    options.maxRuntimeMs !== undefined &&
    deps.now().getTime() - startedAt >= options.maxRuntimeMs;

  const persistCertification = (
    certification: AriadneOwnershipCertification,
  ): void => {
    activeCertification = certification;
    try {
      saveOwnershipCertification({
        store: deps.store,
        certification,
        now: deps.now,
      });
    } catch (error) {
      // Convert a concurrent canonical/ref mutation into the precise ownership
      // surface before the outer containment handler persists quarantine.
      assertRuntimeOwnership(
        {
          initialHead: certification.certifiedHead,
          initialRef: certification.certifiedRef,
          prd: certification.prd,
          progress: certification.progress,
        },
        deps,
      );
      throw error;
    }
  };

  const activeStoryId = () => {
    const prd = deps.store.loadPrd();
    return selectStory(prd)?.id;
  };

  const finishAttempt = (
    outcome:
      | "completed"
      | "failed"
      | "blocked"
      | "interrupted"
      | "budget_exhausted"
      | "structural_error",
    failureCategory?: AttemptFailure["category"],
  ): void => {
    if (!currentAttempt) return;
    const attempt = currentAttempt;
    const finishedAt = deps.now();
    let finalHead: string | undefined;
    try {
      finalHead = deps.git.head();
    } catch {
      // Preserve the original failure if Git itself is no longer readable.
    }
    deps.store.writeRunJson(attempt.runId, "summary.json", {
      schemaVersion: 1,
      runId: attempt.runId,
      storyId: attempt.storyId,
      runtime: options.runtime,
      ...(attempt.runtimeVersion
        ? { runtimeVersion: attempt.runtimeVersion }
        : {}),
      attempt: attempt.attempt,
      invocation: attempt.invocation,
      startedAt: attempt.startedAt,
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - attempt.startedMs),
      outcome,
      ...(failureCategory ? { failureCategory } : {}),
      initialHead: attempt.initialHead,
      initialRef: attempt.initialRef,
      ...(finalHead ? { finalHead } : {}),
      ...(attempt.process ? { process: attempt.process } : {}),
      ...(attempt.validatedResult
        ? { validatedResult: attempt.validatedResult }
        : {}),
      ...(attempt.checks ? { checks: attempt.checks } : {}),
    });
    finalizedAttemptRunIds.add(attempt.runId);
    currentAttempt = undefined;
  };

  const finishCoordinatorRun = (
    runId: string,
    storyId: string | undefined,
    outcome: "blocked" | "interrupted" | "budget_exhausted",
    reason: string,
  ): void => {
    const timestamp = deps.now().toISOString();
    let head: string | undefined;
    try {
      head = deps.git.head();
    } catch {
      // The stop record remains useful when Git metadata is unavailable.
    }
    deps.store.writeRunJson(runId, "summary.json", {
      schemaVersion: 1,
      runId,
      ...(storyId ? { storyId } : {}),
      runtime: options.runtime,
      startedAt: timestamp,
      finishedAt: timestamp,
      durationMs: 0,
      outcome,
      reason,
      ...(head ? { initialHead: head, finalHead: head } : {}),
    });
  };

  const stop = (
    outcome: "budget_exhausted" | "interrupted",
    reason: string,
    runId: string | undefined,
    storyId: string | undefined,
  ): AriadneRunSummary => {
    const result = summary({
      options,
      outcome,
      iterations,
      completedStoryIds,
      ...(storyId ? { activeStoryId: storyId } : {}),
      ...((runId ?? lastRunId) ? { lastRunId: runId ?? lastRunId } : {}),
      ...(commit ? { commit } : {}),
    });
    if (runId) {
      deps.store.writeRunJson(runId, "stop.json", {
        schemaVersion: 1,
        outcome,
        reason,
        timestamp: deps.now().toISOString(),
        iterations,
      });
      if (currentAttempt?.runId === runId) finishAttempt(outcome);
      else if (!finalizedAttemptRunIds.has(runId)) {
        finishCoordinatorRun(runId, storyId, outcome, reason);
      }
    }
    return result;
  };

  const failAttempt = (
    prd: AriadnePrd,
    story: AriadneStory,
    failure: AttemptFailure,
    maxAttempts: number,
    evidence: { result?: AgentResult; checks?: QualityCheckResult[] } = {},
  ) => {
    const durableFailure = sanitizeAttemptFailure(failure);
    const state = recordFailedAttempt(
      prd,
      story.id,
      durableFailure,
      maxAttempts,
    );
    const prdCertificate = deps.store.savePrd(state.prd);
    deps.store.writeRunJson(
      durableFailure.runId,
      "failure.json",
      durableFailure,
    );
    const progressCertificate = deps.store.appendProgress(
      evidence.result
        ? formatProgressEntry({
            timestamp: durableFailure.timestamp,
            runId: durableFailure.runId,
            story,
            runtime: options.runtime,
            result: evidence.result,
            checks: evidence.checks ?? [],
            outcome: state.blocked ? "blocked" : "failed",
            failureCategory: durableFailure.category,
            failureReason: durableFailure.message,
          })
        : formatCoordinatorProgressEntry({
            timestamp: durableFailure.timestamp,
            runId: durableFailure.runId,
            storyId: story.id,
            runtime: options.runtime,
            outcome: state.blocked ? "blocked" : "failed",
            failureCategory: durableFailure.category,
            failureReason: durableFailure.message,
          }),
    );
    if (
      activeCertification?.runId === durableFailure.runId &&
      activeCertification.storyId === story.id
    ) {
      persistCertification({
        ...activeCertification,
        prd: prdCertificate,
        progress: progressCertificate,
      });
    }
    priorFailures.set(story.id, durableFailure);
    finishAttempt(
      state.blocked ? "blocked" : "failed",
      durableFailure.category,
    );
    return state.blocked;
  };

  const blockedSummary = (
    storyId: string,
    runId: string,
  ): AriadneRunSummary => {
    const result = summary({
      options,
      outcome: "blocked",
      iterations,
      completedStoryIds,
      activeStoryId: storyId,
      blockedStoryId: storyId,
      lastRunId: runId,
      ...(commit ? { commit } : {}),
    });
    deps.store.writeRunJson(runId, "stop.json", {
      schemaVersion: 1,
      outcome: "blocked",
      reason: "max_attempts",
      timestamp: deps.now().toISOString(),
      iterations,
    });
    finishAttempt("blocked");
    return result;
  };

  const recordTerminalFailure = (
    story: AriadneStory,
    failure: AttemptFailure,
    outcome: "interrupted" | "budget_exhausted",
    evidence: { result?: AgentResult; checks?: QualityCheckResult[] } = {},
  ) => {
    const durableFailure = sanitizeAttemptFailure(failure);
    deps.store.writeRunJson(
      durableFailure.runId,
      "failure.json",
      durableFailure,
    );
    const progressCertificate = deps.store.appendProgress(
      evidence.result
        ? formatProgressEntry({
            timestamp: durableFailure.timestamp,
            runId: durableFailure.runId,
            story,
            runtime: options.runtime,
            result: evidence.result,
            checks: evidence.checks ?? [],
            outcome,
            failureCategory: durableFailure.category,
            failureReason: durableFailure.message,
          })
        : formatCoordinatorProgressEntry({
            timestamp: durableFailure.timestamp,
            runId: durableFailure.runId,
            storyId: story.id,
            runtime: options.runtime,
            outcome,
            failureCategory: durableFailure.category,
            failureReason: durableFailure.message,
          }),
    );
    if (
      activeCertification?.runId === durableFailure.runId &&
      activeCertification.storyId === story.id
    ) {
      persistCertification({
        ...activeCertification,
        progress: progressCertificate,
      });
    }
  };

  const rejectOwnershipViolation = (
    error: unknown,
    story: AriadneStory,
    runId: string,
  ): never => {
    const failure = sanitizeAttemptFailure({
      runId,
      category: "invariant",
      message: errorMessage(error),
      timestamp: deps.now().toISOString(),
    });
    let observedHead = "unavailable";
    let observedRef = "unavailable";
    try {
      observedHead = deps.git.head();
    } catch {
      // The durable marker must still survive unreadable Git metadata.
    }
    try {
      observedRef = deps.git.headRef();
    } catch {
      // The durable marker must still survive detached/corrupt HEAD.
    }
    const certifiedHead =
      error instanceof RuntimeOwnershipViolationError
        ? error.certifiedHead
        : (currentAttempt?.initialHead ?? "unavailable");
    const certifiedRef =
      error instanceof RuntimeOwnershipViolationError
        ? error.certifiedRef
        : (currentAttempt?.initialRef ?? "unavailable");
    deps.store.saveOwnershipViolation({
      schemaVersion: 1,
      runId,
      storyId: story.id,
      detectedAt: failure.timestamp,
      certifiedHead,
      observedHead:
        error instanceof RuntimeOwnershipViolationError
          ? error.observedHead
          : observedHead,
      certifiedRef,
      observedRef:
        error instanceof RuntimeOwnershipViolationError
          ? error.observedRef
          : observedRef,
      changed:
        error instanceof RuntimeOwnershipViolationError
          ? [...error.changed]
          : ["operational"],
    });
    try {
      deps.store.writeRunJson(runId, "failure.json", failure);
      finishAttempt("structural_error", "invariant");
    } catch {
      // A containment violation may make this run directory unsafe. The
      // quarantine marker above is persisted independently at the project root;
      // never follow the compromised run path merely to finish diagnostics.
    }
    // Canonical state may be attacker-controlled here, so do not load, save,
    // append, stage, or reset it. Preserve the evidence for manual recovery.
    throw error instanceof AriadneStateError
      ? error
      : new AriadneStateError(`$.userStories[${story.id}]`, failure.message);
  };

  const releaseIterationLock = (
    lock: AriadneLockHandle,
    story: AriadneStory | undefined,
    runId: string,
  ): void => {
    try {
      lock.release();
    } catch (error) {
      if (story && !deps.store.loadOwnershipViolation()) {
        rejectOwnershipViolation(error, story, runId);
      }
      throw error;
    }
  };

  process.on("SIGINT", onParentSigint);
  process.on("SIGTERM", onParentSigterm);
  let recheckPersistedBoundary = false;
  try {
    for (;;) {
      if (recheckPersistedBoundary) {
        assertPersistedOwnership({
          store: deps.store,
          git: deps.git,
          now: deps.now,
        });
      }
      recheckPersistedBoundary = true;
      if (options.signal?.aborted || parentSignal) {
        return stop(
          "interrupted",
          options.signal?.aborted ? "cancelled" : "signal",
          lastRunId,
          activeStoryId(),
        );
      }
      if (
        options.maxIterations !== undefined &&
        iterations >= options.maxIterations
      ) {
        return stop(
          "budget_exhausted",
          "max_iterations",
          lastRunId,
          activeStoryId(),
        );
      }
      if (runtimeBudgetReached()) {
        return stop(
          "budget_exhausted",
          "max_runtime",
          lastRunId,
          activeStoryId(),
        );
      }

      const runId = deps.createRunId();
      const lock = acquireIterationLock(runId, deps);
      let lockedStory: AriadneStory | undefined;
      try {
        const config = deps.store.loadConfig();
        const prd = deps.store.loadPrd();
        assertRunnableConfig(config);
        const hasPreservedDiff = prd.userStories.some(
          (story) =>
            story.status === "in_progress" || story.status === "blocked",
        );
        deps.git.assertReady(prd.branchName, hasPreservedDiff);

        const blockedStory = prd.userStories.find(
          (story) => story.status === "blocked",
        );
        if (blockedStory) {
          return summary({
            options,
            outcome: "blocked",
            iterations,
            completedStoryIds,
            activeStoryId: blockedStory.id,
            blockedStoryId: blockedStory.id,
            ...(lastRunId ? { lastRunId } : {}),
            ...(commit ? { commit } : {}),
          });
        }

        const activeStory = selectStory(prd);
        if (!activeStory) {
          return summary({
            options,
            outcome: "complete",
            iterations,
            completedStoryIds,
            ...(lastRunId ? { lastRunId } : {}),
            ...(commit ? { commit } : {}),
          });
        }
        lockedStory = activeStory;

        if (
          activeStory.status === "in_progress" &&
          activeStory.attempts >= config.maxAttemptsPerStory
        ) {
          transitionStory(activeStory, "blocked");
          const blockedPrdCertificate = deps.store.savePrd(prd);
          deps.store.writeRunJson(runId, "stop.json", {
            schemaVersion: 1,
            outcome: "blocked",
            reason: "max_attempts",
            timestamp: deps.now().toISOString(),
            iterations,
          });
          finishCoordinatorRun(
            runId,
            activeStory.id,
            "blocked",
            "max_attempts",
          );
          const blockedSnapshot = captureCanonicalSnapshot(
            deps,
            blockedPrdCertificate,
            prd.branchName,
          );
          persistCertification({
            runId,
            storyId: activeStory.id,
            certifiedHead: blockedSnapshot.initialHead,
            certifiedRef: blockedSnapshot.initialRef,
            prd: blockedSnapshot.prd,
            progress: blockedSnapshot.progress,
          });
          return summary({
            options,
            outcome: "blocked",
            iterations,
            completedStoryIds,
            activeStoryId: activeStory.id,
            blockedStoryId: activeStory.id,
            lastRunId: runId,
            ...(commit ? { commit } : {}),
          });
        }

        if (runtimeBudgetReached()) {
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (options.signal?.aborted || parentSignal) {
          return stop(
            "interrupted",
            options.signal?.aborted ? "cancelled" : "signal",
            runId,
            activeStory.id,
          );
        }

        if (
          options.persistRuntimeSelection &&
          config.runtime !== options.runtime
        ) {
          config.runtime = options.runtime;
          deps.store.saveConfig(config);
        }

        const continuedStory = activeStory.status === "in_progress";
        transitionStory(activeStory, "in_progress");
        const preProbePrdCertificate = deps.store.savePrd(prd);
        let preProbeProgressCertificate =
          deps.store.captureCanonicalCertificate(deps.store.paths.progress);
        if (
          !preProbeProgressCertificate.contents.includes(
            ARIADNE_OWNERSHIP_CHECKPOINT_MARKER,
          )
        ) {
          preProbeProgressCertificate = deps.store.appendProgress(
            ARIADNE_OWNERSHIP_CHECKPOINT_MARKER,
            preProbeProgressCertificate,
          );
        }

        const runDir = deps.store.createRunDir(runId);
        const promptPath = path.join(runDir, "prompt.md");
        const resultPath = path.join(runDir, "result.json");
        const priorFailure =
          priorFailures.get(activeStory.id) ??
          readPriorAttemptFailure(deps.store, activeStory.id);
        const prompt = buildIterationPrompt({
          runId,
          story: activeStory,
          projectRoot: deps.store.projectRoot,
          resultPath,
          qualityChecks: config.qualityChecks,
          ...(priorFailure ? { priorFailure: priorFailure.message } : {}),
          hasExistingDiff: continuedStory,
        });
        const promptIdentity = deps.store.writeRunTextExclusive(
          runId,
          "prompt.md",
          prompt,
        );
        const resultIdentity = deps.store.writeRunTextExclusive(
          runId,
          "result.json",
          "",
        );
        const invocation = deps.adapter.buildInvocation({
          runId,
          projectRoot: deps.store.projectRoot,
          promptPath,
          relativePromptPath: path.relative(deps.store.projectRoot, promptPath),
        });
        const preProbeSnapshot = captureCanonicalSnapshot(
          deps,
          preProbePrdCertificate,
          prd.branchName,
          preProbeProgressCertificate,
        );
        persistCertification({
          runId,
          storyId: activeStory.id,
          certifiedHead: preProbeSnapshot.initialHead,
          certifiedRef: preProbeSnapshot.initialRef,
          prd: preProbeSnapshot.prd,
          progress: preProbeSnapshot.progress,
        });
        const detection = deps.detection ?? deps.adapter.detect();
        try {
          assertRuntimeOwnership(preProbeSnapshot, deps);
        } catch (error) {
          rejectOwnershipViolation(error, activeStory, runId);
        }
        const attempt = activeStory.attempts + 1;
        activeStory.attempts = attempt;
        const activePrdCertificate = deps.store.savePrd(prd);
        const canonicalSnapshot = {
          ...preProbeSnapshot,
          prd: activePrdCertificate,
        } satisfies CanonicalSnapshot;
        persistCertification({
          runId,
          storyId: activeStory.id,
          certifiedHead: canonicalSnapshot.initialHead,
          certifiedRef: canonicalSnapshot.initialRef,
          prd: canonicalSnapshot.prd,
          progress: canonicalSnapshot.progress,
        });
        const attemptStartedAt = deps.now();
        currentAttempt = {
          runId,
          storyId: activeStory.id,
          attempt,
          startedAt: attemptStartedAt.toISOString(),
          startedMs: attemptStartedAt.getTime(),
          ...(detection.version ? { runtimeVersion: detection.version } : {}),
          initialHead: canonicalSnapshot.initialHead,
          initialRef: canonicalSnapshot.initialRef,
          invocation: sanitizeInvocation(invocation),
        };
        deps.store.writeRunJson(runId, "attempt.json", {
          schemaVersion: 1,
          runId,
          storyId: activeStory.id,
          runtime: options.runtime,
          ...(detection.version ? { runtimeVersion: detection.version } : {}),
          attempt,
          startedAt: attemptStartedAt.toISOString(),
          initialHead: canonicalSnapshot.initialHead,
          initialRef: canonicalSnapshot.initialRef,
          invocation: currentAttempt.invocation,
        });
        let runBoundary = deps.store.certifyRunBoundary(
          runId,
          ["prompt.md", "result.json", "attempt.json"],
          [promptIdentity, resultIdentity],
        );

        const assertOwnershipBoundary = (snapshot: CanonicalSnapshot): void => {
          try {
            assertRuntimeOwnership(snapshot, deps);
          } catch (error) {
            rejectOwnershipViolation(error, activeStory, runId);
          }
        };
        const assertOperationalBoundary = (
          boundary: AriadneRunBoundary = runBoundary,
        ): void => {
          try {
            lock.assertIntegrity();
            deps.store.assertRunBoundary(boundary);
          } catch (error) {
            rejectOwnershipViolation(error, activeStory, runId);
          }
        };
        const assertAttemptBoundary = (
          snapshot: CanonicalSnapshot = canonicalSnapshot,
          boundary: AriadneRunBoundary = runBoundary,
        ): void => {
          // Ownership must be evaluated first so a simultaneous containment
          // violation cannot suppress the durable quarantine marker.
          assertOwnershipBoundary(snapshot);
          assertOperationalBoundary(boundary);
        };
        assertAttemptBoundary();

        iterations += 1;
        lastRunId = runId;
        const remainingRuntime =
          options.maxRuntimeMs === undefined
            ? undefined
            : Math.max(
                1,
                options.maxRuntimeMs - (deps.now().getTime() - startedAt),
              );
        const processPaths = {
          stdoutPath: path.join(runDir, "runtime.stdout.log"),
          stderrPath: path.join(runDir, "runtime.stderr.log"),
        };
        let processResult:
          | Awaited<ReturnType<typeof deps.runProcess>>
          | undefined;
        let processError: unknown;
        let processFailed = false;
        let processOutputCertified = false;
        try {
          processResult = await deps.runProcess(invocation, {
            ...processPaths,
            ...(remainingRuntime === undefined
              ? {}
              : { timeoutMs: remainingRuntime }),
            ...(options.signal ? { signal: options.signal } : {}),
            certifyOutput: (identities) => {
              assertAttemptBoundary();
              runBoundary = deps.store.extendRunBoundary(runBoundary, [
                identities.stdout,
                identities.stderr,
              ]);
              assertAttemptBoundary();
              processOutputCertified = true;
            },
          });
        } catch (error) {
          processFailed = true;
          processError = error;
        }
        assertAttemptBoundary();
        if (processFailed) {
          if (processError instanceof AriadneStateError) {
            rejectOwnershipViolation(processError, activeStory, runId);
          }
          if (options.signal?.aborted || parentSignal) {
            return stop(
              "interrupted",
              options.signal?.aborted ? "cancelled" : "signal",
              runId,
              activeStory.id,
            );
          }
          if (runtimeBudgetReached()) {
            return stop(
              "budget_exhausted",
              "max_runtime",
              runId,
              activeStory.id,
            );
          }
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: errorMessage(processError),
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        if (processResult === undefined) {
          return rejectOwnershipViolation(
            new AriadneStateError(
              "$.process",
              "Ariadne runtime completed without process metadata",
            ),
            activeStory,
            runId,
          );
        }
        if (!processOutputCertified) {
          rejectOwnershipViolation(
            new AriadneStateError(
              "$.process",
              "Ariadne runtime returned without creator-certified output identities",
            ),
            activeStory,
            runId,
          );
        }
        assertAttemptBoundary();
        currentAttempt.process = {
          status: processResult.status,
          signal: processResult.signal,
          durationMs: processResult.durationMs,
          timedOut: processResult.timedOut,
          aborted: processResult.aborted,
          ...processPaths,
        };
        deps.store.writeRunJson(runId, "process.json", processResult);

        if (processResult.timedOut && options.maxRuntimeMs !== undefined) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: "Ariadne runtime budget expired during the agent process",
            timestamp: deps.now().toISOString(),
          };
          failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory);
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (processResult.aborted || options.signal?.aborted) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: "Ariadne runtime was cancelled",
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure, "interrupted");
          return stop("interrupted", "cancelled", runId, activeStory.id);
        }
        if (parentSignal) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: `Ariadne runtime was interrupted by parent ${parentSignal}`,
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure, "interrupted");
          return stop("interrupted", "signal", runId, activeStory.id);
        }
        if (
          processResult.signal === "SIGINT" ||
          processResult.signal === "SIGTERM"
        ) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: `Ariadne runtime was interrupted by ${processResult.signal}`,
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure, "interrupted");
          return stop("interrupted", "signal", runId, activeStory.id);
        }

        let runtimeOutcome: ReturnType<
          AriadneRuntimeAdapter["interpretResult"]
        >;
        try {
          runtimeOutcome = deps.adapter.interpretResult(processResult);
        } catch {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message:
              "Unable to interpret runtime exit metadata; inspect machine-local logs.",
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        if (!runtimeOutcome.ok) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: `Runtime exited with status ${runtimeOutcome.status ?? "unknown"}; inspect machine-local logs.`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }

        let result: ReturnType<typeof readAgentResult>;
        try {
          assertAttemptBoundary();
          result = readAgentResult(
            resultPath,
            {
              runId,
              storyId: activeStory.id,
              acceptanceCriteria: activeStory.acceptanceCriteria,
              projectRoot: deps.store.projectRoot,
            },
            resultIdentity,
          );
          assertAttemptBoundary();
        } catch (error) {
          const failure: AttemptFailure = {
            runId,
            category: "result",
            message: errorMessage(error),
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        currentAttempt.validatedResult = sanitizeValidatedResult(result);
        if (result.outcome !== "completed") {
          const category = result.criteria.some(
            (criterion) => !criterion.passed,
          )
            ? "criterion"
            : "result";
          const failure: AttemptFailure = {
            runId,
            category,
            message:
              result.failureReason ??
              `Ariadne runtime did not complete ${activeStory.id}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory, {
              result,
            })
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }

        if (runtimeBudgetReached()) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: "Ariadne runtime budget expired before quality checks",
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure, "budget_exhausted", {
            result,
          });
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (options.signal?.aborted || parentSignal) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: "Ariadne was interrupted before quality checks",
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure, "interrupted", {
            result,
          });
          return stop(
            "interrupted",
            options.signal?.aborted ? "cancelled" : "signal",
            runId,
            activeStory.id,
          );
        }

        let checks: Awaited<ReturnType<typeof deps.runChecks>>;
        const certifiedCheckOutputs = new Set<string>();
        const remainingCheckRuntime =
          options.maxRuntimeMs === undefined
            ? undefined
            : Math.max(
                1,
                options.maxRuntimeMs - (deps.now().getTime() - startedAt),
              );
        try {
          checks = await deps.runChecks({
            commands: config.qualityChecks,
            projectRoot: deps.store.projectRoot,
            runDir,
            runProcess: deps.runProcess,
            assertRunDirectory: () => assertAttemptBoundary(),
            certifyOutput: (identities) => {
              assertAttemptBoundary();
              runBoundary = deps.store.extendRunBoundary(runBoundary, [
                identities.stdout,
                identities.stderr,
              ]);
              certifiedCheckOutputs.add(identities.stdout.source);
              certifiedCheckOutputs.add(identities.stderr.source);
              assertAttemptBoundary();
            },
            ...(options.signal ? { signal: options.signal } : {}),
            ...(remainingCheckRuntime === undefined
              ? {}
              : { timeoutMs: remainingCheckRuntime }),
          });
          assertAttemptBoundary();
        } catch (error) {
          assertAttemptBoundary();
          if (error instanceof AriadneStateError) {
            rejectOwnershipViolation(error, activeStory, runId);
          }
          if (options.signal?.aborted || parentSignal) {
            const failure: AttemptFailure = {
              runId,
              category: "check",
              message: "Ariadne quality checks were interrupted",
              timestamp: deps.now().toISOString(),
            };
            recordTerminalFailure(activeStory, failure, "interrupted", {
              result,
            });
            return stop(
              "interrupted",
              options.signal?.aborted ? "cancelled" : "signal",
              runId,
              activeStory.id,
            );
          }
          if (runtimeBudgetReached()) {
            const failure: AttemptFailure = {
              runId,
              category: "check",
              message: "Ariadne runtime budget expired during quality checks",
              timestamp: deps.now().toISOString(),
            };
            recordTerminalFailure(activeStory, failure, "budget_exhausted", {
              result,
            });
            return stop(
              "budget_exhausted",
              "max_runtime",
              runId,
              activeStory.id,
            );
          }
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: errorMessage(error),
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory, {
              result,
            })
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        const uncertifiedCheck = checks.find(
          (check) =>
            !certifiedCheckOutputs.has(check.stdoutPath) ||
            !certifiedCheckOutputs.has(check.stderrPath),
        );
        if (uncertifiedCheck) {
          rejectOwnershipViolation(
            new AriadneStateError(
              "$.checks",
              `Ariadne quality check returned without creator-certified output identities: ${uncertifiedCheck.command}`,
            ),
            activeStory,
            runId,
          );
        }
        const durableChecks = checks.map(sanitizeQualityCheckResult);
        currentAttempt.checks = durableChecks.map((check) => ({
          command: check.command,
          status: check.status,
          signal: check.signal,
          durationMs: check.durationMs,
          timedOut: check.timedOut,
          timeoutOrigin: check.timeoutOrigin,
          aborted: check.aborted,
        }));
        deps.store.writeRunJson(runId, "checks.json", durableChecks);
        const timedOutCheck = checks.find((check) => check.timedOut);
        if (timedOutCheck?.timeoutOrigin === "global_budget") {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne runtime budget expired during quality check: ${timedOutCheck.command}`,
            timestamp: deps.now().toISOString(),
          };
          failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory, {
            result,
            checks,
          });
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (timedOutCheck) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality check timed out: ${timedOutCheck.command}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory, {
              result,
              checks,
            })
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        const abortedCheck = checks.find((check) => check.aborted);
        if (abortedCheck || options.signal?.aborted) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality check was cancelled: ${abortedCheck?.command ?? "external cancellation"}`,
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure, "interrupted", {
            result,
            checks,
          });
          return stop("interrupted", "cancelled", runId, activeStory.id);
        }
        const interruptedCheck = checks.find(
          (check) => check.signal === "SIGINT" || check.signal === "SIGTERM",
        );
        if (parentSignal || interruptedCheck) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality checks were interrupted by ${parentSignal ?? interruptedCheck?.signal}`,
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure, "interrupted", {
            result,
            checks,
          });
          return stop("interrupted", "signal", runId, activeStory.id);
        }
        if (runtimeBudgetReached()) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: "Ariadne runtime budget expired after quality checks",
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure, "budget_exhausted", {
            result,
            checks,
          });
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (checks.length !== config.qualityChecks.length) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality checks did not all run for ${activeStory.id}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory, {
              result,
              checks,
            })
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        const failedCheck = checks.find((check) => check.status !== 0);
        if (failedCheck) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality check failed: ${failedCheck.command}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory, {
              result,
              checks,
            })
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }

        assertAttemptBoundary();
        transitionStory(activeStory, "completed");
        let publicationSnapshot!: CanonicalSnapshot;
        try {
          const completedPrdCertificate = deps.store.savePrd(prd);
          const completedProgressCertificate = deps.store.appendProgress(
            formatProgressEntry({
              timestamp: deps.now().toISOString(),
              runId,
              story: activeStory,
              runtime: options.runtime,
              result,
              checks,
            }),
            canonicalSnapshot.progress,
          );
          publicationSnapshot = {
            initialHead: canonicalSnapshot.initialHead,
            initialRef: canonicalSnapshot.initialRef,
            prd: completedPrdCertificate,
            progress: completedProgressCertificate,
          };
          assertOwnershipBoundary(publicationSnapshot);
          assertOperationalBoundary();
        } catch (error) {
          rejectOwnershipViolation(error, activeStory, runId);
        }
        const assertPublicationBoundary = (): void => {
          assertOwnershipBoundary(publicationSnapshot);
          assertOperationalBoundary();
        };
        try {
          assertPublicationBoundary();
          deps.git.stageAll(
            canonicalSnapshot.initialHead,
            canonicalSnapshot.initialRef,
          );
          assertPublicationBoundary();
          commit = deps.git.commit(
            activeStory,
            canonicalSnapshot.initialHead,
            assertPublicationBoundary,
            canonicalSnapshot.initialRef,
          );
        } catch (error) {
          // A late runtime/background mutation must quarantine before any
          // coordinator rollback writes. These calls throw structurally when
          // either ownership or the operational boundary changed.
          assertPublicationBoundary();
          if (error instanceof AriadneStateError) {
            rejectOwnershipViolation(error, activeStory, runId);
          }
          // Commit failure is the sole recovery transition from completed back
          // to in-progress; the completed state was never durably certified.
          activeStory.status = "in_progress";
          const failedPrdCertificate = deps.store.savePrd(prd);
          const failedProgressCertificate = deps.store.appendProgress(
            formatProgressEntry({
              timestamp: deps.now().toISOString(),
              runId,
              story: activeStory,
              runtime: options.runtime,
              result,
              checks,
              outcome: "failed",
              failureCategory: "commit_failure",
              failureReason: errorMessage(error),
            }),
          );
          persistCertification({
            runId,
            storyId: activeStory.id,
            certifiedHead: canonicalSnapshot.initialHead,
            certifiedRef: canonicalSnapshot.initialRef,
            prd: failedPrdCertificate,
            progress: failedProgressCertificate,
          });
          const failure = sanitizeAttemptFailure({
            runId,
            category: "commit",
            message: errorMessage(error),
            timestamp: deps.now().toISOString(),
          });
          deps.store.writeRunJson(runId, "failure.json", failure);
          finishAttempt("failed", "commit");
          throw error;
        }
        finishAttempt("completed");
        try {
          deps.git.assertPublished(commit);
          deps.store.assertCanonicalCertificate(publicationSnapshot.prd);
          deps.store.assertCanonicalCertificate(publicationSnapshot.progress);
          assertOperationalBoundary();
        } catch (error) {
          rejectOwnershipViolation(error, activeStory, runId);
        }
        persistCertification({
          runId,
          storyId: activeStory.id,
          certifiedHead: commit,
          certifiedRef: publicationSnapshot.initialRef,
          prd: publicationSnapshot.prd,
          progress: publicationSnapshot.progress,
        });
        completedStoryIds.push(activeStory.id);

        if (!selectStory(prd)) {
          return summary({
            options,
            outcome: "complete",
            iterations,
            completedStoryIds,
            lastRunId,
            commit,
          });
        }
      } catch (error) {
        if (
          lockedStory &&
          error instanceof AriadneStateError &&
          !deps.store.loadOwnershipViolation()
        ) {
          rejectOwnershipViolation(error, lockedStory, runId);
        }
        throw error;
      } finally {
        releaseIterationLock(lock, lockedStory, runId);
      }
    }
  } finally {
    process.removeListener("SIGINT", onParentSigint);
    process.removeListener("SIGTERM", onParentSigterm);
  }
}
