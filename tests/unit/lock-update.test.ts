import { describe, expect, it } from "vitest";
import { buildLockUpdateReport } from "../../src/lock-update.js";
import type { ToolLock } from "../../src/tool-lock.js";

const lock: ToolLock = {
  version: 1,
  tools: {
    rtk: {
      source: "github-release",
      repository: "rtk-ai/rtk",
      tag: "v1.0.0",
      assets: {},
    },
    caveman: {
      source: "github",
      repository: "JuliusBrussee/caveman",
      ref: "a".repeat(40),
    },
    graphify: {
      source: "pypi",
      package: "graphifyy",
      version: "1.0.0",
    },
    gsd: {
      source: "npm",
      package: "@opengsd/gsd-core",
      version: "1.0.0",
    },
    improve: {
      source: "github",
      repository: "shadcn/improve",
      ref: "b".repeat(40),
      skill: "improve",
    },
    agentBrowser: {
      source: "npm",
      package: "agent-browser",
      version: "1.0.0",
      skill: {
        source: "github",
        repository: "vercel-labs/agent-browser",
        ref: "e".repeat(40),
        path: "skills/agent-browser",
        skill: "agent-browser",
      },
    },
    frontendSkills: {
      source: "skills-cli",
      skillsCli: {
        source: "npm",
        package: "skills",
        version: "1.0.0",
      },
      impeccable: {
        source: "github",
        repository: "pbakaus/impeccable",
        ref: "c".repeat(40),
        skill: "impeccable",
      },
      webDesignGuidelines: {
        source: "github",
        repository: "vercel-labs/agent-skills",
        ref: "d".repeat(40),
        skill: "web-design-guidelines",
      },
      reactDoctor: {
        source: "github",
        repository: "millionco/react-doctor",
        ref: "f".repeat(40),
        skill: "react-doctor",
      },
      remotionBestPractices: {
        source: "github",
        repository: "remotion-dev/skills",
        ref: "d".repeat(40),
        skill: "remotion-best-practices",
      },
    },
    planningSkills: {
      source: "skills-cli",
      grillMe: {
        source: "github",
        repository: "mattpocock/skills",
        ref: "a".repeat(40),
        skill: "grill-me",
      },
      grilling: {
        source: "github",
        repository: "mattpocock/skills",
        ref: "a".repeat(40),
        skill: "grilling",
      },
      grillWithDocs: {
        source: "github",
        repository: "mattpocock/skills",
        ref: "a".repeat(40),
        skill: "grill-with-docs",
      },
      domainModeling: {
        source: "github",
        repository: "mattpocock/skills",
        ref: "a".repeat(40),
        skill: "domain-modeling",
      },
    },
  },
  runtimeClis: {
    claude: {
      source: "npm",
      package: "@anthropic-ai/claude-code",
      version: "1.0.0",
    },
    codex: { source: "npm", package: "@openai/codex", version: "1.0.0" },
    opencode: { source: "npm", package: "opencode-ai", version: "1.0.0" },
    gemini: { source: "npm", package: "@google/gemini-cli", version: "1.0.0" },
  },
};

describe("lock update report", () => {
  it("reports current and newer pinned external sources", async () => {
    const report = await buildLockUpdateReport(lock, {
      capture: () => ({
        ok: true,
        status: 0,
        stdout: "1.1.0\n",
        stderr: "",
      }),
      fetchJson: async (url) => {
        if (url.includes("pypi.org")) return { info: { version: "1.0.0" } };
        if (url.endsWith("/releases/latest")) return { tag_name: "v1.1.0" };
        if (url.includes("/commits/")) return { sha: "e".repeat(40) };
        return { default_branch: "main" };
      },
    });

    expect(report.command).toBe("update-lock");
    expect(report.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "RTK",
          current: "v1.0.0",
          latest: "v1.1.0",
          status: "update-available",
        }),
        expect.objectContaining({
          name: "Graphify",
          current: "1.0.0",
          latest: "1.0.0",
          status: "current",
        }),
        expect.objectContaining({
          name: "React Doctor",
          current: "f".repeat(40),
          latest: "e".repeat(40),
          status: "update-available",
        }),
      ]),
    );
  });
});
