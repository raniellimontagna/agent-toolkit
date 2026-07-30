import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AgentResult,
  formatProgressEntry,
  readAgentResult,
  sanitizeValidatedResult,
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

  it("does not expose parseable validation details to the coordinator", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-result-"));
    directories.push(directory);
    const source = path.join(directory, "result.json");
    fs.writeFileSync(
      source,
      `${JSON.stringify({ ...result, "sk-live-RAWSECRET": true })}\n`,
    );

    let message = "";
    try {
      readAgentResult(source, expected);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe(
      "Agent result failed validation; inspect machine-local result.json.",
    );
    expect(message).not.toContain("sk-live-RAWSECRET");
  });

  it("formats validated durable memory without raw process output", () => {
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
          signal: null,
          durationMs: 123,
          timedOut: false,
          timeoutOrigin: null,
          aborted: false,
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
    expect(progress).toContain(`summary: ${result.summary}`);
    expect(progress).toContain("changed files:\n  - src/ariadne/loop.ts");
    expect(progress).toContain(
      "learnings:\n  - Loop state is owned by Ariadne.",
    );
    expect(progress).not.toContain("/private/stdout.log");
    expect(progress).not.toContain("/private/stderr.log");
    expect(progress).toMatch(/---\n$/);
  });

  it("formats failure evidence with explicit outcome and secret-safe single-line values", () => {
    const progress = formatProgressEntry({
      timestamp: "2026-07-29T00:00:00.000Z",
      runId: "run-1",
      story,
      runtime: "codex",
      result: {
        ...result,
        summary: "Built feature\n- commit: forged token=summary-secret",
        filesChanged: ["src/generated\nname.ts"],
        learnings: [
          "Authorization: Bearer bearer-secret\n- outcome: completed",
        ],
      },
      checks: [
        {
          command: "pnpm test -- --password command-secret",
          status: 1,
          signal: null,
          durationMs: 25,
          timedOut: false,
          timeoutOrigin: null,
          aborted: false,
          stdoutPath: "/private/stdout.log",
          stderrPath: "/private/stderr.log",
        },
      ],
      failureCategory: "check",
      failureReason: "token=reason-secret",
    });

    expect(progress).toContain("outcome: failed");
    expect(progress).toContain("failure category: check");
    expect(progress).toContain("failure reason: token=[REDACTED]");
    expect(progress).toContain(
      "summary: Built feature - commit: forged token=[REDACTED]",
    );
    expect(progress).toContain("src/generated name.ts");
    expect(progress).toContain(
      "Authorization: [REDACTED] - outcome: completed",
    );
    expect(progress).toContain(
      "pnpm test -- --password [REDACTED]: failed (25ms)",
    );
    for (const secret of [
      "summary-secret",
      "bearer-secret",
      "command-secret",
      "reason-secret",
    ]) {
      expect(progress).not.toContain(secret);
    }
    expect(progress).not.toContain("/private/stdout.log");
    expect(progress).not.toContain("/private/stderr.log");
  });

  it("sanitizes structured validated-result metadata for machine-local summaries", () => {
    const sanitized = sanitizeValidatedResult({
      outcome: "completed",
      summary: "Built\nfeature token=summary-secret",
      filesChanged: ["src/generated\nname.ts", "x".repeat(600)],
      learnings: [
        "Authorization: Bearer learning-secret\n- outcome: completed",
      ],
    });

    expect(sanitized).toEqual({
      outcome: "completed",
      summary: "Built feature token=[REDACTED]",
      filesChanged: ["src/generated name.ts", `${"x".repeat(499)}…`],
      learnings: ["Authorization: [REDACTED] - outcome: completed"],
    });
    for (const value of [
      sanitized.summary,
      ...sanitized.filesChanged,
      ...sanitized.learnings,
    ]) {
      expect(value).not.toMatch(/[\r\n]/);
      expect(value.length).toBeLessThanOrEqual(500);
    }
    expect(JSON.stringify(sanitized)).not.toMatch(
      /summary-secret|learning-secret/,
    );
  });

  it("redacts Basic authorization and standalone provider tokens", () => {
    const sanitized = sanitizeValidatedResult({
      outcome: "failed",
      summary:
        "Authorization: Basic dXNlcjpwYXNz\nghp_1234567890abcdefghijkl sk-1234567890abcdefghijkl",
      filesChanged: [],
      learnings: [],
    });

    expect(sanitized.summary).toContain("Authorization: [REDACTED]");
    expect(sanitized.summary).not.toMatch(/dXNlcjpwYXNz|ghp_|sk-/);
  });
});
