import { describe, expect, it, vi } from "vitest";
import {
  type AriadneRuntimeAdapter,
  AriadneRuntimeError,
  createRuntimeRegistry,
  type IterationContext,
  type RuntimeDetection,
  type RuntimeProbeDeps,
  type RuntimeRegistry,
  selectRuntime,
} from "../../../src/ariadne/runtimes/index.js";
import type {
  AriadneRuntimeName,
  ProcessResult,
} from "../../../src/ariadne/types.js";
import type { RunResult } from "../../../src/system.js";

const context: IterationContext = {
  runId: "run-1",
  projectRoot: "/repo",
  promptPath: "/repo/.ariadne/runs/run-1/prompt.md",
  relativePromptPath: ".ariadne/runs/run-1/prompt.md",
};

const commands: Record<AriadneRuntimeName, string> = {
  claude: "/bin/claude",
  codex: "/bin/codex",
  opencode: "/bin/opencode",
  gemini: "/bin/gemini",
  antigravity: "/bin/agy",
};

const versions: Record<AriadneRuntimeName, string> = {
  claude: "2.1.220",
  codex: "0.145.0",
  opencode: "1.18.8",
  gemini: "0.52.0",
  antigravity: "1.1.8",
};

const helpOutput: Record<AriadneRuntimeName, string> = {
  claude: "Usage: claude --print --dangerously-skip-permissions",
  codex:
    "Usage: codex exec --dangerously-bypass-approvals-and-sandbox --ephemeral -C",
  opencode: "Usage: opencode run --auto --dir",
  gemini: "Usage: gemini --prompt --approval-mode yolo --skip-trust",
  antigravity: "Usage: agy --print --dangerously-skip-permissions",
};

function result(stdout: string, overrides: Partial<RunResult> = {}): RunResult {
  return {
    ok: true,
    status: 0,
    stdout,
    stderr: "",
    ...overrides,
  };
}

function runtimeForCommand(command: string): AriadneRuntimeName {
  const entry = Object.entries(commands).find(([, value]) => value === command);
  if (!entry) throw new Error(`Unexpected command: ${command}`);
  return entry[0] as AriadneRuntimeName;
}

function healthyProbeDeps(
  capture = vi.fn((command: string, args: string[]): RunResult => {
    const runtime = runtimeForCommand(command);
    if (args[0] === "--version") {
      return result(`${runtime} ${versions[runtime]}\n`);
    }
    if (args.includes("--help")) return result(helpOutput[runtime]);
    return result("authenticated\n");
  }),
): RuntimeProbeDeps {
  return {
    findCommand: (command) =>
      Object.values(commands).find((candidate) =>
        candidate.endsWith(`/${command}`),
      ) ?? null,
    capture,
    baseEnv: { HOME: "/home/user", USER_SECRET: "do-not-leak" },
  };
}

