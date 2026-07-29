import { createRuntimeAdapter, promptInstruction } from "./shared.js";
import type { AriadneRuntimeAdapter, RuntimeProbeDeps } from "./types.js";

export function createGeminiRuntime(
  deps: RuntimeProbeDeps,
  version: string,
): AriadneRuntimeAdapter {
  return createRuntimeAdapter(
    {
      name: "gemini",
      command: "gemini",
      version: { kind: "exact", version },
      helpArgs: ["--help"],
      requiredHelp: ["--prompt", "--approval-mode", "--skip-trust"],
      invocationArgs: (context) => [
        "--prompt",
        promptInstruction(context.relativePromptPath),
        "--approval-mode",
        "yolo",
        "--skip-trust",
      ],
    },
    deps,
  );
}
