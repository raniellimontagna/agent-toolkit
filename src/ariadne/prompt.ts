import type { AriadneStory } from "./types.js";

export type IterationPromptInput = {
  runId: string;
  story: AriadneStory;
  projectRoot: string;
  resultPath: string;
  qualityChecks: string[];
  priorFailure?: string;
  hasExistingDiff: boolean;
};

function json(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export function buildIterationPrompt(input: IterationPromptInput): string {
  const { story } = input;
  const criteria = story.acceptanceCriteria.map(
    (criterion) => `- ${criterion}`,
  );
  const checks = input.qualityChecks.map((check) => `- ${check}`);
  const diffGuidance = input.hasExistingDiff
    ? "An existing uncommitted diff belongs to this story. Preserve it and continue from it."
    : "Start from the current repository state; do not create unrelated changes.";
  const priorFailure = input.priorFailure
    ? `\n## Prior failure\n\n${input.priorFailure}\n`
    : "";

  return `# Ariadne iteration\n\nYou are working inside the project described below. Follow the repository instructions before editing. This task is runtime neutral: use the tools available in the repository without assuming a particular model provider or command-line client.\n\n${json({ runId: input.runId, projectRoot: input.projectRoot, resultPath: input.resultPath })}\n\n## Story\n\n${story.id}: ${story.title}\n\n${story.description}\n\n## Acceptance criteria\n\n${criteria.join("\n")}\n\n## Quality checks\n\n${checks.join("\n")}\n\n## Working rules\n\n${diffGuidance}\n\nRead all applicable AGENTS.md files before making changes. Write reusable repository knowledge to an applicable AGENTS.md only when it is genuinely durable.\n\nDo not create commits.\nDo not push or otherwise publish Git changes.\nDo not edit .ariadne/prd.json.\nDo not edit .ariadne/progress.md.\nWork on ${story.id} only.\n${priorFailure}\n## Result file\n\nBefore you finish, write exactly one JSON object to the result path above. Its schema is:\n\n${json(
    {
      schemaVersion: 1,
      runId: "string",
      storyId: "string",
      outcome: "completed | failed",
      criteria: [
        { criterion: "string", passed: "boolean", evidence: "string" },
      ],
      summary: "string",
      filesChanged: ["safe relative path"],
      checksAttempted: ["string"],
      learnings: ["string"],
      failureReason: "string (required when outcome is failed)",
    },
  )}\n`;
}
