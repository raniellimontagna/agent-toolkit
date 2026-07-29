#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const realGit = process.env.ARIADNE_REAL_GIT;
const logPath = process.env.ARIADNE_GIT_LOG;
if (!realGit || !logPath) {
  console.error("ARIADNE_REAL_GIT and ARIADNE_GIT_LOG are required");
  process.exit(2);
}

const args = process.argv.slice(2);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.appendFileSync(logPath, `${JSON.stringify(args)}\n`, "utf8");
const result = spawnSync(realGit, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
