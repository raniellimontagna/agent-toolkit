import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http, { type ClientRequest, type IncomingMessage } from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
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
  return (
    new URL(fromUrl).protocol === "https:" &&
    new URL(toUrl).protocol !== "https:"
  );
}

export type HttpRequestOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

type ResolvedHttpRequestOptions = {
  timeoutMs: number;
  maxBytes: number;
};

const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const DEFAULT_JSON_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_DOWNLOAD_MAX_BYTES = 512 * 1024 * 1024;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

class HttpTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`HTTP request timed out after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
  }
}

class HttpSizeLimitError extends Error {
  constructor(maxBytes: number) {
    super(`HTTP response exceeds the maximum size of ${maxBytes} bytes`);
    this.name = "HttpSizeLimitError";
  }
}

function assertPositiveFiniteInteger(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite integer`);
  }
}

function resolveHttpRequestOptions(
  options: HttpRequestOptions,
  defaultMaxBytes: number,
): ResolvedHttpRequestOptions {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? defaultMaxBytes;
  assertPositiveFiniteInteger("timeoutMs", timeoutMs);
  assertPositiveFiniteInteger("maxBytes", maxBytes);
  return { timeoutMs, maxBytes };
}

function parseHttpUrl(url: string | URL): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  return parsed;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function destroyResponse(response: IncomingMessage): void {
  response.on("error", () => undefined);
  response.destroy();
}

function consumeHttpResponse<T>(
  initialUrl: URL,
  options: ResolvedHttpRequestOptions,
  consumer: (response: IncomingMessage) => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;

  const requestUrl = (url: URL, redirects: number): Promise<T> => {
    if (redirects > 5) {
      return Promise.reject(new Error("Too many redirects"));
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return Promise.reject(new HttpTimeoutError(options.timeoutMs));
    }

    return new Promise<T>((resolve, reject) => {
      let request: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      let consumerPromise: Promise<T> | undefined;
      let timer: NodeJS.Timeout | undefined;
      let settlementStarted = false;

      const clearTimer = () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      };

      const resolveOnce = (value: T) => {
        if (settlementStarted) return;
        settlementStarted = true;
        clearTimer();
        resolve(value);
      };

      const rejectOnce = (
        error: unknown,
        destroyActive = true,
        waitForConsumer = true,
      ) => {
        if (settlementStarted) return;
        settlementStarted = true;
        clearTimer();
        const normalizedError = toError(error);
        if (destroyActive) {
          if (response && !response.destroyed) {
            response.destroy(normalizedError);
          }
          if (request && !request.destroyed) request.destroy(normalizedError);
        }
        if (waitForConsumer && consumerPromise) {
          void consumerPromise.then(
            () => reject(normalizedError),
            () => reject(normalizedError),
          );
          return;
        }
        reject(normalizedError);
      };

      timer = setTimeout(() => {
        rejectOnce(new HttpTimeoutError(options.timeoutMs));
      }, remainingMs);

      const client = url.protocol === "https:" ? https : http;
      try {
        const activeRequest = client.get(
          url,
          {
            headers: {
              "User-Agent": "agent-toolkit",
              Accept: "application/vnd.github+json, application/json",
            },
          },
          (incomingResponse) => {
            if (settlementStarted) {
              incomingResponse.destroy();
              return;
            }
            response = incomingResponse;
            const onResponseError = (error: Error) => rejectOnce(error);
            response.once("error", onResponseError);

            const { statusCode = 0, headers } = response;
            if (REDIRECT_STATUS_CODES.has(statusCode) && headers.location) {
              let nextUrl: URL;
              try {
                nextUrl = parseHttpUrl(new URL(headers.location, url));
              } catch (error) {
                rejectOnce(error);
                return;
              }
              if (isInsecureRedirect(url.toString(), nextUrl.toString())) {
                rejectOnce(
                  new Error(
                    `Refusing insecure redirect from ${url} to ${nextUrl}`,
                  ),
                );
                return;
              }

              const redirectResponse = response;
              redirectResponse.off("error", onResponseError);
              clearTimer();
              request = undefined;
              response = undefined;
              destroyResponse(redirectResponse);
              void requestUrl(nextUrl, redirects + 1).then(
                resolveOnce,
                rejectOnce,
              );
              return;
            }

            if (statusCode < 200 || statusCode >= 300) {
              rejectOnce(new Error(`HTTP ${statusCode}`));
              return;
            }

            const contentLength = headers["content-length"];
            if (
              contentLength !== undefined &&
              Number(contentLength) > options.maxBytes
            ) {
              rejectOnce(new HttpSizeLimitError(options.maxBytes));
              return;
            }

            try {
              consumerPromise = consumer(response);
              void consumerPromise.then(resolveOnce, (error) =>
                rejectOnce(error, true, false),
              );
            } catch (error) {
              rejectOnce(error, true, false);
            }
          },
        );
        request = activeRequest;
        activeRequest.once("error", (error) => {
          if (request === activeRequest) rejectOnce(error);
        });
      } catch (error) {
        rejectOnce(error);
      }
    });
  };

  return requestUrl(initialUrl, 0);
}

function createByteLimitTransform(maxBytes: number): Transform {
  let receivedBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > maxBytes) {
        callback(new HttpSizeLimitError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });
}

export function fetchJson(
  url: string,
  options: HttpRequestOptions = {},
): Promise<unknown> {
  const resolvedOptions = resolveHttpRequestOptions(
    options,
    DEFAULT_JSON_MAX_BYTES,
  );
  const parsedUrl = parseHttpUrl(url);
  const chunks: Buffer[] = [];

  return consumeHttpResponse(parsedUrl, resolvedOptions, async (response) => {
    const collector = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    await pipeline(
      response,
      createByteLimitTransform(resolvedOptions.maxBytes),
      collector,
    );
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  });
}

export function downloadFile(
  url: string,
  destination: string,
  options: HttpRequestOptions = {},
): Promise<void> {
  const resolvedOptions = resolveHttpRequestOptions(
    options,
    DEFAULT_DOWNLOAD_MAX_BYTES,
  );
  const parsedUrl = parseHttpUrl(url);
  const partialPath = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${randomUUID()}.partial`,
  );

  return (async () => {
    try {
      await consumeHttpResponse(
        parsedUrl,
        resolvedOptions,
        async (response) => {
          await pipeline(
            response,
            createByteLimitTransform(resolvedOptions.maxBytes),
            fs.createWriteStream(partialPath, { flags: "wx" }),
          );
        },
      );
      await fs.promises.rename(partialPath, destination);
    } catch (error) {
      try {
        await fs.promises.rm(partialPath, { force: true });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Failed to remove partial download ${partialPath}`,
        );
      }
      throw error;
    }
  })();
}
