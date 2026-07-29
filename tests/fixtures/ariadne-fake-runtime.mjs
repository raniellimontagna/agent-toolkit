#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const executable = path.basename(process.argv[1] ?? "");
const runtime =
  process.env.ARIADNE_FAKE_RUNTIME ??
  (executable === "agy" ? "antigravity" : executable);
const args = process.argv.slice(2);
const logPath = process.env.ARIADNE_FAKE_LOG;
const stateDir = process.env.ARIADNE_FAKE_STATE_DIR;
const mode = process.env.ARIADNE_FAKE_MODE ?? "happy";

if (!logPath || !stateDir) {
  console.error("ARIADNE_FAKE_LOG and ARIADNE_FAKE_STATE_DIR are required");
  process.exit(2);
}

fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.appendFileSync(logPath, `${JSON.stringify({ runtime, args })}\n`, "utf8");

const versions = {
  claude: "2.1.220",
  codex: "0.145.0",
  opencode: "1.18.8",
  gemini: "0.52.0",
  antigravity: "1.1.8",
};

if (args[0] === "--version") {
  console.log(`${runtime} ${versions[runtime]}`);
  process.exit(0);
}
if (args.includes("--help")) {
  console.log(
    "--print --dangerously-skip-permissions --dangerously-bypass-approvals-and-sandbox --ephemeral -C --auto --dir --prompt --approval-mode --skip-trust",
  );
  process.exit(0);
}
if (
  (runtime === "claude" && args.join(" ") === "auth status") ||
  (runtime === "codex" && args.join(" ") === "login status") ||
  (runtime === "opencode" && args.join(" ") === "providers list")
) {
  console.log("authenticated");
  process.exit(0);
}

const instruction = args.find(
  (argument) =>
    argument.startsWith("Read ") &&
    argument.endsWith(" and follow it exactly."),
);
if (!instruction || !process.env.ARIADNE_RUN_ID) {
  console.error(`Unexpected ${runtime} invocation: ${JSON.stringify(args)}`);
  process.exit(2);
}

const relativePromptPath = instruction.slice(
  "Read ".length,
  -" and follow it exactly.".length,
);
const promptPath = path.resolve(process.cwd(), relativePromptPath);
const prompt = fs.readFileSync(promptPath, "utf8");
const metadataMatch = /```json\n([\s\S]*?)\n```/.exec(prompt);
const storyMatch = /## Story\n\n([^:]+):/.exec(prompt);
const criteriaMatch =
  /## Acceptance criteria\n\n([\s\S]*?)\n\n## Quality checks/.exec(prompt);
if (!metadataMatch || !storyMatch || !criteriaMatch) {
  console.error(`Unable to parse Ariadne prompt: ${promptPath}`);
  process.exit(2);
}

const metadata = JSON.parse(metadataMatch[1]);
const criteria = criteriaMatch[1]
  .split("\n")
  .filter((line) => line.startsWith("- "))
  .map((line) => line.slice(2));
const storyId = storyMatch[1].trim();
const counterPath = path.join(stateDir, `${runtime}.count`);
fs.mkdirSync(stateDir, { recursive: true });
const attempt = fs.existsSync(counterPath)
  ? Number.parseInt(fs.readFileSync(counterPath, "utf8"), 10) + 1
  : 1;
fs.writeFileSync(counterPath, `${attempt}\n`, "utf8");

const fixtureContents =
  mode === "blocked" || (mode === "repair" && attempt === 1)
    ? "broken\n"
    : mode === "interrupt"
      ? "interrupted\n"
      : "complete\n";
fs.writeFileSync(
  path.join(process.cwd(), "fixture.txt"),
  fixtureContents,
  "utf8",
);

if (mode === "interrupt") {
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  process.kill(process.ppid, "SIGINT");
  setInterval(() => undefined, 1_000);
} else if (mode !== "missing-result") {
  fs.mkdirSync(path.dirname(metadata.resultPath), { recursive: true });
  fs.writeFileSync(
    metadata.resultPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId: metadata.runId,
        storyId,
        outcome: "completed",
        criteria: criteria.map((criterion) => ({
          criterion,
          passed: true,
          evidence: "fixture written by deterministic fake runtime",
        })),
        summary: `Completed ${storyId} with ${runtime}`,
        filesChanged: ["fixture.txt"],
        checksAttempted: [],
        learnings: ["Fake runtimes never call a network service."],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
