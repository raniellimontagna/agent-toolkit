import { describe, expect, it } from "vitest";
import { parseAriadneArgs } from "../../../src/ariadne/args.js";

describe("parseAriadneArgs", () => {
  it("parses autonomous run controls", () => {
    expect(
      parseAriadneArgs([
        "run",
        "--runtime",
        "codex",
        "--max-iterations",
        "20",
        "--max-runtime",
        "90m",
        "--dry-run",
        "--json",
      ]),
    ).toEqual({
      kind: "run",
      runtime: "codex",
      maxIterations: 20,
      maxRuntimeMs: 5_400_000,
      dryRun: true,
      json: true,
    });
  });

  it("collects repeated init checks", () => {
    expect(
      parseAriadneArgs([
        "init",
        "--runtime",
        "claude",
        "--check",
        "pnpm run lint",
        "--check",
        "pnpm test",
      ]),
    ).toEqual({
      kind: "init",
      runtime: "claude",
      qualityChecks: ["pnpm run lint", "pnpm test"],
      json: false,
    });
  });

  it.each([
    [[], /requires init, run, status, or doctor/],
    [["run", "--runtime", "amp"], /unsupported runtime/],
    [["run", "--max-iterations", "0"], /positive integer/],
    [["run", "--max-runtime", "later"], /duration/],
    [["status", "--dry-run"], /not valid for status/],
  ])("rejects invalid argv %j", (argv, message) => {
    expect(() => parseAriadneArgs(argv as string[])).toThrow(message);
  });

  it.each([
    [
      ["run", "--runtime", "codex", "--runtime", "claude"],
      /duplicate flag: --runtime/,
    ],
    [["init", "--runtime"], /requires a value/],
    [["run", "--max-runtime", "10d"], /duration/],
    [["doctor", "--unknown"], /unknown flag/],
    [["status", "--check", "pnpm test"], /not valid for status/],
  ])("rejects strict parser violations for argv %j", (argv, message) => {
    expect(() => parseAriadneArgs(argv)).toThrow(message);
  });
});
