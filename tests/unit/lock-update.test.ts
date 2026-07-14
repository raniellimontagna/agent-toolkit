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
    agentBrowser: {
      source: "npm",
      package: "agent-browser",
      version: "1.0.0",
    },
    agentSkills: {
      source: "skills-cli",
      skillsCli: {
        source: "npm",
        package: "skills",
        version: "1.5.13",
      },
      repositories: {
        shadcnImprove: {
          source: "github",
          repository: "shadcn/improve",
          ref: "03369ee6d7cafbfcecc4346539b05b3dc0a603bb",
        },
        agentBrowser: {
          source: "github",
          repository: "vercel-labs/agent-browser",
          ref: "afae698a51242166170b6fe4809dd57fe9f75798",
        },
        impeccable: {
          source: "github",
          repository: "pbakaus/impeccable",
          ref: "3590bf9e37c84ecbc92f9c205ce1aebf2185a971",
        },
        webDesignGuidelines: {
          source: "github",
          repository: "vercel-labs/agent-skills",
          ref: "f8a72b9603728bb92a217a879b7e62e43ad76c81",
        },
        reactDoctor: {
          source: "github",
          repository: "millionco/react-doctor",
          ref: "aa519e5f5505105ef8c00e1b1972c98514f7577a",
        },
        remotionBestPractices: {
          source: "github",
          repository: "remotion-dev/skills",
          ref: "8b1d51ade295b2d9bd22a8f07047d13c0740f275",
        },
        mattPocockSkills: {
          source: "github",
          repository: "mattpocock/skills",
          ref: "391a2701dd948f94f56a39f7533f8eea9a859c87",
        },
      },
      bundles: {
        improve: {
          label: "Improve",
          description:
            "shadcn advisor skill for auditing codebases and writing execution plans",
          skills: [
            {
              repository: "shadcnImprove",
              skill: "improve",
              path: "skills/improve",
            },
          ],
        },
        "frontend-skills": {
          label: "Frontend Skills",
          description:
            "Third-party frontend skills installed via Agent Skills CLI",
          skills: [
            { repository: "impeccable", skill: "impeccable" },
            {
              repository: "webDesignGuidelines",
              skill: "web-design-guidelines",
            },
            { repository: "reactDoctor", skill: "react-doctor" },
            {
              repository: "remotionBestPractices",
              skill: "remotion-best-practices",
            },
          ],
        },
        "planning-skills": {
          label: "Planning Skills",
          description:
            "Third-party planning and architecture skills installed via Agent Skills CLI",
          skills: [
            { repository: "mattPocockSkills", skill: "grill-me" },
            { repository: "mattPocockSkills", skill: "grilling" },
            { repository: "mattPocockSkills", skill: "grill-with-docs" },
            { repository: "mattPocockSkills", skill: "domain-modeling" },
            { repository: "mattPocockSkills", skill: "codebase-design" },
            {
              repository: "mattPocockSkills",
              skill: "improve-codebase-architecture",
            },
          ],
        },
        "agent-browser": {
          label: "Agent Browser",
          description:
            "Pinned browser automation skill installed via Agent Skills CLI",
          skills: [
            {
              repository: "agentBrowser",
              skill: "agent-browser",
              path: "skills/agent-browser",
            },
          ],
        },
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
      ]),
    );

    const repositoryItems = report.items.filter((item) =>
      item.name.startsWith("Agent Skill repository ("),
    );
    expect(repositoryItems).toHaveLength(7);
    expect(
      repositoryItems.filter((item) =>
        item.name.startsWith("Agent Skill repository (mattpocock/skills)"),
      ),
    ).toHaveLength(1);
    expect(repositoryItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Agent Skill repository (millionco/react-doctor)",
          current: "aa519e5f5505105ef8c00e1b1972c98514f7577a",
          latest: "e".repeat(40),
          status: "update-available",
        }),
      ]),
    );
  });
});
