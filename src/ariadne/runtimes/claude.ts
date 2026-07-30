import { createRuntimeAdapter, promptInstruction } from "./shared.js";
import type { AriadneRuntimeAdapter, RuntimeProbeDeps } from "./types.js";

export function createClaudeRuntime(
  deps: RuntimeProbeDeps,
  version: string,
): AriadneRuntimeAdapter {
  return createRuntimeAdapter(
    {
      name: "claude",
      command: "claude",
      version: { kind: "exact", version },
      helpArgs: ["--help"],
      requiredHelp: ["--print", "--dangerously-skip-permissions"],
      authArgs: ["auth", "status"],
      invocationArgs: (context) => [
        "--print",
        "--dangerously-skip-permissions",
        promptInstruction(context.relativePromptPath),
      ],
    },
    deps,
  );
}
