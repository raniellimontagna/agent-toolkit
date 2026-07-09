import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifySha256File } from "../checksum.js";
import { color, err, info, ok, step, warn } from "../logger.js";
import { state } from "../state.js";
import {
  capture,
  downloadFile,
  fetchJson,
  findCommand,
  requireCommand,
  run,
} from "../system.js";

type RtkRelease = {
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
};

function detectRtkAsset(): string | null {
  const osName = process.platform;
  const arch = process.arch;

  if (osName === "linux" && arch === "x64")
    return "rtk-x86_64-unknown-linux-musl.tar.gz";
  if (osName === "linux" && arch === "arm64")
    return "rtk-aarch64-unknown-linux-gnu.tar.gz";
  if (osName === "darwin" && arch === "arm64")
    return "rtk-aarch64-apple-darwin.tar.gz";
  if (osName === "darwin" && arch === "x64")
    return "rtk-x86_64-apple-darwin.tar.gz";
  if (osName === "win32" && arch === "x64")
    return "rtk-x86_64-pc-windows-msvc.zip";

  return null;
}

function findRtkBinary(root: string): string | null {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findRtkBinary(candidate);
      if (nested) return nested;
    } else if (
      entry.isFile() &&
      (entry.name === "rtk" || entry.name === "rtk.exe")
    ) {
      return candidate;
    }
  }

  return null;
}

function writeWindowsRtkShim(shimPath: string): void {
  const shim = `#!/usr/bin/env bash
set -uo pipefail

script_dir="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
exe="$script_dir/rtk.exe"
exec "$exe" "$@"
`;
  fs.writeFileSync(shimPath, shim, { mode: 0o755 });
}

export async function installRtk(): Promise<boolean> {
  step("RTK - Rust Token Killer");
  console.log("   Reduces token volume in coding-agent workflows");

  const existing = findCommand("rtk");
  if (existing) {
    const version =
      capture(existing, ["--version"]).stdout.trim().split("\n")[0] ||
      "installed";
    ok(`RTK already installed - ${version} (${existing})`);
    const gain = capture(existing, ["gain"]);
    if (!gain.ok) {
      warn(
        "Attention: 'rtk gain' failed. There may be another incompatible 'rtk' binary first on PATH.",
      );
    }
    return true;
  }

  const assetName = detectRtkAsset();
  if (!assetName) {
    err(
      `Unsupported operating system or architecture: ${process.platform}/${process.arch}`,
    );
    err(
      "Download RTK manually from: https://github.com/rtk-ai/rtk/releases/latest",
    );
    return false;
  }

  info("Querying pinned RTK release...");
  let release: RtkRelease;
  try {
    release = (await fetchJson(state.rtkGithub)) as RtkRelease;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    err(`Could not query RTK release metadata: ${message}`);
    return false;
  }

  const asset = Array.isArray(release.assets)
    ? release.assets.find((item) => item && item.name === assetName)
    : null;
  const downloadUrl = asset?.browser_download_url;
  if (!downloadUrl) {
    err(`Could not find RTK asset in latest release: ${assetName}`);
    return false;
  }

  fs.mkdirSync(state.rtkInstallDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-toolkit-rtk-"));
  try {
    const archivePath = path.join(tempDir, "rtk-package");
    info(`Downloading ${assetName}...`);
    await downloadFile(downloadUrl, archivePath);

    const expectedSha256 = state.rtkAssetChecksums[assetName];
    if (!expectedSha256) {
      err(`Missing RTK checksum in tools.lock.json for asset: ${assetName}`);
      return false;
    }

    if (!verifySha256File(archivePath, expectedSha256)) {
      err(`RTK checksum verification failed for asset: ${assetName}`);
      return false;
    }
    ok(`Verified RTK asset checksum: ${assetName}`);

    if (assetName.endsWith(".zip")) {
      requireCommand("unzip");
      const unzip = run("unzip", ["-q", archivePath, "-d", tempDir]);
      if (!unzip.ok) return false;
    } else {
      requireCommand("tar");
      const tar = run("tar", ["-xzf", archivePath, "-C", tempDir]);
      if (!tar.ok) return false;
    }

    const rtkBinary = findRtkBinary(tempDir);
    if (!rtkBinary) {
      err("RTK binary not found after extraction.");
      return false;
    }

    fs.chmodSync(rtkBinary, 0o755);
    const installedPath = path.join(
      state.rtkInstallDir,
      process.platform === "win32" ? "rtk.exe" : "rtk",
    );
    fs.copyFileSync(rtkBinary, installedPath);
    fs.chmodSync(installedPath, 0o755);

    const rtkCommand =
      process.platform === "win32"
        ? path.join(state.rtkInstallDir, "rtk")
        : installedPath;
    if (process.platform === "win32") writeWindowsRtkShim(rtkCommand);

    if (
      !(process.env.PATH || "")
        .split(path.delimiter)
        .includes(state.rtkInstallDir)
    ) {
      warn(`Directory ${state.rtkInstallDir} is not on PATH.`);
      console.log(
        `     ${color.cyan}export PATH="$HOME/.local/bin:$PATH"${color.reset}`,
      );
    }

    const version = capture(rtkCommand, ["--version"]);
    if (version.ok) {
      ok(
        `RTK installed successfully - ${version.stdout.trim().split("\n")[0]}`,
      );
    } else {
      err(`RTK installed, but failed to run: ${rtkCommand}`);
      err(
        (version.stderr || version.stdout || "unknown error")
          .trim()
          .split("\n")[0] ?? "unknown error",
      );
      return false;
    }

    info("Checking RTK integration hooks...");
    const hookInit = capture(rtkCommand, ["init", "--global", "--auto-patch"]);
    if (hookInit.ok) ok("RTK hooks installed for AI agent integration");
    else
      warn(
        "RTK hook setup did not complete automatically. Run 'rtk init --global --auto-patch' manually to enable RTK-aware hooks.",
      );

    return true;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
