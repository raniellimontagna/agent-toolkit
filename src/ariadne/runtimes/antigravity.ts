import { createRuntimeAdapter, promptInstruction } from "./shared.js";
import type { AriadneRuntimeAdapter, RuntimeProbeDeps } from "./types.js";

const minimumVersion = "1.1.8";

export function createAntigravityRuntime(
  deps: RuntimeProbeDeps,
): AriadneRuntimeAdapter {
  return createRuntimeAdapter(
    {
      name: "antigravity",
      command: "agy",
      version: { kind: "minimum", version: minimumVersion },
      helpArgs: ["--help"],
      requiredHelp: ["--print", "--dangerously-skip-permissions"],
      invocationArgs: (context) => [
        "--print",
        "--dangerously-skip-permissions",
        promptInstruction(context.relativePromptPath),
      ],
    },
    deps,
  );
}
