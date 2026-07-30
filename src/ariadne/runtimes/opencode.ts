import { createRuntimeAdapter, promptInstruction } from "./shared.js";
import type { AriadneRuntimeAdapter, RuntimeProbeDeps } from "./types.js";

export function createOpenCodeRuntime(
  deps: RuntimeProbeDeps,
  version: string,
): AriadneRuntimeAdapter {
  return createRuntimeAdapter(
    {
      name: "opencode",
      command: "opencode",
      version: { kind: "exact", version },
      helpArgs: ["run", "--help"],
      requiredHelp: ["--auto", "--dir"],
      authArgs: ["providers", "list"],
      invocationArgs: (context) => [
        "run",
        "--auto",
        "--dir",
        context.projectRoot,
        promptInstruction(context.relativePromptPath),
      ],
    },
    deps,
  );
}
