import type { AriadneGit } from "./git.js";
import { AriadneStateError } from "./schema.js";
import type {
  AriadneCanonicalFileCertificate,
  AriadneOwnershipCheckpoint,
  AriadneStore,
} from "./store.js";
import type { AriadneOwnershipViolationChange } from "./types.js";

export type AriadneOwnershipCertification = {
  runId: string;
  storyId: string;
  certifiedHead: string;
  certifiedRef: string;
  prd: AriadneCanonicalFileCertificate;
  progress: AriadneCanonicalFileCertificate;
};

function observeGit(git: AriadneGit): { head: string; ref: string } {
  const ref = git.headRef();
  const head = git.head();
  if (git.headRef() !== ref || git.head() !== head) {
    throw new AriadneStateError(
      "$git",
      "Ariadne HEAD changed while the ownership checkpoint was inspected",
    );
  }
  return { head, ref };
}

export function assertPersistedOwnership(input: {
  store: AriadneStore;
  git: AriadneGit;
  now: () => Date;
}): void {
  input.store.assertNoOwnershipViolation();
  let checkpoint: AriadneOwnershipCheckpoint | undefined;
  try {
    checkpoint = input.store.loadOwnershipCheckpoint();
  } catch (error) {
    input.store.saveOwnershipViolation({
      schemaVersion: 1,
      runId: "invalid-checkpoint",
      storyId: "unknown",
      detectedAt: input.now().toISOString(),
      certifiedHead: "unavailable",
      observedHead: "unavailable",
      changed: ["operational"],
    });
    throw error;
  }
  if (!checkpoint) {
    let required: boolean;
    try {
      required = input.store.ownershipCheckpointRequired();
    } catch (error) {
      input.store.saveOwnershipViolation({
        schemaVersion: 1,
        runId: "missing-checkpoint",
        storyId: "unknown",
        detectedAt: input.now().toISOString(),
        certifiedHead: "unavailable",
        observedHead: "unavailable",
        changed: ["operational"],
      });
      throw error;
    }
    if (!required) return;
    let observedHead = "unavailable";
    let observedRef = "unavailable";
    try {
      const observed = observeGit(input.git);
      observedHead = observed.head;
      observedRef = observed.ref;
    } catch {
      // The missing checkpoint is already sufficient to fail closed.
    }
    input.store.saveOwnershipViolation({
      schemaVersion: 1,
      runId: "missing-checkpoint",
      storyId: "unknown",
      detectedAt: input.now().toISOString(),
      certifiedHead: "unavailable",
      observedHead,
      certifiedRef: "unavailable",
      observedRef,
      changed: ["operational"],
    });
    throw new AriadneStateError(
      ".ariadne-quarantine.checkpoint.json",
      "Ariadne ownership checkpoint is missing after runtime execution",
    );
  }

  let observedHead = "unavailable";
  let observedRef = "unavailable";
  const changed = input.store.ownershipCheckpointChanges(checkpoint);
  try {
    const observed = observeGit(input.git);
    observedHead = observed.head;
    observedRef = observed.ref;
    if (
      observed.head !== checkpoint.certifiedHead ||
      observed.ref !== checkpoint.certifiedRef
    ) {
      changed.unshift("head");
    }
  } catch {
    changed.unshift("head");
  }

  const unique = [...new Set(changed)] as AriadneOwnershipViolationChange[];
  if (unique.length === 0) return;
  input.store.saveOwnershipViolation({
    schemaVersion: 1,
    runId: checkpoint.runId,
    storyId: checkpoint.storyId,
    detectedAt: input.now().toISOString(),
    certifiedHead: checkpoint.certifiedHead,
    observedHead,
    certifiedRef: checkpoint.certifiedRef,
    observedRef,
    changed: unique,
  });
  throw new AriadneStateError(
    ".ariadne-quarantine.json",
    `Ariadne detected a change after run ${checkpoint.runId}; inspect and restore Git/canonical state, then deliberately remove ${input.store.paths.ownershipViolation}`,
  );
}

export function saveOwnershipCertification(input: {
  store: AriadneStore;
  certification: AriadneOwnershipCertification;
  now: () => Date;
}): void {
  input.store.saveOwnershipCheckpoint({
    ...input.certification,
    certifiedAt: input.now().toISOString(),
  });
}

export function captureOwnershipCertification(input: {
  store: AriadneStore;
  git: AriadneGit;
  runId: string;
  storyId: string;
}): AriadneOwnershipCertification {
  const observed = observeGit(input.git);
  return {
    runId: input.runId,
    storyId: input.storyId,
    certifiedHead: observed.head,
    certifiedRef: observed.ref,
    prd: input.store.captureCanonicalCertificate(input.store.paths.prd),
    progress: input.store.captureCanonicalCertificate(
      input.store.paths.progress,
    ),
  };
}

export function assertOwnershipCertification(input: {
  store: AriadneStore;
  git: AriadneGit;
  now: () => Date;
  certification: AriadneOwnershipCertification;
}): void {
  const changed: AriadneOwnershipViolationChange[] = [];
  try {
    input.store.assertCanonicalCertificate(input.certification.prd);
  } catch {
    changed.push("prd");
  }
  try {
    input.store.assertCanonicalCertificate(input.certification.progress);
  } catch {
    changed.push("progress");
  }
  let observedHead = "unavailable";
  let observedRef = "unavailable";
  try {
    const observed = observeGit(input.git);
    observedHead = observed.head;
    observedRef = observed.ref;
    if (
      observed.head !== input.certification.certifiedHead ||
      observed.ref !== input.certification.certifiedRef
    ) {
      changed.unshift("head");
    }
  } catch {
    changed.unshift("head");
  }
  if (changed.length === 0) return;
  input.store.saveOwnershipViolation({
    schemaVersion: 1,
    runId: input.certification.runId,
    storyId: input.certification.storyId,
    detectedAt: input.now().toISOString(),
    certifiedHead: input.certification.certifiedHead,
    observedHead,
    certifiedRef: input.certification.certifiedRef,
    observedRef,
    changed: [...new Set(changed)],
  });
  throw new AriadneStateError(
    ".ariadne-quarantine.json",
    `Ariadne detected a change after certification for ${input.certification.runId}`,
  );
}
