import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stageAgentSkillsPackage } from "./build-skills-index.js";
import { REPO_ROOT } from "./context.js";

function usage(): never {
  throw new Error(
    "Usage: stage-agent-skills <destination> | stage-agent-skills --pack-dry-run",
  );
}

function main(args: string[]): void {
  if (args.length === 1 && args[0] === "--pack-dry-run") {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "agent-skills-pack-"),
    );
    const stagingRoot = path.join(tempRoot, "package");
    try {
      stageAgentSkillsPackage(REPO_ROOT, stagingRoot);
      execFileSync("npm", ["pack", "--dry-run"], {
        cwd: stagingRoot,
        stdio: "inherit",
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    return;
  }

  const destination = args[0];
  if (args.length !== 1 || !destination) usage();
  stageAgentSkillsPackage(REPO_ROOT, path.resolve(destination));
}

main(process.argv.slice(2));
