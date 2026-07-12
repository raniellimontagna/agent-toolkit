import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../../src/args.js";
import { runtimeNames, state, toolNames } from "../../src/state.js";

let originalState: {
  tools: typeof state.tools;
  runtimes: typeof state.runtimes;
  nonInteractive: boolean;
  dryRun: boolean;
  doctor: boolean;
  jsonOutput: boolean;
  uninstall: boolean;
  repair: boolean;
  updateLock: boolean;
  auditSkills: boolean;
};

beforeEach(() => {
  originalState = {
    tools: { ...state.tools },
    runtimes: { ...state.runtimes },
    nonInteractive: state.nonInteractive,
    dryRun: state.dryRun,
    doctor: state.doctor,
    jsonOutput: state.jsonOutput,
    uninstall: state.uninstall,
    repair: state.repair,
    updateLock: state.updateLock,
    auditSkills: state.auditSkills,
  };
  for (const tool of toolNames) state.tools[tool] = true;
  for (const runtime of runtimeNames) state.runtimes[runtime] = true;
  state.nonInteractive = false;
  state.dryRun = false;
  state.doctor = false;
  state.jsonOutput = false;
  state.uninstall = false;
  state.repair = false;
  state.updateLock = false;
  state.auditSkills = false;
});

afterEach(() => {
  state.tools = originalState.tools;
  state.runtimes = originalState.runtimes;
  state.nonInteractive = originalState.nonInteractive;
  state.dryRun = originalState.dryRun;
  state.doctor = originalState.doctor;
  state.jsonOutput = originalState.jsonOutput;
  state.uninstall = originalState.uninstall;
  state.repair = originalState.repair;
  state.updateLock = originalState.updateLock;
  state.auditSkills = originalState.auditSkills;
});

describe("argument parsing for operational commands", () => {
  it("keeps Agent Browser out of --all and selects it explicitly", () => {
    expect(parseArgs(["--all"])).toBe(true);
    expect(state.tools["agent-browser"]).toBe(false);

    expect(parseArgs(["--agent-browser-only"])).toBe(true);
    expect(state.tools["agent-browser"]).toBe(true);
    for (const tool of toolNames) {
      if (tool !== "agent-browser") expect(state.tools[tool]).toBe(false);
    }
  });

  it("supports dry-run aliases without entering the menu", () => {
    expect(parseArgs(["--all", "--codex", "--dry-run"])).toBe(true);
    expect(state.dryRun).toBe(true);
    expect(state.nonInteractive).toBe(true);

    state.dryRun = false;
    expect(parseArgs(["--plan-only"])).toBe(true);
    expect(state.dryRun).toBe(true);
    expect(state.nonInteractive).toBe(true);
  });

  it("supports doctor/status JSON commands", () => {
    expect(parseArgs(["--status", "--json"])).toBe(true);

    expect(state.doctor).toBe(true);
    expect(state.jsonOutput).toBe(true);
    expect(state.nonInteractive).toBe(true);
  });

  it("supports uninstall, repair, update-lock and skills audit commands", () => {
    expect(
      parseArgs(["--uninstall", "--repair", "--update-lock", "--skills-audit"]),
    ).toBe(true);

    expect(state.uninstall).toBe(true);
    expect(state.repair).toBe(true);
    expect(state.updateLock).toBe(true);
    expect(state.auditSkills).toBe(true);
    expect(state.nonInteractive).toBe(true);
  });
});
