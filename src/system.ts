import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { die } from "./logger.js";

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  capture?: boolean;
};

export type RunResult = {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
  error?: Error;
};

export function findCommand(command: string): string | null {
  const pathValue = process.env.PATH || "";
  const pathExt =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of pathExt) {
      const candidate = path.join(dir, `${command}${ext}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Continue scanning PATH.
      }
    }
  }

  return null;
}

export function commandExists(command: string): boolean {
  return Boolean(findCommand(command));
}

type SpawnPlan = {
  command: string;
  args: string[];
  verbatim: boolean;
};

function escapeCmdArg(arg: string): string {
  // cmd.exe quoting in the cross-spawn style: double backslashes that precede
  // a quote, double trailing backslashes, escape quotes, wrap in quotes.
  let result = arg.replace(/(\\*)"/g, '$1$1\\"');
  result = result.replace(/(\\*)$/, "$1$1");
  return `"${result}"`;
}

export function windowsSpawnPlan(
  command: string,
  args: string[],
  resolve: (command: string) => string | null = findCommand,
): SpawnPlan {
  // Node >= 18.20 refuses to spawn .cmd/.bat shims directly (CVE-2024-27980),
  // so npm/npx-style shims must be routed through cmd.exe explicitly.
  const hasBatchExtension = (value: string) =>
    value.toLowerCase().endsWith(".cmd") ||
    value.toLowerCase().endsWith(".bat");

  const resolved = hasBatchExtension(command)
    ? command
    : (resolve(command) ?? command);
  if (!hasBatchExtension(resolved)) {
    return { command, args, verbatim: false };
  }

  const commandLine = [escapeCmdArg(resolved), ...args.map(escapeCmdArg)].join(
    " ",
  );
  return {
    command: process.env.comspec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    verbatim: true,
  };
}

export function run(
  command: string,
  args: string[] = [],
  options: RunOptions = {},
): RunResult {
  const plan =
    process.platform === "win32"
      ? windowsSpawnPlan(command, args)
      : { command, args, verbatim: false };

  const result = spawnSync(plan.command, plan.args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsVerbatimArguments: plan.verbatim || undefined,
  });

  if (result.error) {
    return {
      ok: false,
      status: typeof result.status === "number" ? result.status : 1,
      stdout: result.stdout || "",
      stderr: result.stderr || result.error.message,
      error: result.error,
    };
  }

  return {
    ok: result.status === 0,
    status: result.status ?? 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function capture(command: string, args: string[] = []): RunResult {
  return run(command, args, { capture: true });
}

export function requireCommand(command: string): void {
  if (!commandExists(command)) die(`Missing prerequisite: ${command}`);
}

export function requireNode(requiredMajor: number): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (!Number.isInteger(major) || major < requiredMajor) {
    die(`Node.js >= ${requiredMajor} is required. Current: ${process.version}`);
  }
}

export function isInsecureRedirect(fromUrl: string, toUrl: string): boolean {
  return fromUrl.startsWith("https:") && !toUrl.startsWith("https:");
}

function requestBuffer(url: string, redirects = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("Too many redirects"));
      return;
    }

    const client = url.startsWith("https:") ? https : http;
    const request = client.get(
      url,
      {
        headers: {
          "User-Agent": "agent-toolkit",
          Accept: "application/vnd.github+json, application/json",
        },
      },
      (response) => {
        const { statusCode = 0, headers } = response;
        if (
          [301, 302, 303, 307, 308].includes(statusCode) &&
          headers.location
        ) {
          response.resume();
          const nextUrl = new URL(headers.location, url).toString();
          if (isInsecureRedirect(url, nextUrl)) {
            reject(
              new Error(`Refusing insecure redirect from ${url} to ${nextUrl}`),
            );
            return;
          }
          requestBuffer(nextUrl, redirects + 1).then(resolve, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );

    request.on("error", reject);
  });
}

export async function fetchJson(url: string): Promise<unknown> {
  const buffer = await requestBuffer(url);
  return JSON.parse(buffer.toString("utf8"));
}

export async function downloadFile(
  url: string,
  destination: string,
): Promise<void> {
  const buffer = await requestBuffer(url);
  fs.writeFileSync(destination, buffer);
}
