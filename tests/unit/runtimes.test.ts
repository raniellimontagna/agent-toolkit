import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  antigravityInstallPlan,
  checkPrerequisites,
  versionOutputMatchesPin,
} from "../../src/runtimes.js";
import { runtimeNames, state, toolNames } from "../../src/state.js";
import { agentSkillBundleIds } from "../../src/tool-lock.js";

const {
  captureMock,
  commandExistsMock,
  findCommandMock,
  requireCommandMock,
  requireNodeMock,
  runMock,
} = vi.hoisted(() => ({
  captureMock: vi.fn(() => ({
    ok: true,
    status: 0,
    stdout: "1.0.0\n",
    stderr: "",
  })),
  commandExistsMock: vi.fn(() => false),
  findCommandMock: vi.fn(() => null),
  requireCommandMock: vi.fn(),
  requireNodeMock: vi.fn(),
  runMock: vi.fn(() => ({
    ok: true,
    status: 0,
    stdout: "",
    stderr: "",
  })),
}));

vi.mock("../../src/system.js", () => ({
  capture: captureMock,
  commandExists: commandExistsMock,
  findCommand: findCommandMock,
  requireCommand: requireCommandMock,
  requireNode: requireNodeMock,
  run: runMock,
}));

let originalTools: typeof state.tools;
let originalRuntimes: typeof state.runtimes;

beforeEach(() => {
  originalTools = { ...state.tools };
  originalRuntimes = { ...state.runtimes };
  for (const tool of toolNames) state.tools[tool] = false;
  for (const runtime of runtimeNames) state.runtimes[runtime] = false;
});

afterEach(() => {
  state.tools = originalTools;
  state.runtimes = originalRuntimes;
  vi.clearAllMocks();
});

describe("versionOutputMatchesPin", () => {
  it("matches the pinned version as a whole token", () => {
    expect(
      versionOutputMatchesPin("claude 2.1.204 (Claude Code)", "2.1.204"),
    ).toBe(true);
    expect(versionOutputMatchesPin("codex-cli 0.143.0", "0.143.0")).toBe(true);
    expect(versionOutputMatchesPin("0.49.0", "0.49.0")).toBe(true);
  });

  it("accepts a v-prefixed version token", () => {
    expect(versionOutputMatchesPin("gemini v0.49.0", "0.49.0")).toBe(true);
  });

  it("rejects versions that merely contain the pin as a prefix", () => {
    expect(versionOutputMatchesPin("claude 2.0.10", "2.0.1")).toBe(false);
    expect(versionOutputMatchesPin("tool 12.0.1", "2.0.1")).toBe(false);
  });

  it("rejects prerelease variants of the pinned version", () => {
    expect(versionOutputMatchesPin("gsd 1.7.0-rc.4", "1.7.0")).toBe(false);
  });

  it("rejects unrelated output", () => {
    expect(versionOutputMatchesPin("codex-cli 0.125.0", "0.143.0")).toBe(false);
    expect(versionOutputMatchesPin("", "1.0.0")).toBe(false);
  });
});

describe("Antigravity install plan", () => {
  const installUrl =
    "https://example.com/install.ps1?channel=stable&architecture=x64";

  it("keeps the Windows URL only in a dedicated child environment value", () => {
    const baseEnv = {
      PATH: "C:\\tools",
      EXISTING_KEY: "preserved",
      ANTIGRAVITY_INSTALL_SCRIPT: installUrl,
      antigravity_install_script: installUrl,
      AnTiGrAvItY_InStAlL_ScRiPt: installUrl,
      agent_toolkit_antigravity_install_url: "stale transport value",
    };
    const originalBaseEnv = { ...baseEnv };
    const plan = antigravityInstallPlan("win32", installUrl, baseEnv);

    expect(plan.command).toBe("powershell.exe");
    expect(plan.args).toEqual([
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      expect.any(String),
    ]);
    expect(plan.args.join("\n")).not.toContain(installUrl);
    expect(plan.args.at(-1)).toContain(
      "$env:AGENT_TOOLKIT_ANTIGRAVITY_INSTALL_URL",
    );
    expect(plan.env).toEqual({
      PATH: "C:\\tools",
      EXISTING_KEY: "preserved",
      AGENT_TOOLKIT_ANTIGRAVITY_INSTALL_URL: installUrl,
    });
    expect(
      Object.values(plan.env ?? {}).filter((value) => value === installUrl),
    ).toHaveLength(1);
    expect(baseEnv).toEqual(originalBaseEnv);
  });

  it("uses byte-for-byte constant PowerShell source across accepted URLs", () => {
    const first = antigravityInstallPlan("win32", installUrl, {});
    const second = antigravityInstallPlan(
      "win32",
      "https://cdn.example.org/agy.ps1?track=preview&arch=arm64",
      {},
    );

    expect(second.args).toEqual(first.args);
  });

  it("preserves the quoted POSIX curl plan without adding a child env", () => {
    const plan = antigravityInstallPlan("linux", installUrl, {
      PATH: "/usr/bin:/bin",
    });

    expect(plan).toEqual({
      command: "bash",
      args: ["-c", `curl -fsSL '${installUrl}' | bash`],
    });
  });
});

describe("checkPrerequisites", () => {
  it.each(
    agentSkillBundleIds,
  )("requires the Agent Skills toolchain for %s", (bundleId) => {
    state.tools[bundleId] = true;

    checkPrerequisites();

    expect(requireNodeMock).toHaveBeenCalledWith(24);
    expect(requireCommandMock).toHaveBeenCalledWith("git");
    expect(requireCommandMock).toHaveBeenCalledWith("npx");
  });
});
