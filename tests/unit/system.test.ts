import nodeFs from "node:fs";
import fs from "node:fs/promises";
import http, { type RequestListener, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadFile,
  fetchJson,
  isInsecureRedirect,
  windowsSpawnPlan,
} from "../../src/system.js";

const servers = new Set<Server>();
const sockets = new Set<Socket>();
const temporaryDirectories = new Set<string>();

async function startServer(
  listener: RequestListener,
): Promise<{ baseUrl: string }> {
  const server = http.createServer(listener);
  servers.add(server);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-toolkit-system-"),
  );
  temporaryDirectories.add(directory);
  return directory;
}

async function waitForSocketClose(
  socket: Socket,
  waitMs = 200,
): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (!socket.destroyed && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return socket.destroyed;
}

type Outcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: unknown }
  | { status: "pending" };

async function settleWithin<T>(
  promise: Promise<T>,
  waitMs = 300,
): Promise<Outcome<T>> {
  let timer: NodeJS.Timeout | undefined;
  const pending = new Promise<Outcome<T>>((resolve) => {
    timer = setTimeout(() => resolve({ status: "pending" }), waitMs);
  });
  const settled: Promise<Outcome<T>> = promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (error: unknown) => ({ status: "rejected" as const, error }),
  );

  const outcome = await Promise.race([settled, pending]);
  if (timer) clearTimeout(timer);
  return outcome;
}

function expectRejection(outcome: Outcome<unknown>, category: RegExp): void {
  expect(outcome.status).toBe("rejected");
  if (outcome.status !== "rejected") return;
  expect(outcome.error).toBeInstanceOf(Error);
  expect((outcome.error as Error).message).toMatch(category);
}

function captureSynchronousError(callback: () => unknown): unknown {
  try {
    const result = callback();
    if (result instanceof Promise) void result.catch(() => undefined);
    return undefined;
  } catch (error) {
    return error;
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets) socket.destroy();
  sockets.clear();

  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  servers.clear();

  await Promise.all(
    [...temporaryDirectories].map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
  temporaryDirectories.clear();
});

describe("isInsecureRedirect", () => {
  it("flags https to http downgrades", () => {
    expect(
      isInsecureRedirect(
        "https://api.github.com/releases",
        "http://attacker.example/payload",
      ),
    ).toBe(true);
  });

  it("allows https to https redirects", () => {
    expect(
      isInsecureRedirect(
        "https://api.github.com/releases",
        "https://objects.githubusercontent.com/asset",
      ),
    ).toBe(false);
  });

  it("allows redirects that start from http", () => {
    expect(
      isInsecureRedirect(
        "http://internal.example",
        "http://internal.example/next",
      ),
    ).toBe(false);
  });
});

