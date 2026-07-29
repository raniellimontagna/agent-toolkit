import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AgentResult,
  formatProgressEntry,
  readAgentResult,
} from "../../../src/ariadne/result.js";
import { validateAgentResult } from "../../../src/ariadne/schema.js";
import type { AriadneStory } from "../../../src/ariadne/types.js";

const directories: string[] = [];
const expected = {
  runId: "run-1",
  storyId: "US-001",
  acceptanceCriteria: ["Tests pass"],
  projectRoot: "/work/project",
};
const result: AgentResult = {
  schemaVersion: 1,
  runId: "run-1",
  storyId: "US-001",
  outcome: "completed",
  criteria: [{ criterion: "Tests pass", passed: true, evidence: "pnpm test" }],
  summary: "Implemented the loop.",
  filesChanged: ["src/ariadne/loop.ts"],
  checksAttempted: ["pnpm test"],
  learnings: ["Loop state is owned by Ariadne."],
};
const story: AriadneStory = {
  id: "US-001",
  title: "Exchange protocol",
  description: "Generate a safe exchange.",
  acceptanceCriteria: ["Tests pass"],
  priority: 1,
  status: "in_progress",
  attempts: 1,
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("validateAgentResult", () => {
  it("accepts a complete result for the expected run and story", () => {
    expect(validateAgentResult(result, expected)).toEqual(result);
  });

  it.each([
    ["run ID", { ...result, runId: "run-2" }],
    ["story ID", { ...result, storyId: "US-002" }],
    ["missing criterion", { ...result, criteria: [] }],
    [
      "duplicate criterion",
      { ...result, criteria: [...result.criteria, result.criteria[0]] },
    ],
    [
      "false completed criterion",
      { ...result, criteria: [{ ...result.criteria[0], passed: false }] },
    ],
    ["unsafe changed file", { ...result, filesChanged: ["../secret"] }],
    [
      "empty failure reason",
      { ...result, outcome: "failed", failureReason: "" },
    ],
    ["unknown top-level field", { ...result, unexpected: true }],
    [
      "unknown criterion field",
      {
        ...result,
        criteria: [{ ...result.criteria[0], unexpected: true }],
      },
    ],
  ])("rejects a %s", (_label, invalid) => {
    expect(() => validateAgentResult(invalid, expected)).toThrow();
  });
});

describe("agent result files and durable progress", () => {
  it("reads and validates a JSON result file", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-result-"));
    directories.push(directory);
    const source = path.join(directory, "result.json");
    fs.writeFileSync(source, `${JSON.stringify(result)}\n`);

    expect(readAgentResult(source, expected)).toEqual(result);
  });

  it("formats deterministic metadata-only progress without raw process output", () => {
    const progress = formatProgressEntry({
      timestamp: "2026-07-29T00:00:00.000Z",
      runId: "run-1",
      story,
      runtime: "codex",
      result,
      checks: [
        {
          command: "pnpm test",
          status: 0,
          durationMs: 123,
          stdoutPath: "/private/stdout.log",
          stderrPath: "/private/stderr.log",
        },
      ],
      commit: "abc123",
    });

    expect(progress).toContain("2026-07-29T00:00:00.000Z");
    expect(progress).toContain("US-001");
    expect(progress).toContain("completed");
    expect(progress).toContain("pnpm test: passed (123ms)");
    expect(progress).toContain("commit: abc123");
    expect(progress).not.toContain("/private/stdout.log");
    expect(progress).not.toContain("/private/stderr.log");
    expect(progress).not.toContain(result.summary);
    expect(progress).not.toContain(result.learnings[0] ?? "");
    expect(progress).toMatch(/---\n$/);
  });
});