describe("Ariadne runtime adapters", () => {
  it("builds exact headless argument arrays for all five runtimes", () => {
    const registry = createRuntimeRegistry(healthyProbeDeps());

    expect(registry.claude.buildInvocation(context)).toEqual({
      command: "/bin/claude",
      args: [
        "--print",
        "--dangerously-skip-permissions",
        "Read .ariadne/runs/run-1/prompt.md and follow it exactly.",
      ],
      cwd: "/repo",
      env: {
        HOME: "/home/user",
        USER_SECRET: "do-not-leak",
        ARIADNE_RUN_ID: "run-1",
      },
    });
    expect(registry.codex.buildInvocation(context)).toEqual({
      command: "/bin/codex",
      args: [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "--ephemeral",
        "-C",
        "/repo",
        "Read .ariadne/runs/run-1/prompt.md and follow it exactly.",
      ],
      cwd: "/repo",
      env: {
        HOME: "/home/user",
        USER_SECRET: "do-not-leak",
        ARIADNE_RUN_ID: "run-1",
      },
    });
    expect(registry.opencode.buildInvocation(context)).toEqual({
      command: "/bin/opencode",
      args: [
        "run",
        "--auto",
        "--dir",
        "/repo",
        "Read .ariadne/runs/run-1/prompt.md and follow it exactly.",
      ],
      cwd: "/repo",
      env: {
        HOME: "/home/user",
        USER_SECRET: "do-not-leak",
        ARIADNE_RUN_ID: "run-1",
      },
    });
    expect(registry.gemini.buildInvocation(context)).toEqual({
      command: "/bin/gemini",
      args: [
        "--prompt",
        "Read .ariadne/runs/run-1/prompt.md and follow it exactly.",
        "--approval-mode",
        "yolo",
        "--skip-trust",
      ],
      cwd: "/repo",
      env: {
        HOME: "/home/user",
        USER_SECRET: "do-not-leak",
        ARIADNE_RUN_ID: "run-1",
      },
    });
    expect(registry.antigravity.buildInvocation(context)).toEqual({
      command: "/bin/agy",
      args: [
        "--print",
        "--dangerously-skip-permissions",
        "Read .ariadne/runs/run-1/prompt.md and follow it exactly.",
      ],
      cwd: "/repo",
      env: {
        HOME: "/home/user",
        USER_SECRET: "do-not-leak",
        ARIADNE_RUN_ID: "run-1",
      },
    });

    for (const adapter of Object.values(registry)) {
      const invocation = adapter.buildInvocation(context);
      expect(invocation.command).not.toMatch(/[|;&]/);
      expect(invocation.args).not.toContain("do-not-leak");
    }
  });

  it("interprets only a clean zero exit as a successful agent outcome", () => {
    const adapter = createRuntimeRegistry(healthyProbeDeps()).codex;
    const base: ProcessResult = {
      status: 0,
      signal: null,
      stdout: "done",
      stderr: "",
      startedAt: "2026-07-29T00:00:00.000Z",
      finishedAt: "2026-07-29T00:00:01.000Z",
      durationMs: 1_000,
      timedOut: false,
      aborted: false,
    };

    expect(adapter.interpretResult(base)).toEqual({ ok: true, status: 0 });
    expect(
      adapter.interpretResult({
        ...base,
        status: 1,
        stdout: "ghp_stdout_secret",
        stderr: "arbitrary stderr that must stay in the run log",
      }),
    ).toEqual({
      ok: false,
      status: 1,
      reason: "Runtime exited with status 1; inspect machine-local logs.",
    });
    expect(adapter.interpretResult({ ...base, timedOut: true })).toEqual({
      ok: false,
      status: 0,
      reason: "Runtime process timed out.",
    });
  });
});

