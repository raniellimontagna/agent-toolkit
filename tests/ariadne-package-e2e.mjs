import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "ariadne-package-e2e-"),
);
const packDirectory = path.join(temporaryRoot, "pack");
const consumer = path.join(temporaryRoot, "consumer");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function command(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 120_000,
    shell: process.platform === "win32",
  });
  assert.equal(
    result.status,
    0,
    `${executable} ${args.join(" ")} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr || result.error?.message || ""}`,
  );
  return result.stdout ?? "";
}

try {
  fs.mkdirSync(packDirectory, { recursive: true });
  fs.mkdirSync(consumer, { recursive: true });
  fs.writeFileSync(
    path.join(consumer, "package.json"),
    `${JSON.stringify({ name: "ariadne-package-consumer", private: true }, null, 2)}\n`,
    "utf8",
  );

  const packReport = JSON.parse(
    command(
      npm,
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        packDirectory,
      ],
      root,
    ),
  );
  const filename = packReport[0]?.filename;
  assert.equal(typeof filename, "string", "npm pack did not report a tarball");
  const tarball = path.join(packDirectory, filename);
  assert.equal(
    fs.existsSync(tarball),
    true,
    `Missing packed tarball: ${tarball}`,
  );

  command(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      tarball,
    ],
    consumer,
  );

  const ariadneHelp = command(
    npx,
    ["--no-install", "agent-toolkit", "ariadne", "--help"],
    consumer,
  );
  for (const subcommand of ["init", "run", "status", "doctor"]) {
    assert.match(ariadneHelp, new RegExp(`ariadne ${subcommand}`));
  }

  const legacyHelp = command(
    npx,
    ["--no-install", "agent-toolkit", "--help"],
    consumer,
  );
  assert.match(legacyHelp, /Agent Toolkit/);

  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  console.log("Ariadne installed-tarball E2E passed");
} catch (error) {
  console.error(`Ariadne package fixture retained at ${temporaryRoot}`);
  throw error;
}