describe("windowsSpawnPlan", () => {
  it("routes cmd shims through cmd.exe with an escaped command line", () => {
    const plan = windowsSpawnPlan(
      "npx",
      ["-y", "@opengsd/gsd-core@1.6.1", "--global"],
      () => "C:\\nodejs\\npx.CMD",
    );

    expect(plan.command.toLowerCase()).toContain("cmd");
    expect(plan.verbatim).toBe(true);
    expect(plan.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(plan.args[3]).toBe(
      '""C:\\nodejs\\npx.CMD" "-y" "@opengsd/gsd-core@1.6.1" "--global""',
    );
  });

  it("escapes quotes and trailing backslashes in arguments", () => {
    const plan = windowsSpawnPlan(
      "npm.cmd",
      ['say "hi"', "C:\\path with space\\"],
      () => null,
    );

    expect(plan.args[3]).toBe(
      '""npm.cmd" "say \\"hi\\"" "C:\\path with space\\\\""',
    );
  });

  it("leaves executables untouched", () => {
    const plan = windowsSpawnPlan("git", ["status"], () => "C:\\git\\git.EXE");

    expect(plan).toEqual({
      command: "git",
      args: ["status"],
      verbatim: false,
    });
  });

  it("leaves unresolved commands untouched", () => {
    const plan = windowsSpawnPlan("missing-tool", ["--version"], () => null);

    expect(plan).toEqual({
      command: "missing-tool",
      args: ["--version"],
      verbatim: false,
    });
  });
});

describe("bounded HTTP requests", () => {
  it("fetches a small JSON response", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ release: "1.2.3" }));
    });

    await expect(fetchJson(`${baseUrl}/release`)).resolves.toEqual({
      release: "1.2.3",
    });
  });

  it("rejects unsupported protocols synchronously", () => {
    const error = captureSynchronousError(() =>
      fetchJson("ftp://example.test/release.json"),
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/protocol/i);
  });

  it("validates request budgets synchronously", () => {
    for (const value of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN]) {
      const timeoutError = captureSynchronousError(() =>
        fetchJson("http://127.0.0.1/release.json", { timeoutMs: value }),
      );
      const sizeError = captureSynchronousError(() =>
        downloadFile("http://127.0.0.1/archive", "/unused", {
          maxBytes: value,
        }),
      );

      expect(timeoutError).toBeInstanceOf(Error);
      expect(sizeError).toBeInstanceOf(Error);
    }
  });

  it("times out a response that never completes", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"release":');
    });

    const outcome = await settleWithin(
      fetchJson(`${baseUrl}/stalled`, { timeoutMs: 60 }),
    );

    expectRejection(outcome, /timeout|timed out|deadline/i);
  });

  it("shares one total deadline across redirects", async () => {
    const { baseUrl } = await startServer((request, response) => {
      if (request.url === "/first") {
        setTimeout(() => {
          response.writeHead(302, { Location: "/second" });
          response.end();
        }, 50);
        return;
      }

      setTimeout(() => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ tooLate: true }));
      }, 50);
    });

    const outcome = await settleWithin(
      fetchJson(`${baseUrl}/first`, { timeoutMs: 75 }),
    );

    expectRejection(outcome, /timeout|timed out|deadline/i);
  });

  it("closes stalled redirect and final-response sockets at the total deadline", async () => {
    let redirectSocket: Socket | undefined;
    let finalSocket: Socket | undefined;
    const { baseUrl } = await startServer((request, response) => {
      if (request.url === "/first") {
        redirectSocket = request.socket;
        response.writeHead(302, { Location: "/second" });
        response.write("stalled redirect body");
        return;
      }

      finalSocket = request.socket;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"release":');
    });

    const outcome = await settleWithin(
      fetchJson(`${baseUrl}/first`, { timeoutMs: 75 }),
    );

    expectRejection(outcome, /timeout|timed out|deadline/i);
    expect(redirectSocket).toBeDefined();
    expect(finalSocket).toBeDefined();
    if (!redirectSocket || !finalSocket) return;
    expect(await waitForSocketClose(redirectSocket)).toBe(true);
    expect(await waitForSocketClose(finalSocket)).toBe(true);
    expect(sockets.has(redirectSocket)).toBe(false);
    expect(sockets.has(finalSocket)).toBe(false);
  });

  it("closes a stalled non-success response before rejecting", async () => {
    let errorSocket: Socket | undefined;
    const { baseUrl } = await startServer((request, response) => {
      errorSocket = request.socket;
      response.writeHead(503);
      response.write("stalled service error");
    });

    await expect(
      fetchJson(`${baseUrl}/unavailable`, { timeoutMs: 75 }),
    ).rejects.toThrow(/HTTP 503/i);

    expect(errorSocket).toBeDefined();
    if (!errorSocket) return;
    expect(await waitForSocketClose(errorSocket)).toBe(true);
    expect(sockets.has(errorSocket)).toBe(false);
  });

  it("rejects an oversized Content-Length before reading the body", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(200, {
        "Content-Length": "100",
        "Content-Type": "application/json",
      });
      response.flushHeaders();
    });

    const outcome = await settleWithin(
      fetchJson(`${baseUrl}/declared-large`, {
        maxBytes: 10,
        timeoutMs: 100,
      }),
    );

    expectRejection(outcome, /size|large|limit|maximum/i);
  });

  it("rejects a chunked response that crosses the byte limit", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.write("123456");
      response.end("789012");
    });

    await expect(
      fetchJson(`${baseUrl}/chunked-large`, { maxBytes: 10 }),
    ).rejects.toThrow(/size|large|limit|maximum/i);
  });

  it("streams a small download to the exact destination", async () => {
    const directory = await makeTemporaryDirectory();
    const destination = path.join(directory, "archive.tgz");
    const payload = Buffer.from("small archive payload");
    const { baseUrl } = await startServer((_request, response) => {
      response.setHeader("Content-Length", payload.byteLength);
      response.end(payload);
    });

    await downloadFile(`${baseUrl}/archive`, destination);

    await expect(fs.readFile(destination)).resolves.toEqual(payload);
    await expect(fs.readdir(directory)).resolves.toEqual(["archive.tgz"]);
  });

  it("removes the partial file after an oversized download", async () => {
    const directory = await makeTemporaryDirectory();
    const destination = path.join(directory, "archive.tgz");
    const { baseUrl } = await startServer((_request, response) => {
      response.write("123456");
      response.end("789012");
    });

    await expect(
      downloadFile(`${baseUrl}/archive`, destination, { maxBytes: 10 }),
    ).rejects.toThrow(/size|large|limit|maximum/i);
    await expect(fs.readdir(directory)).resolves.toEqual([]);
  });

  it("removes the partial file after a timed-out download", async () => {
    const directory = await makeTemporaryDirectory();
    const destination = path.join(directory, "archive.tgz");
    const { baseUrl } = await startServer((_request, response) => {
      response.write("partial archive");
    });

    const outcome = await settleWithin(
      downloadFile(`${baseUrl}/archive`, destination, { timeoutMs: 60 }),
    );

    expectRejection(outcome, /timeout|timed out|deadline/i);
    await expect(fs.readdir(directory)).resolves.toEqual([]);
  });

  it("waits for delayed file-open teardown before removing a timed-out partial", async () => {
    const directory = await makeTemporaryDirectory();
    const destination = path.join(directory, "archive.tgz");
    const originalOpen = nodeFs.open;
    vi.spyOn(nodeFs, "open").mockImplementation(((
      ...args: Parameters<typeof nodeFs.open>
    ) => {
      setTimeout(() => originalOpen(...args), 100);
    }) as typeof nodeFs.open);
    const { baseUrl } = await startServer((_request, response) => {
      response.write("partial archive");
    });

    const outcome = await settleWithin(
      downloadFile(`${baseUrl}/archive`, destination, { timeoutMs: 50 }),
    );

    expectRejection(outcome, /timeout|timed out|deadline/i);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(fs.readdir(directory)).resolves.toEqual([]);
  });

  it("successfully replaces a preexisting destination", async () => {
    const directory = await makeTemporaryDirectory();
    const destination = path.join(directory, "archive.tgz");
    await fs.writeFile(destination, "old archive");
    const payload = Buffer.from("new trusted archive");
    const { baseUrl } = await startServer((_request, response) => {
      response.setHeader("Content-Length", payload.byteLength);
      response.end(payload);
    });

    await downloadFile(`${baseUrl}/archive`, destination);

    await expect(fs.readFile(destination)).resolves.toEqual(payload);
    await expect(fs.readdir(directory)).resolves.toEqual(["archive.tgz"]);
  });

  it("removes the partial when the final rename fails", async () => {
    const directory = await makeTemporaryDirectory();
    const destination = path.join(directory, "archive.tgz");
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, "keep.txt"), "keep");
    const { baseUrl } = await startServer((_request, response) => {
      response.end("complete archive");
    });

    await expect(
      downloadFile(`${baseUrl}/archive`, destination),
    ).rejects.toThrow();

    await expect(fs.readdir(directory)).resolves.toEqual(["archive.tgz"]);
    await expect(
      fs.readFile(path.join(destination, "keep.txt"), "utf8"),
    ).resolves.toBe("keep");
  });

  it("preserves a preexisting destination when replacement fails", async () => {
    const directory = await makeTemporaryDirectory();
    const destination = path.join(directory, "archive.tgz");
    await fs.writeFile(destination, "trusted existing archive");
    const { baseUrl } = await startServer((_request, response) => {
      response.write("123456");
      response.end("789012");
    });

    await expect(
      downloadFile(`${baseUrl}/archive`, destination, { maxBytes: 10 }),
    ).rejects.toThrow(/size|large|limit|maximum/i);

    await expect(fs.readFile(destination, "utf8")).resolves.toBe(
      "trusted existing archive",
    );
    await expect(fs.readdir(directory)).resolves.toEqual(["archive.tgz"]);
  });
});