describe("runtime detection", () => {
  it("reports unavailable without running probes when the executable is absent", () => {
    const capture = vi.fn();
    const registry = createRuntimeRegistry({
      findCommand: () => null,
      capture,
      baseEnv: {},
    });

    expect(registry.codex.detect()).toMatchObject({
      name: "codex",
      state: "unavailable",
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("requires each exact locked version as a whole token", () => {
    const registry = createRuntimeRegistry(
      healthyProbeDeps(
        vi.fn((command: string, args: string[]) => {
          const runtime = runtimeForCommand(command);
          if (args[0] === "--version") {
            const version =
              runtime === "codex" ? "10.145.00" : versions[runtime];
            return result(`${runtime} ${version}`);
          }
          if (args.includes("--help")) return result(helpOutput[runtime]);
          return result("authenticated");
        }),
      ),
    );

    expect(registry.codex.detect()).toMatchObject({
      state: "incompatible",
      version: "10.145.00",
    });
    expect(registry.claude.detect()).toMatchObject({
      state: "healthy",
      version: "2.1.220",
    });
  });

  it("reports incompatible when a required headless help flag is missing", () => {
    const registry = createRuntimeRegistry(
      healthyProbeDeps(
        vi.fn((command: string, args: string[]) => {
          const runtime = runtimeForCommand(command);
          if (args[0] === "--version")
            return result(`agy ${versions[runtime]}`);
          if (args.includes("--help")) return result("Usage: agy --print");
          return result("authenticated");
        }),
      ),
    );

    expect(registry.antigravity.detect()).toMatchObject({
      state: "incompatible",
      version: "1.1.8",
    });
    expect(registry.antigravity.detect().reason).toContain(
      "--dangerously-skip-permissions",
    );
  });

  it("accepts Antigravity at or above its version floor", () => {
    const version = { value: "1.1.7" };
    const registry = createRuntimeRegistry(
      healthyProbeDeps(
        vi.fn((command: string, args: string[]) => {
          const runtime = runtimeForCommand(command);
          if (args[0] === "--version") return result(`agy ${version.value}`);
          if (args.includes("--help")) return result(helpOutput[runtime]);
          return result("authenticated");
        }),
      ),
    );

    expect(registry.antigravity.detect()).toMatchObject({
      state: "incompatible",
    });
    version.value = "1.1.8";
    expect(registry.antigravity.detect()).toMatchObject({
      state: "unverified",
    });
    version.value = "1.12.0";
    expect(registry.antigravity.detect()).toMatchObject({
      state: "unverified",
    });
  });

  it("uses only local zero-credit auth probes for runtimes that expose them", () => {
    const capture = vi.fn((command: string, args: string[]) => {
      const runtime = runtimeForCommand(command);
      if (args[0] === "--version")
        return result(`${runtime} ${versions[runtime]}`);
      if (args.includes("--help")) return result(helpOutput[runtime]);
      return result("authenticated");
    });
    const registry = createRuntimeRegistry(healthyProbeDeps(capture));

    expect(registry.claude.detect().state).toBe("healthy");
    expect(registry.codex.detect().state).toBe("healthy");
    expect(registry.opencode.detect().state).toBe("healthy");
    expect(registry.gemini.detect().state).toBe("unverified");
    expect(registry.antigravity.detect().state).toBe("unverified");
    expect(capture).toHaveBeenCalledWith("/bin/claude", ["auth", "status"]);
    expect(capture).toHaveBeenCalledWith("/bin/codex", ["login", "status"]);
    expect(capture).toHaveBeenCalledWith("/bin/opencode", [
      "providers",
      "list",
    ]);
    expect(capture).not.toHaveBeenCalledWith("/bin/gemini", ["auth", "status"]);
    expect(capture).not.toHaveBeenCalledWith("/bin/agy", ["auth", "status"]);
  });

  it("reports unverified when a supported auth probe cannot confirm readiness", () => {
    const registry = createRuntimeRegistry(
      healthyProbeDeps(
        vi.fn((command: string, args: string[]) => {
          const runtime = runtimeForCommand(command);
          if (args[0] === "--version")
            return result(`${runtime} ${versions[runtime]}`);
          if (args.includes("--help")) return result(helpOutput[runtime]);
          return result("", { ok: false, status: 1, stderr: "not logged in" });
        }),
      ),
    );

    expect(registry.claude.detect()).toMatchObject({
      state: "unverified",
      reason: "not logged in",
    });
  });
});

function fakeRegistry(
  states: Partial<Record<AriadneRuntimeName, RuntimeDetection["state"]>>,
): RuntimeRegistry {
  return Object.fromEntries(
    (Object.keys(commands) as AriadneRuntimeName[]).map((name) => {
      const detection: RuntimeDetection = {
        name,
        state: states[name] ?? "unavailable",
        commandPath: commands[name],
        version: versions[name],
        reason: states[name] ?? "unavailable",
      };
      const adapter: AriadneRuntimeAdapter = {
        name,
        command: name === "antigravity" ? "agy" : name,
        detect: () => detection,
        buildInvocation: () => {
          throw new Error("not used");
        },
        interpretResult: () => {
          throw new Error("not used");
        },
      };
      return [name, adapter];
    }),
  ) as RuntimeRegistry;
}

describe("automatic runtime selection", () => {
  it("uses the configured project runtime before other healthy candidates", async () => {
    const selection = await selectRuntime({
      explicit: undefined,
      configured: "codex",
      globalPreferred: "claude",
      interactive: false,
      registry: fakeRegistry({ claude: "healthy", codex: "healthy" }),
    });

    expect(selection.name).toBe("codex");
    expect(selection.source).toBe("configured");
  });

  it("falls back to a healthy runtime when the configured runtime is unverified", async () => {
    const selection = await selectRuntime({
      configured: "gemini",
      interactive: false,
      registry: fakeRegistry({ codex: "healthy", gemini: "unverified" }),
    });

    expect(selection.name).toBe("codex");
  });

  it("falls back to automatic selection when the configured runtime is unavailable", async () => {
    const selection = await selectRuntime({
      configured: "gemini",
      interactive: false,
      registry: fakeRegistry({ codex: "healthy" }),
    });

    expect(selection.name).toBe("codex");
  });

  it("allows an explicit unverified runtime override", async () => {
    const selection = await selectRuntime({
      explicit: "gemini",
      configured: "codex",
      globalPreferred: "claude",
      interactive: false,
      registry: fakeRegistry({
        claude: "healthy",
        codex: "healthy",
        gemini: "unverified",
      }),
    });

    expect(selection.name).toBe("gemini");
    expect(selection.detection.state).toBe("unverified");
  });

  it("rejects an explicit unavailable or incompatible runtime", async () => {
    await expect(
      selectRuntime({
        explicit: "codex",
        interactive: false,
        registry: fakeRegistry({ codex: "incompatible" }),
      }),
    ).rejects.toThrow(AriadneRuntimeError);
  });

  it("selects the only healthy candidate", async () => {
    const selection = await selectRuntime({
      interactive: false,
      registry: fakeRegistry({ codex: "healthy", gemini: "unverified" }),
    });

    expect(selection.name).toBe("codex");
  });

  it("uses the healthy global preference when several candidates remain", async () => {
    const selection = await selectRuntime({
      globalPreferred: "claude",
      interactive: false,
      registry: fakeRegistry({ claude: "healthy", codex: "healthy" }),
    });

    expect(selection.name).toBe("claude");
    expect(selection.source).toBe("global");
  });

  it("asks for an interactive choice when healthy candidates are ambiguous", async () => {
    const choose = vi.fn(async () => "codex" as const);
    const selection = await selectRuntime({
      interactive: true,
      choose,
      registry: fakeRegistry({ claude: "healthy", codex: "healthy" }),
    });

    expect(selection.name).toBe("codex");
    expect(selection.source).toBe("interactive");
    expect(choose).toHaveBeenCalledWith([
      expect.objectContaining({ name: "claude", state: "healthy" }),
      expect.objectContaining({ name: "codex", state: "healthy" }),
    ]);
  });

  it("reports ambiguity instead of silently choosing in non-interactive mode", async () => {
    await expect(
      selectRuntime({
        interactive: false,
        registry: fakeRegistry({ claude: "healthy", codex: "healthy" }),
      }),
    ).rejects.toThrow(/multiple healthy runtimes.*--runtime/i);
  });

  it("falls back only to a sole unverified candidate", async () => {
    const selection = await selectRuntime({
      interactive: false,
      registry: fakeRegistry({ gemini: "unverified" }),
    });
    expect(selection.name).toBe("gemini");

    await expect(
      selectRuntime({
        interactive: false,
        registry: fakeRegistry({
          gemini: "unverified",
          antigravity: "unverified",
        }),
      }),
    ).rejects.toThrow(/multiple unverified runtimes.*--runtime/i);
  });

  it("reports when no compatible runtime is available", async () => {
    await expect(
      selectRuntime({
        interactive: false,
        registry: fakeRegistry({}),
      }),
    ).rejects.toThrow(/no healthy or unverified runtime/i);
  });
});
