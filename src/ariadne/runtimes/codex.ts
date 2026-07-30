import { createRuntimeAdapter, promptInstruction } from "./shared.js";
import type { AriadneRuntimeAdapter, RuntimeProbeDeps } from "./types.js";

export function createCodexRuntime(
  deps: RuntimeProbeDeps,
  version: string,
): AriadneRuntimeAdapter {
  return createRuntimeAdapter(
    {
      name: "codex",
      command: "codex",
      version: { kind: "exact", version },
      helpArgs: ["exec", "--help"],
      requiredHelp: [
        "--dangerously-bypass-approvals-and-sandbox",
        "--ephemeral",
        "-C",
      ],
      authArgs: ["login", "status"],
      invocationArgs: (context) => [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "--ephemeral",
        "-C",
        context.projectRoot,
        promptInstruction(context.relativePromptPath),
      ],
    },
    deps,
  );
}
