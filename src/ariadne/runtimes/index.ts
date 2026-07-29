import { loadToolLock } from "../../tool-lock.js";
import type { AriadneRuntimeName } from "../types.js";
import { createAntigravityRuntime } from "./antigravity.js";
import { createClaudeRuntime } from "./claude.js";
import { createCodexRuntime } from "./codex.js";
import { createGeminiRuntime } from "./gemini.js";
import { createOpenCodeRuntime } from "./opencode.js";
import {
  AriadneRuntimeError,
  type RuntimeDetection,
  type RuntimeProbeDeps,
  type RuntimeRegistry,
  type RuntimeSelection,
  type RuntimeSelectionInput,
} from "./types.js";

export * from "./types.js";

export function createRuntimeRegistry(deps: RuntimeProbeDeps): RuntimeRegistry {
  const lock = loadToolLock();
  return Object.freeze({
    claude: createClaudeRuntime(deps, lock.runtimeClis.claude.version),
    codex: createCodexRuntime(deps, lock.runtimeClis.codex.version),
    opencode: createOpenCodeRuntime(deps, lock.runtimeClis.opencode.version),
    gemini: createGeminiRuntime(deps, lock.runtimeClis.gemini.version),
    antigravity: createAntigravityRuntime(deps),
  });
}

function selection(
  name: AriadneRuntimeName,
  registry: RuntimeRegistry,
  detections: Map<AriadneRuntimeName, RuntimeDetection>,
): RuntimeSelection {
  const adapter = registry[name];
  const detection = detections.get(name) ?? adapter.detect();
  return { name, adapter, detection };
}

function requireSelectablePreference(
  source: "explicit" | "configured",
  name: AriadneRuntimeName,
  registry: RuntimeRegistry,
  detections: Map<AriadneRuntimeName, RuntimeDetection>,
): RuntimeSelection {
  const candidate = selection(name, registry, detections);
  if (
    candidate.detection.state !== "healthy" &&
    candidate.detection.state !== "unverified"
  ) {
    throw new AriadneRuntimeError(
      `The ${source} runtime ${name} is ${candidate.detection.state}: ${candidate.detection.reason}`,
    );
  }
  return candidate;
}

export async function selectRuntime(
  input: RuntimeSelectionInput,
): Promise<RuntimeSelection> {
  const names = Object.keys(input.registry) as AriadneRuntimeName[];
  const detections = new Map(
    names.map((name) => [name, input.registry[name].detect()]),
  );

  if (input.explicit) {
    return requireSelectablePreference(
      "explicit",
      input.explicit,
      input.registry,
      detections,
    );
  }
  if (input.configured) {
    return requireSelectablePreference(
      "configured",
      input.configured,
      input.registry,
      detections,
    );
  }

  const healthy = names.filter(
    (name) => detections.get(name)?.state === "healthy",
  );
  if (healthy.length === 1) {
    return selection(
      healthy[0] as AriadneRuntimeName,
      input.registry,
      detections,
    );
  }
  if (
    healthy.length > 1 &&
    input.globalPreferred &&
    healthy.includes(input.globalPreferred)
  ) {
    return selection(input.globalPreferred, input.registry, detections);
  }
  if (healthy.length > 1) {
    if (!input.interactive) {
      throw new AriadneRuntimeError(
        `Multiple healthy runtimes are available (${healthy.join(", ")}); pass --runtime to choose one.`,
      );
    }
    if (!input.choose) {
      throw new AriadneRuntimeError(
        "Interactive runtime selection requires a choose callback.",
      );
    }
    const choices = healthy.map(
      (name) => detections.get(name) as RuntimeDetection,
    );
    const chosen = await input.choose(choices);
    if (!healthy.includes(chosen)) {
      throw new AriadneRuntimeError(
        `Interactive runtime selection returned invalid choice: ${chosen}.`,
      );
    }
    return selection(chosen, input.registry, detections);
  }

  const unverified = names.filter(
    (name) => detections.get(name)?.state === "unverified",
  );
  if (unverified.length === 1) {
    return selection(
      unverified[0] as AriadneRuntimeName,
      input.registry,
      detections,
    );
  }
  if (unverified.length > 1) {
    throw new AriadneRuntimeError(
      `Multiple unverified runtimes are available (${unverified.join(", ")}); pass --runtime to choose one.`,
    );
  }

  throw new AriadneRuntimeError(
    "No healthy or unverified runtime is available. Run ariadne doctor for details.",
  );
}
