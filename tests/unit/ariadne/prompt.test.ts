import { describe, expect, it } from "vitest";
import { buildIterationPrompt } from "../../../src/ariadne/prompt.js";
import type { AriadneStory } from "../../../src/ariadne/types.js";

const story: AriadneStory = {
  id: "US-001",
  title: "Exchange protocol",
  description: "Generate a safe, portable agent exchange.",
  acceptanceCriteria: ["Prompt is neutral", "Results are validated"],
  priority: 1,
  status: "in_progress",
  attempts: 1,
};

describe("buildIterationPrompt", () => {
  it("renders the complete neutral story contract", () => {
    const prompt = buildIterationPrompt({
      runId: "run-1",
      story,
      projectRoot: "/work/project",
      resultPath: "/work/project/.ariadne/runs/run-1/result.json",
      qualityChecks: ["pnpm test", "pnpm run typecheck"],
      priorFailure: "The typecheck previously failed.",
      hasExistingDiff: true,
    });

    expect(prompt).toContain("US-001");
    expect(prompt).toContain("Exchange protocol");
    expect(prompt).toContain("Generate a safe, portable agent exchange.");
    expect(prompt).toContain("Prompt is neutral");
    expect(prompt).toContain("Results are validated");
    expect(prompt).toContain("pnpm test");
    expect(prompt).toContain("pnpm run typecheck");
    expect(prompt).toContain("/work/project/.ariadne/runs/run-1/result.json");
    expect(prompt).toContain("The typecheck previously failed.");
    expect(prompt).toContain("existing uncommitted diff");
    expect(prompt).toContain("Do not create commits.");
    expect(prompt).toContain("Do not edit .ariadne/prd.json.");
    expect(prompt).toContain("Do not edit .ariadne/progress.md.");
    expect(prompt).toContain("Work on US-001 only.");
    expect(prompt).toContain("Read all applicable AGENTS.md files");
    expect(prompt).toContain("genuinely durable");
    expect(prompt).toContain("```json");
    expect(prompt).toContain('"schemaVersion": 1');
    expect(prompt).toContain(
      '"failureReason": "string (required when outcome is failed)"',
    );
  });
});
