import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AriadneInitDeps,
  applyInitPlan,
  buildInitPlan,
  initializeAriadne,
} from "../../../src/ariadne/init.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-init-"));
  directories.push(directory);
  return directory;
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function repository(): string {
  const root = temporaryDirectory();
  git(root, "init", "-b", "main");
  return root;
}

function writeJson(destination: string, value: unknown): void {
  fs.writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function legacyPrd(storiesKey: "userStories" | "stories") {
  return {
    project: "Imported project",
    branchName: "main",
    description: "Legacy backlog",
    [storiesKey]: [
      {
        id: "US-001",
        title: "First story",
        description: "Ship it",
        acceptanceCriteria: ["It works"],
        priority: 1,
        passes: false,
      },
    ],
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Ariadne init", () => {
  it("uses precomputed runtime detections without invoking a runtime probe", async () => {
    const root = repository();
    const detectRuntimes = vi.fn(async () => {
      throw new Error("runtime probes must not run");
    });

    const report = await initializeAriadne(
      {
        cwd: root,
        qualityChecks: ["pnpm test"],
        interactive: false,
      },
      {
        runtimeDetections: [
          {
            name: "gemini",
            state: "healthy",
            version: "1.2.3",
            reason: "precomputed test detection",
          },
        ],
        detectRuntimes,
      },
    );

    expect(report.runtime).toBe("gemini");
    expect(detectRuntimes).not.toHaveBeenCalled();
  });

  it("accepts an empty precomputed detection set without falling back to probes", async () => {
    const root = repository();
    const detectRuntimes = vi.fn(async () => {
      throw new Error("runtime probes must not run");
    });

    const report = await initializeAriadne(
      {
        cwd: root,
        qualityChecks: ["pnpm test"],
        interactive: false,
      },
      { runtimeDetections: [], detectRuntimes },
    );

    expect(report.runtime).toBeUndefined();
    expect(detectRuntimes).not.toHaveBeenCalled();
  });

  it("awaits a dependency-controlled runtime probe with a finite timeout", async () => {
    const root = repository();
    const detectRuntimes = vi.fn(async (options: { timeoutMs: number }) => {
      expect(options.timeoutMs).toBeGreaterThan(0);
      expect(Number.isFinite(options.timeoutMs)).toBe(true);
      return [
        {
          name: "codex" as const,
          state: "healthy" as const,
          reason: "bounded async test detection",
        },
      ];
    });

    const report = await initializeAriadne(
      {
        cwd: root,
        qualityChecks: ["pnpm test"],
        interactive: false,
      },
      { detectRuntimes },
    );

    expect(report.runtime).toBe("codex");
    expect(detectRuntimes).toHaveBeenCalledOnce();
  });

  it("requires the Git repository root before planning any writes", () => {
    const outsideGit = temporaryDirectory();
    expect(() =>
      buildInitPlan({
        cwd: outsideGit,
        runtime: "codex",
        qualityChecks: ["pnpm test"],
        interactive: false,
      }),
    ).toThrow("Git repository");
    expect(fs.existsSync(path.join(outsideGit, ".ariadne"))).toBe(false);

    const root = repository();
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested);
    expect(() =>
      buildInitPlan({
        cwd: nested,
        runtime: "codex",
        qualityChecks: ["pnpm test"],
        interactive: false,
      }),
    ).toThrow("repository root");
  });

  it.each([
    "userStories",
    "stories",
  ] as const)("imports a %s PRD without changing its source and archives the exact bytes", async (storiesKey) => {
    const root = repository();
    const source = path.join(root, "prd.json");
    writeJson(source, legacyPrd(storiesKey));
    const original = fs.readFileSync(source, "utf8");

    const report = await initializeAriadne({
      cwd: root,
      runtime: "codex",
      qualityChecks: ["pnpm test"],
      interactive: false,
    });
    const canonicalRoot = fs.realpathSync(root);

    expect(report).toMatchObject({
      schemaVersion: 1,
      command: "init",
      outcome: "initialized",
      projectRoot: canonicalRoot,
      importedFrom: path.join(canonicalRoot, "prd.json"),
      runtime: "codex",
      qualityChecks: ["pnpm test"],
    });
    expect(fs.readFileSync(source, "utf8")).toBe(original);
    const imported = JSON.parse(
      fs.readFileSync(path.join(root, ".ariadne", "prd.json"), "utf8"),
    );
    expect(imported).toMatchObject({
      schemaVersion: 1,
      project: "Imported project",
      userStories: [{ id: "US-001", status: "pending", attempts: 0 }],
    });
    const archive = path.join(root, ".ariadne", "archive");
    const archivedPrds = fs
      .readdirSync(archive, { recursive: true })
      .filter((entry) => String(entry).endsWith("prd.json"));
    expect(archivedPrds).toHaveLength(1);
    expect(
      fs.readFileSync(path.join(archive, String(archivedPrds[0])), "utf8"),
    ).toBe(original);
  });

  it("detects package checks in order and lets repeated --check values override them", () => {
    const root = repository();
    writeJson(path.join(root, "package.json"), {
      name: "demo",
      packageManager: "pnpm@11.8.0",
      scripts: { lint: "biome check .", typecheck: "tsc", test: "vitest" },
    });

    const detected = buildInitPlan({
      cwd: root,
      qualityChecks: [],
      interactive: false,
    });
    expect(detected.config.qualityChecks).toEqual([
      "pnpm run lint",
      "pnpm run typecheck",
      "pnpm run test",
    ]);

    const overridden = buildInitPlan({
      cwd: root,
      qualityChecks: ["pnpm lint", "pnpm test"],
      interactive: false,
    });
    expect(overridden.config.qualityChecks).toEqual(["pnpm lint", "pnpm test"]);

    writeJson(path.join(root, "package.json"), {
      name: "demo",
      scripts: { check: "pnpm lint && pnpm test", lint: "ignored" },
    });
    fs.writeFileSync(path.join(root, "package-lock.json"), "{}\n");
    expect(
      buildInitPlan({
        cwd: root,
        qualityChecks: [],
        interactive: false,
      }).config.qualityChecks,
    ).toEqual(["npm run check"]);
  });

  it("rejects missing checks non-interactively without writing state", async () => {
    const root = repository();
    await expect(
      initializeAriadne({
        cwd: root,
        runtime: "codex",
        qualityChecks: [],
        interactive: false,
      }),
    ).rejects.toThrow("quality check");
    expect(fs.existsSync(path.join(root, ".ariadne"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".gitignore"))).toBe(false);
  });

  it("returns an explicit cancellation report without applying the plan", async () => {
    const root = repository();
    const cancelled = Symbol("cancelled");
    const prompt = {
      confirm: async () => cancelled,
      text: async () => {
        throw new Error("text prompt was not expected");
      },
      select: async () => {
        throw new Error("select prompt was not expected");
      },
      isCancel: (value: unknown) => value === cancelled,
    } as unknown as NonNullable<AriadneInitDeps["prompts"]>;

    const report = await initializeAriadne(
      {
        cwd: root,
        runtime: "codex",
        qualityChecks: ["pnpm test"],
        interactive: true,
      },
      { prompts: prompt },
    );

    expect(report.outcome).toBe("cancelled");
    expect(fs.existsSync(path.join(root, ".ariadne"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".gitignore"))).toBe(false);
  });

  it("validates an externally supplied plan before creating the layout", () => {
    const root = repository();
    const plan = buildInitPlan({
      cwd: root,
      runtime: "codex",
      qualityChecks: ["pnpm test"],
      interactive: false,
    });
    plan.config.qualityChecks = [" "];

    expect(() => applyInitPlan(plan)).toThrow("qualityChecks");
    expect(fs.existsSync(path.join(root, ".ariadne"))).toBe(false);
  });

  it("preserves ignore formatting, adds only exact missing entries, and is idempotent", () => {
    const root = repository();
    fs.writeFileSync(
      path.join(root, ".gitignore"),
      "# existing\nnode_modules\n\n.ariadne/lock\n",
      "utf8",
    );
    const plan = buildInitPlan({
      cwd: root,
      runtime: "codex",
      qualityChecks: ["pnpm test"],
      interactive: false,
    });

    applyInitPlan(plan);
    applyInitPlan(
      buildInitPlan({
        cwd: root,
        runtime: "codex",
        qualityChecks: ["pnpm test"],
        interactive: false,
      }),
    );

    expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toBe(
      "# existing\nnode_modules\n\n.ariadne/lock\n.ariadne/runs/\n",
    );
    expect(fs.existsSync(path.join(root, ".ariadne", "archive"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".ariadne", "runs"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".ariadne", "progress.md"))).toBe(
      true,
    );
    expect(fs.readdirSync(path.join(root, ".ariadne", "archive"))).toEqual([]);
  });
});
