# Agent Skills Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicated Agent Skills CLI source wiring with one normalized, pinned catalog and one deep installer that clones each upstream once and reports structured per-skill outcomes.

**Architecture:** Keep Agent Skills repositories and bundle composition in `tools.lock.json`, with each repository and commit declared once. A single `src/installers/agent-skills.ts` module resolves bundles, verifies immutable checkouts, installs every independent skill, and returns structured outcomes; existing public bundle flags remain unchanged.

**Tech Stack:** TypeScript 5, Node.js 24, Vitest, Bash integration tests, Agent Skills CLI `skills@1.5.13`, Biome, pnpm.

## Global Constraints

- Preserve and absorb the current uncommitted integration of `codebase-design` and `improve-codebase-architecture`; do not stash, reset, or discard it.
- Keep `tools.lock.json` as the single source of truth for Agent Skills repository pins and bundle membership.
- Keep public tool identifiers and flags unchanged: `improve`, `frontend-skills`, `planning-skills`, and `agent-browser`.
- Keep bundle-level selection; do not add per-skill CLI or menu selection.
- Keep the project dependency-free at runtime; do not add a schema-validation package.
- Preserve Node.js 24, immutable full Git SHAs, selected runtimes, and global/local scope semantics.
- Continue after independent repository or skill failures, but return an unsuccessful bundle result when any skill is `failed` or `blocked`.
- Preserve the top-level installer's continue-after-tool-failure behavior and non-zero exit code.
- Use Conventional Commits and run each task's focused tests before committing.
- Run `rtk pnpm run check` before completion. If the existing nested `.worktrees/feat/toolkit-evolution/biome.json` still blocks root Biome discovery, report it and run the equivalent explicit lint/typecheck/test/build/integration gate without modifying that worktree.
- Run `rtk graphify update .` only when `graphify-out/graph.json` exists.

## File Structure

- `tools.lock.json` — normalized Agent Skills CLI package, repositories, immutable refs, bundles, labels, descriptions, skill names, and optional relative paths.
- `src/tool-lock.ts` — catalog types plus dependency-free runtime validation and path/reference invariants.
- `src/state.ts` — resolved Agent Skills CLI override and direct reference to the validated catalog; no per-bundle source mirrors.
- `src/installers/agent-skills.ts` — the deep bundle installation module and structured outcomes.
- `src/installers/agent-browser.ts` — retains npm and Chrome setup, then delegates its skill bundle.
- `src/main.ts` — delegates Improve, Frontend Skills, and Planning Skills to the deep installer.
- `src/runtimes.ts` — derives Agent Skills preflight from catalog bundle membership.
- `src/provenance.ts` — checks the catalog's pinned Agent Skills CLI identity.
- `src/lock-update.ts` — reports each normalized Agent Skill repository once.
- `src/status.ts` — derives bundle counts and source detail from the catalog.
- `tests/unit/tool-lock.test.ts` — valid and invalid normalized catalog cases.
- `tests/unit/state.test.ts` — catalog exposure without duplicate arrays.
- `tests/unit/lock-update.test.ts` — one update item per normalized repository.
- `tests/unit/installers.test.ts` — checkout reuse, pin failures, continuation, structured outcomes, and Agent Browser delegation.
- `tests/unit/runtimes.test.ts` — Planning Skills preflight regression.
- `tests/test-agent-toolkit.sh` — compiled module list, command contract, one-clone assertion, and README/catalog contract.
- `README.md` — normalized provenance and installed bundle contents.
- Delete after migration: `src/installers/frontend-skills.ts`, `src/installers/improve.ts`, `src/installers/planning-skills.ts`.

---

### Task 1: Add the normalized catalog and validate it

**Files:**
- Modify: `tools.lock.json:31-126`
- Modify: `src/tool-lock.ts:5-129`
- Modify: `src/tool-lock.ts:217-360`
- Test: `tests/unit/tool-lock.test.ts`

**Interfaces:**
- Consumes: the existing `loadToolLock(lockPath?: string): ToolLock` entrypoint.
- Produces: `agentSkillBundleIds`, `AgentSkillBundleId`, `AgentSkillRepository`, `AgentSkillEntry`, `AgentSkillBundle`, and `ToolLock["tools"]["agentSkills"]`.

- [ ] **Step 1: Write failing catalog-shape tests**

Add assertions to `loads pinned external tool sources from tools.lock.json`:

```ts
expect(lock.tools.agentSkills.skillsCli).toEqual({
  source: "npm",
  package: "skills",
  version: "1.5.13",
});
expect(lock.tools.agentSkills.repositories.mattPocockSkills).toEqual({
  source: "github",
  repository: "mattpocock/skills",
  ref: "391a2701dd948f94f56a39f7533f8eea9a859c87",
});
expect(lock.tools.agentSkills.bundles["planning-skills"].skills).toEqual([
  { repository: "mattPocockSkills", skill: "grill-me" },
  { repository: "mattPocockSkills", skill: "grilling" },
  { repository: "mattPocockSkills", skill: "grill-with-docs" },
  { repository: "mattPocockSkills", skill: "domain-modeling" },
  { repository: "mattPocockSkills", skill: "codebase-design" },
  {
    repository: "mattPocockSkills",
    skill: "improve-codebase-architecture",
  },
]);
```

Add a local helper and invalid catalog cases:

```ts
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

type MutableCatalogLock = {
  tools: {
    agentSkills: {
      repositories: Record<string, { ref: string }>;
      bundles: Record<
        string,
        {
          skills: Array<{
            repository: string;
            skill: string;
            path?: string;
          }>;
        }
      >;
    };
  };
};

function writeMutatedLock(
  mutate: (lock: MutableCatalogLock) => void,
): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-lock-test-"));
  const lock = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "tools.lock.json"), "utf8"),
  ) as MutableCatalogLock;
  mutate(lock);
  const lockPath = path.join(tempDir, "tools.lock.json");
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  tempDirs.push(tempDir);
  return lockPath;
}

const invalidCatalogCases: Array<
  [string, (lock: MutableCatalogLock) => void]
> = [
  ["unknown repository", (lock) => {
    lock.tools.agentSkills.bundles.improve.skills[0].repository = "missing";
  }],
  ["mutable repository ref", (lock) => {
    lock.tools.agentSkills.repositories.shadcnImprove.ref = "main";
  }],
  ["empty repositories", (lock) => {
    lock.tools.agentSkills.repositories = {};
  }],
  ["malformed repository key", (lock) => {
    lock.tools.agentSkills.repositories["bad-key"] =
      lock.tools.agentSkills.repositories.shadcnImprove;
    delete lock.tools.agentSkills.repositories.shadcnImprove;
  }],
  ["empty bundle", (lock) => {
    lock.tools.agentSkills.bundles["planning-skills"].skills = [];
  }],
  ["unsupported bundle", (lock) => {
    lock.tools.agentSkills.bundles.unsupported =
      lock.tools.agentSkills.bundles.improve;
  }],
  ["malformed skill name", (lock) => {
    lock.tools.agentSkills.bundles.improve.skills[0].skill = "Bad Skill";
  }],
  ["absolute path", (lock) => {
    lock.tools.agentSkills.bundles.improve.skills[0].path = "/tmp/improve";
  }],
  ["path traversal", (lock) => {
    lock.tools.agentSkills.bundles.improve.skills[0].path =
      "skills/../improve";
  }],
];

it.each(invalidCatalogCases)(
  "rejects an Agent Skills catalog with %s",
  (_label, mutate) => {
    expect(() => loadToolLock(writeMutatedLock(mutate))).toThrow(
      "Invalid tools.lock.json",
    );
  },
);
```

Import `os` from `node:os` and add `afterEach` to the Vitest imports.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm vitest run tests/unit/tool-lock.test.ts
```

Expected: FAIL because `tools.agentSkills` does not exist.

- [ ] **Step 3: Add normalized catalog data without removing legacy fields yet**

Add `tools.agentSkills` to `tools.lock.json`. Keep the current `improve`, nested Agent Browser skill, `frontendSkills`, and `planningSkills` entries temporarily so existing consumers remain green until Task 4.

```json
"agentSkills": {
  "source": "skills-cli",
  "skillsCli": {
    "source": "npm",
    "package": "skills",
    "version": "1.5.13"
  },
  "repositories": {
    "shadcnImprove": {
      "source": "github",
      "repository": "shadcn/improve",
      "ref": "03369ee6d7cafbfcecc4346539b05b3dc0a603bb"
    },
    "agentBrowser": {
      "source": "github",
      "repository": "vercel-labs/agent-browser",
      "ref": "afae698a51242166170b6fe4809dd57fe9f75798"
    },
    "impeccable": {
      "source": "github",
      "repository": "pbakaus/impeccable",
      "ref": "3590bf9e37c84ecbc92f9c205ce1aebf2185a971"
    },
    "webDesignGuidelines": {
      "source": "github",
      "repository": "vercel-labs/agent-skills",
      "ref": "f8a72b9603728bb92a217a879b7e62e43ad76c81"
    },
    "reactDoctor": {
      "source": "github",
      "repository": "millionco/react-doctor",
      "ref": "aa519e5f5505105ef8c00e1b1972c98514f7577a"
    },
    "remotionBestPractices": {
      "source": "github",
      "repository": "remotion-dev/skills",
      "ref": "8b1d51ade295b2d9bd22a8f07047d13c0740f275"
    },
    "mattPocockSkills": {
      "source": "github",
      "repository": "mattpocock/skills",
      "ref": "391a2701dd948f94f56a39f7533f8eea9a859c87"
    }
  },
  "bundles": {
    "improve": {
      "label": "Improve",
      "description": "shadcn advisor skill for auditing codebases and writing execution plans",
      "skills": [
        { "repository": "shadcnImprove", "skill": "improve", "path": "skills/improve" }
      ]
    },
    "frontend-skills": {
      "label": "Frontend Skills",
      "description": "Third-party frontend skills installed via Agent Skills CLI",
      "skills": [
        { "repository": "impeccable", "skill": "impeccable" },
        { "repository": "webDesignGuidelines", "skill": "web-design-guidelines" },
        { "repository": "reactDoctor", "skill": "react-doctor" },
        { "repository": "remotionBestPractices", "skill": "remotion-best-practices" }
      ]
    },
    "planning-skills": {
      "label": "Planning Skills",
      "description": "Third-party planning and architecture skills installed via Agent Skills CLI",
      "skills": [
        { "repository": "mattPocockSkills", "skill": "grill-me" },
        { "repository": "mattPocockSkills", "skill": "grilling" },
        { "repository": "mattPocockSkills", "skill": "grill-with-docs" },
        { "repository": "mattPocockSkills", "skill": "domain-modeling" },
        { "repository": "mattPocockSkills", "skill": "codebase-design" },
        { "repository": "mattPocockSkills", "skill": "improve-codebase-architecture" }
      ]
    },
    "agent-browser": {
      "label": "Agent Browser",
      "description": "Pinned browser automation skill installed via Agent Skills CLI",
      "skills": [
        { "repository": "agentBrowser", "skill": "agent-browser", "path": "skills/agent-browser" }
      ]
    }
  }
}
```

- [ ] **Step 4: Add exact types and runtime validation**

Add these exported types before `ToolLock` in `src/tool-lock.ts`:

```ts
export const agentSkillBundleIds = [
  "improve",
  "frontend-skills",
  "planning-skills",
  "agent-browser",
] as const;

export type AgentSkillBundleId = (typeof agentSkillBundleIds)[number];

export type AgentSkillRepository = {
  source: "github";
  repository: string;
  ref: string;
};

export type AgentSkillEntry = {
  repository: string;
  skill: string;
  path?: string;
};

export type AgentSkillBundle = {
  label: string;
  description: string;
  skills: AgentSkillEntry[];
};
```

Add the normalized shape to `ToolLock["tools"]`:

```ts
agentSkills: {
  source: "skills-cli";
  skillsCli: {
    source: "npm";
    package: string;
    version: string;
  };
  repositories: Record<string, AgentSkillRepository>;
  bundles: Record<AgentSkillBundleId, AgentSkillBundle>;
};
```

Add validation helpers:

```ts
const catalogKeyPattern = /^[A-Za-z][A-Za-z0-9]*$/;
const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSafeRelativePath(value: unknown, label: string): void {
  assertString(value, label);
  const normalized = value.replace(/\\/g, "/");
  if (
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(value) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(
      `Invalid tools.lock.json: ${label} must be a safe relative path.`,
    );
  }
}

function validateAgentSkillsCatalog(
  catalog: ToolLock["tools"]["agentSkills"] | undefined,
): void {
  if (
    !catalog ||
    typeof catalog !== "object" ||
    !catalog.skillsCli ||
    typeof catalog.repositories !== "object" ||
    !catalog.repositories ||
    typeof catalog.bundles !== "object" ||
    !catalog.bundles
  ) {
    throw new Error(
      "Invalid tools.lock.json: tools.agentSkills must define skillsCli, repositories, and bundles.",
    );
  }
  if (catalog.source !== "skills-cli" || catalog.skillsCli.source !== "npm") {
    throw new Error(
      "Invalid tools.lock.json: tools.agentSkills must use skills-cli with an npm CLI source.",
    );
  }
  assertString(catalog.skillsCli.package, "tools.agentSkills.skillsCli.package");
  assertExactVersion(
    catalog.skillsCli.version,
    "tools.agentSkills.skillsCli.version",
  );

  if (Object.keys(catalog.repositories).length === 0) {
    throw new Error(
      "Invalid tools.lock.json: tools.agentSkills.repositories must not be empty.",
    );
  }

  for (const [repositoryId, repository] of Object.entries(
    catalog.repositories,
  )) {
    if (!catalogKeyPattern.test(repositoryId)) {
      throw new Error(
        `Invalid tools.lock.json: tools.agentSkills.repositories key ${repositoryId} is invalid.`,
      );
    }
    if (repository.source !== "github") {
      throw new Error(
        `Invalid tools.lock.json: tools.agentSkills.repositories.${repositoryId}.source must be github.`,
      );
    }
    assertString(
      repository.repository,
      `tools.agentSkills.repositories.${repositoryId}.repository`,
    );
    assertGitSha(
      repository.ref,
      `tools.agentSkills.repositories.${repositoryId}.ref`,
    );
  }

  const expectedBundles = new Set<string>(agentSkillBundleIds);
  for (const bundleId of Object.keys(catalog.bundles)) {
    if (!expectedBundles.has(bundleId)) {
      throw new Error(
        `Invalid tools.lock.json: unsupported Agent Skill bundle ${bundleId}.`,
      );
    }
  }

  for (const bundleId of agentSkillBundleIds) {
    const bundle = catalog.bundles[bundleId];
    if (!bundle || bundle.skills.length === 0) {
      throw new Error(
        `Invalid tools.lock.json: tools.agentSkills.bundles.${bundleId} must contain skills.`,
      );
    }
    assertString(bundle.label, `tools.agentSkills.bundles.${bundleId}.label`);
    assertString(
      bundle.description,
      `tools.agentSkills.bundles.${bundleId}.description`,
    );
    for (const [index, skill] of bundle.skills.entries()) {
      const skillLabel = `tools.agentSkills.bundles.${bundleId}.skills.${index}`;
      if (!catalog.repositories[skill.repository]) {
        throw new Error(
          `Invalid tools.lock.json: ${skillLabel}.repository references unknown repository ${skill.repository}.`,
        );
      }
      if (!skillNamePattern.test(skill.skill)) {
        throw new Error(
          `Invalid tools.lock.json: ${skillLabel}.skill is invalid.`,
        );
      }
      if (skill.path !== undefined) {
        assertSafeRelativePath(skill.path, `${skillLabel}.path`);
      }
    }
  }
}
```

Call `validateAgentSkillsCatalog(lock.tools.agentSkills)` inside
`validateToolLock` while retaining legacy validation until Task 4.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
rtk pnpm vitest run tests/unit/tool-lock.test.ts
rtk pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the normalized catalog foundation**

```bash
git add tools.lock.json src/tool-lock.ts tests/unit/tool-lock.test.ts
git commit -m "feat: add normalized agent skills catalog"
```

---

### Task 2: Derive state, provenance, and update reporting from the catalog

**Files:**
- Modify: `src/state.ts:43-98`
- Modify: `src/state.ts:161-251`
- Modify: `src/provenance.ts:163-174`
- Modify: `src/lock-update.ts:183-262`
- Test: `tests/unit/state.test.ts`
- Test: `tests/unit/lock-update.test.ts`

**Interfaces:**
- Consumes: `ToolLock["tools"]["agentSkills"]` from Task 1.
- Produces: `state.agentSkillsCliPackage`, `state.agentSkillsCatalog`, and one update-report item per catalog repository.

- [ ] **Step 1: Write failing state and update-report tests**

Replace the per-source state assertions in `tests/unit/state.test.ts` with:

```ts
it("exposes the validated Agent Skills catalog without mirrored arrays", () => {
  expect(state.agentSkillsCliPackage).toBe("skills@1.5.13");
  expect(Object.keys(state.agentSkillsCatalog.repositories)).toHaveLength(7);
  expect(
    state.agentSkillsCatalog.bundles["planning-skills"].skills.map(
      ({ skill }) => skill,
    ),
  ).toEqual([
    "grill-me",
    "grilling",
    "grill-with-docs",
    "domain-modeling",
    "codebase-design",
    "improve-codebase-architecture",
  ]);
});
```

Update the fixture in `tests/unit/lock-update.test.ts` with the Task 1
`agentSkills` shape. Assert dynamic repository reporting:

```ts
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
```

Remove the legacy named `React Doctor` update assertion; the normalized
repository assertion above replaces it.

- [ ] **Step 2: Run tests and verify RED**

```bash
rtk pnpm vitest run tests/unit/state.test.ts tests/unit/lock-update.test.ts
```

Expected: FAIL because state and update reporting still use legacy fields.

- [ ] **Step 3: Expose the catalog directly from state**

Add these properties to `State` and its initializer:

```ts
agentSkillsCliPackage: string;
agentSkillsCatalog: ToolLock["tools"]["agentSkills"];
```

```ts
agentSkillsCliPackage:
  process.env.SKILLS_CLI_PACKAGE ||
  formatNpmPackageSpec(
    toolLock.tools.agentSkills.skillsCli.package,
    toolLock.tools.agentSkills.skillsCli.version,
  ),
agentSkillsCatalog: toolLock.tools.agentSkills,
```

Import `type ToolLock` from `tool-lock.ts`. Keep legacy state properties only
until Task 4 so current installers still compile.

- [ ] **Step 4: Switch provenance to the normalized CLI source**

Replace the Agent Skills CLI block in `src/provenance.ts` with:

```ts
if (
  Object.keys(state.agentSkillsCatalog.bundles).some(
    (bundleId) => state.tools[bundleId as keyof typeof state.tools],
  )
) {
  const lockSpec = formatNpmPackageSpec(
    lock.tools.agentSkills.skillsCli.package,
    lock.tools.agentSkills.skillsCli.version,
  );
  checkIdentity("Agent Skills CLI", state.agentSkillsCliPackage, lockSpec);
  checkSource("Agent Skills CLI", state.agentSkillsCliPackage);
}
```

- [ ] **Step 5: Generate update items from normalized repositories**

Replace the hard-coded Improve, frontend repository, and Planning Skills
GitHub items plus the legacy Agent Skills CLI item in `buildLockUpdateReport`
with:

```ts
collectItem(
  {
    name: "Agent Skills CLI",
    source: "npm",
    current: lock.tools.agentSkills.skillsCli.version,
  },
  () =>
    latestNpmVersion(
      lock.tools.agentSkills.skillsCli.package,
      resolvedClients,
    ),
),
...Object.values(lock.tools.agentSkills.repositories).map((repository) =>
  collectItem(
    {
      name: `Agent Skill repository (${repository.repository})`,
      source: "github" as const,
      current: repository.ref,
    },
    () => latestGitHubCommit(repository.repository, resolvedClients),
  ),
),
```

- [ ] **Step 6: Run focused tests and typecheck**

```bash
rtk pnpm vitest run tests/unit/state.test.ts tests/unit/lock-update.test.ts
rtk pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit catalog-derived configuration**

```bash
git add src/state.ts src/provenance.ts src/lock-update.ts tests/unit/state.test.ts tests/unit/lock-update.test.ts
git commit -m "refactor: derive agent skill metadata from catalog"
```

---

### Task 3: Build the deep Agent Skills bundle installer

**Files:**
- Create: `src/installers/agent-skills.ts`
- Test: `tests/unit/installers.test.ts`

**Interfaces:**
- Consumes: `AgentSkillBundleId`, `AgentSkillEntry`, `AgentSkillRepository`, `state.agentSkillsCatalog`, `state.agentSkillsCliPackage`, `selectedSkillsAgentArgs()`, and the existing `system.ts` command seam.
- Produces: `SkillInstallStatus`, `SkillInstallOutcome`, `BundleInstallResult`, and `installAgentSkillBundle(bundleId: AgentSkillBundleId): BundleInstallResult`.

- [ ] **Step 1: Add failing bundle-outcome tests**

Import the new entrypoint in `tests/unit/installers.test.ts`:

```ts
import { installAgentSkillBundle } from "../../src/installers/agent-skills.js";
```

Add `beforeEach` to the Vitest imports, then install the filesystem spies before
every installer test so `vi.restoreAllMocks()` cannot leak real filesystem
behavior into the next case:

```ts
beforeEach(() => {
  vi.spyOn(fs, "existsSync").mockReturnValue(true);
  vi.spyOn(fs, "statSync").mockReturnValue({
    isDirectory: () => true,
  } as never);
});
```

Replace the hoisted mock state with this exact behavior, preserving the existing
`vi.mock("../../src/system.js", ...)` declaration:

```ts
const { runMock, captureMock, failedSkills, pinMismatchRepositories } =
  vi.hoisted(() => {
    const fetchedRefs = new Map<string, string>();
    const failedSkills = new Set<string>();
    const pinMismatchRepositories = new Set<string>();
    const runMock = vi.fn(
      (command: string, args: string[] = []): RunResult => {
        if (command === "git" && args[0] === "-C" && args[2] === "fetch") {
          fetchedRefs.set(args[1] ?? "", args.at(-1) ?? "");
        }
        if (command === "npx") {
          const skillIndex = args.indexOf("--skill");
          const skill = skillIndex === -1 ? "" : (args[skillIndex + 1] ?? "");
          if (failedSkills.has(skill)) {
            return { ok: false, status: 1, stdout: "", stderr: "failed" };
          }
        }
        return { ok: true, status: 0, stdout: "", stderr: "" };
      },
    );
    const captureMock = vi.fn(
      (command: string, args: string[] = []): RunResult => {
        let stdout = "";
        if (command === "git" && args[0] === "-C" && args[2] === "rev-parse") {
          const repositoryId = args[1]?.split(/[\\/]/).at(-1) ?? "";
          stdout = pinMismatchRepositories.has(repositoryId)
            ? `${"f".repeat(40)}\n`
            : `${fetchedRefs.get(args[1] ?? "") ?? ""}\n`;
        }
        return { ok: true, status: 0, stdout, stderr: "" };
      },
    );
    return { runMock, captureMock, failedSkills, pinMismatchRepositories };
  });

afterEach(() => {
  runMock.mockClear();
  captureMock.mockClear();
  failedSkills.clear();
  pinMismatchRepositories.clear();
  vi.restoreAllMocks();
});
```

Add these tests:

```ts
it("clones a shared repository once and installs every Planning Skill", () => {
  const result = installAgentSkillBundle("planning-skills");
  const mattClones = runMock.mock.calls.filter(
    ([command, args]) =>
      command === "git" &&
      args?.includes("clone") &&
      args.includes("https://github.com/mattpocock/skills.git"),
  );

  expect(result.ok).toBe(true);
  expect(result.outcomes).toHaveLength(6);
  expect(result.outcomes.every(({ status }) => status === "installed")).toBe(
    true,
  );
  expect(mattClones).toHaveLength(1);
});

it("continues after one skill fails", () => {
  failedSkills.add("grilling");
  const result = installAgentSkillBundle("planning-skills");

  expect(result.ok).toBe(false);
  expect(result.outcomes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ skill: "grilling", status: "failed" }),
      expect.objectContaining({
        skill: "improve-codebase-architecture",
        status: "installed",
      }),
    ]),
  );
  expect(
    runMock.mock.calls.filter(([command]) => command === "npx"),
  ).toHaveLength(6);
});

it("blocks one repository after pin verification fails", () => {
  pinMismatchRepositories.add("mattPocockSkills");
  const result = installAgentSkillBundle("planning-skills");

  expect(result.ok).toBe(false);
  expect(result.outcomes.every(({ status }) => status === "blocked")).toBe(
    true,
  );
  expect(
    runMock.mock.calls.filter(([command]) => command === "npx"),
  ).toHaveLength(0);
});

it("continues with independent repositories after one pin failure", () => {
  pinMismatchRepositories.add("impeccable");
  const result = installAgentSkillBundle("frontend-skills");

  expect(result.ok).toBe(false);
  expect(result.outcomes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        repository: "impeccable",
        status: "blocked",
      }),
      expect.objectContaining({
        repository: "reactDoctor",
        status: "installed",
      }),
    ]),
  );
  expect(
    runMock.mock.calls.filter(([command]) => command === "npx"),
  ).toHaveLength(3);
});
```

- [ ] **Step 2: Run the installer tests and verify RED**

```bash
rtk pnpm vitest run tests/unit/installers.test.ts
```

Expected: FAIL because `src/installers/agent-skills.ts` does not exist.

- [ ] **Step 3: Create the deep installer with structured outcomes**

Create `src/installers/agent-skills.ts` with this implementation shape:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { err, info, ok, step } from "../logger.js";
import { selectedSkillsAgentArgs } from "../runtimes.js";
import { state } from "../state.js";
import { capture, requireCommand, requireNode, run } from "../system.js";
import type {
  AgentSkillBundleId,
  AgentSkillEntry,
  AgentSkillRepository,
} from "../tool-lock.js";

export type SkillInstallStatus = "installed" | "failed" | "blocked";

export type SkillInstallOutcome = {
  repository: string;
  skill: string;
  status: SkillInstallStatus;
  reason?: string;
};

export type BundleInstallResult = {
  bundle: AgentSkillBundleId;
  ok: boolean;
  outcomes: SkillInstallOutcome[];
};

type CheckoutResult =
  | { ok: true; directory: string }
  | { ok: false; reason: string };

function checkoutRepository(
  repositoryId: string,
  repository: AgentSkillRepository,
  tempDir: string,
): CheckoutResult {
  const directory = path.join(tempDir, repositoryId);
  const repoUrl = `https://github.com/${repository.repository}.git`;
  info(`Cloning ${repository.repository} at ${repository.ref}...`);

  if (
    !run("git", [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      repoUrl,
      directory,
    ]).ok
  ) {
    return { ok: false, reason: `Failed to clone ${repository.repository}.` };
  }
  if (
    !run("git", [
      "-C",
      directory,
      "fetch",
      "--depth",
      "1",
      "origin",
      repository.ref,
    ]).ok
  ) {
    return {
      ok: false,
      reason: `Failed to fetch ${repository.repository}@${repository.ref}.`,
    };
  }
  if (!run("git", ["-C", directory, "checkout", "--detach", "FETCH_HEAD"]).ok) {
    return {
      ok: false,
      reason: `Failed to checkout ${repository.repository}@${repository.ref}.`,
    };
  }

  const head = capture("git", ["-C", directory, "rev-parse", "HEAD"]);
  const actualRef = head.stdout.trim().toLowerCase();
  if (!head.ok || actualRef !== repository.ref.toLowerCase()) {
    return {
      ok: false,
      reason: `Fetched commit for ${repository.repository} does not match pinned ref: expected ${repository.ref}, got ${actualRef || "unknown"}.`,
    };
  }
  return { ok: true, directory };
}

function installSkill(
  entry: AgentSkillEntry,
  checkoutDir: string,
): SkillInstallOutcome {
  const skillRoot = entry.path
    ? path.resolve(checkoutDir, entry.path)
    : checkoutDir;
  const relativeSkillRoot = path.relative(checkoutDir, skillRoot);
  if (
    relativeSkillRoot.startsWith("..") ||
    path.isAbsolute(relativeSkillRoot) ||
    !fs.existsSync(skillRoot) ||
    !fs.statSync(skillRoot).isDirectory()
  ) {
    return {
      repository: entry.repository,
      skill: entry.skill,
      status: "failed",
      reason: `Missing ${entry.skill} skill directory: ${skillRoot}.`,
    };
  }

  info(`Installing ${entry.skill} through Agent Skills CLI...`);
  const result = run("npx", [
    "-y",
    state.agentSkillsCliPackage,
    "add",
    skillRoot,
    "--skill",
    entry.skill,
    ...selectedSkillsAgentArgs(),
    ...(state.gsdScope === "global" ? ["--global"] : []),
    "-y",
    "--copy",
  ]);
  if (result.ok) {
    ok(`${entry.skill} skill installed`);
    return {
      repository: entry.repository,
      skill: entry.skill,
      status: "installed",
    };
  }
  return {
    repository: entry.repository,
    skill: entry.skill,
    status: "failed",
    reason: `${entry.skill} skill install failed.`,
  };
}

export function installAgentSkillBundle(
  bundleId: AgentSkillBundleId,
): BundleInstallResult {
  const bundle = state.agentSkillsCatalog.bundles[bundleId];
  step(bundle.label);
  console.log(`   ${bundle.description}`);
  requireNode(24);
  requireCommand("git");
  requireCommand("npx");

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-toolkit-skills-"),
  );
  const checkouts = new Map<string, CheckoutResult>();
  const outcomes: SkillInstallOutcome[] = [];

  try {
    for (const entry of bundle.skills) {
      let checkout = checkouts.get(entry.repository);
      if (!checkout) {
        const repository = state.agentSkillsCatalog.repositories[entry.repository];
        checkout = repository
          ? checkoutRepository(entry.repository, repository, tempDir)
          : { ok: false, reason: `Unknown repository ${entry.repository}.` };
        checkouts.set(entry.repository, checkout);
      }

      if (!checkout.ok) {
        err(checkout.reason);
        outcomes.push({
          repository: entry.repository,
          skill: entry.skill,
          status: "blocked",
          reason: checkout.reason,
        });
        continue;
      }

      const outcome = installSkill(entry, checkout.directory);
      if (outcome.status === "failed" && outcome.reason) err(outcome.reason);
      outcomes.push(outcome);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const result = {
    bundle: bundleId,
    ok: outcomes.every(({ status }) => status === "installed"),
    outcomes,
  };
  const installedCount = outcomes.filter(
    ({ status }) => status === "installed",
  ).length;
  const problemCount = outcomes.length - installedCount;
  const summary = `${bundle.label}: ${installedCount} installed, ${problemCount} failed or blocked.`;
  if (result.ok) ok(summary);
  else err(summary);
  return result;
}
```

- [ ] **Step 4: Run focused tests and typecheck**

```bash
rtk pnpm vitest run tests/unit/installers.test.ts
rtk pnpm run typecheck
```

Expected: PASS for the new bundle tests while legacy installer tests remain
green until Task 4.

- [ ] **Step 5: Commit the deep installer**

```bash
git add src/installers/agent-skills.ts tests/unit/installers.test.ts
git commit -m "feat: add catalog-driven agent skill installer"
```

---

### Task 4: Route consumers through the deep module and remove shallow modules

**Files:**
- Modify: `src/main.ts:4-12`
- Modify: `src/main.ts:182-216`
- Modify: `src/installers/agent-browser.ts`
- Modify: `src/runtimes.ts:256-284`
- Modify: `src/status.ts:101-137`
- Modify: `src/state.ts`
- Modify: `src/tool-lock.ts`
- Modify: `tools.lock.json`
- Delete: `src/installers/frontend-skills.ts`
- Delete: `src/installers/improve.ts`
- Delete: `src/installers/planning-skills.ts`
- Test: `tests/unit/installers.test.ts`
- Test: `tests/unit/runtimes.test.ts`
- Test: `tests/unit/state.test.ts`
- Test: `tests/unit/tool-lock.test.ts`
- Test: `tests/unit/lock-update.test.ts`

**Interfaces:**
- Consumes: `installAgentSkillBundle(bundleId): BundleInstallResult` from Task 3.
- Produces: every public Agent Skill bundle routed through the new interface, catalog-derived preflight, and no legacy source fields or shallow installers.

- [ ] **Step 1: Write the Planning Skills preflight regression test**

Replace the imports and test setup in `tests/unit/runtimes.test.ts` with the
following hoisted command adapter while keeping the existing version tests:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPrerequisites, versionOutputMatchesPin } from "../../src/runtimes.js";
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
```

Add the catalog-wide regression:

```ts
it.each(agentSkillBundleIds)(
  "requires the Agent Skills toolchain for %s",
  (bundleId) => {
    state.tools[bundleId] = true;

    checkPrerequisites();

    expect(requireNodeMock).toHaveBeenCalledWith(24);
    expect(requireCommandMock).toHaveBeenCalledWith("git");
    expect(requireCommandMock).toHaveBeenCalledWith("npx");
  },
);
```

- [ ] **Step 2: Run the preflight test and verify RED**

```bash
rtk pnpm vitest run tests/unit/runtimes.test.ts
```

Expected: FAIL because `planning-skills` and `agent-browser` are missing from
the current preflight condition.

- [ ] **Step 3: Route Improve, Frontend Skills, and Planning Skills from main**

Remove imports for the three shallow installers and import:

```ts
import { installAgentSkillBundle } from "./installers/agent-skills.js";
```

Replace each call while keeping the existing error and skip messages:

```ts
if (state.tools.improve) {
  if (!installAgentSkillBundle("improve").ok) {
    err("Improve install failed.");
    hadError = true;
  }
} else {
  skip("Improve");
}
```

Replace the other two branches explicitly:

```ts
if (state.tools["frontend-skills"]) {
  if (!installAgentSkillBundle("frontend-skills").ok) {
    err("Frontend Skills install failed.");
    hadError = true;
  }
} else {
  skip("Frontend Skills");
}

if (state.tools["planning-skills"]) {
  if (!installAgentSkillBundle("planning-skills").ok) {
    err("Planning Skills install failed.");
    hadError = true;
  }
} else {
  skip("Planning Skills");
}
```

- [ ] **Step 4: Route Agent Browser's skill through the bundle installer**

In `src/installers/agent-browser.ts`, replace the legacy helper call with:

```ts
const skillResult = installAgentSkillBundle("agent-browser");
if (skillResult.ok) ok("Agent Browser installed");
return skillResult.ok;
```

Keep npm package installation and `agent-browser install` unchanged.

- [ ] **Step 5: Derive preflight from catalog bundle identifiers**

Import `agentSkillBundleIds` in `src/runtimes.ts` and replace the old
`frontend-skills || improve` condition with:

```ts
if (agentSkillBundleIds.some((bundleId) => state.tools[bundleId])) {
  requireNode(24);
  requireCommand("git");
  requireCommand("npx");
  ok(`node found: ${process.version}`);
  ok("git found");
  ok("npx found");
}
```

- [ ] **Step 6: Derive status counts and Improve source detail**

Add internal helpers to `src/status.ts`:

```ts
import type { AgentSkillBundleId } from "./tool-lock.js";

function agentSkillCount(bundleId: AgentSkillBundleId): number {
  return state.agentSkillsCatalog.bundles[bundleId].skills.length;
}

function agentSkillSourceDetail(bundleId: AgentSkillBundleId): string {
  const bundle = state.agentSkillsCatalog.bundles[bundleId];
  return [
    ...new Set(
      bundle.skills.map(({ repository }) => {
        const source = state.agentSkillsCatalog.repositories[repository];
        return `${source.repository}@${source.ref}`;
      }),
    ),
  ].join(", ");
}
```

Use these helpers for Improve detail and Frontend/Planning counts. Keep all
labels and detection states unchanged.

- [ ] **Step 7: Remove legacy state and lock fields**

Remove from `State` and its initializer:

- `improveSkillSource`;
- `agentBrowserSkillSource`;
- `frontendSkillsCliPackage`;
- `frontendSkillSources`;
- `planningSkillSources`.

Remove the legacy `tools.improve`, nested `tools.agentBrowser.skill`,
`tools.frontendSkills`, and `tools.planningSkills` shapes and validation from
`src/tool-lock.ts` and `tools.lock.json`. Keep `tools.agentBrowser` with only:

```ts
agentBrowser: {
  source: "npm";
  package: string;
  version: string;
};
```

In every `ToolLock` test fixture, keep the exact `agentSkills` object introduced
in Task 1 and reduce Agent Browser to:

```ts
agentBrowser: {
  source: "npm",
  package: "agent-browser",
  version: "1.0.0",
},
```

Delete the fixture keys `improve`, `frontendSkills`, and `planningSkills` and
delete assertions that read those legacy paths. Keep catalog assertions as the
replacement test surface.

- [ ] **Step 8: Delete the shallow modules and their old tests**

Delete:

```text
src/installers/frontend-skills.ts
src/installers/improve.ts
src/installers/planning-skills.ts
```

Remove their imports and direct tests from `tests/unit/installers.test.ts`.
Retain the Task 3 deep-interface tests and the Agent Browser composite test.

- [ ] **Step 9: Run the migrated unit suite and typecheck**

```bash
rtk pnpm vitest run tests/unit/tool-lock.test.ts tests/unit/state.test.ts tests/unit/lock-update.test.ts tests/unit/installers.test.ts tests/unit/runtimes.test.ts
rtk pnpm run typecheck
```

Expected: PASS with no imports or references to removed modules.

- [ ] **Step 10: Commit the consumer migration**

```bash
git add tools.lock.json src/main.ts src/runtimes.ts src/status.ts src/state.ts src/tool-lock.ts src/installers/agent-browser.ts src/installers/agent-skills.ts src/installers/frontend-skills.ts src/installers/improve.ts src/installers/planning-skills.ts tests/unit/installers.test.ts tests/unit/runtimes.test.ts tests/unit/state.test.ts tests/unit/tool-lock.test.ts tests/unit/lock-update.test.ts
git commit -m "refactor: route agent skill bundles through catalog"
```

---

### Task 5: Lock the integration and documentation contracts

**Files:**
- Modify: `tests/test-agent-toolkit.sh:130-155`
- Modify: `tests/test-agent-toolkit.sh:239-259`
- Modify: `tests/test-agent-toolkit.sh:570-675`
- Modify: `README.md:43-51`
- Modify: `README.md:125-136`
- Modify: `README.md:560-600`

**Interfaces:**
- Consumes: the final catalog and bundle installer from Tasks 1-4.
- Produces: end-to-end proof of one checkout per repository, catalog/README agreement, and documented provenance.

- [ ] **Step 1: Update the compiled source-module contract**

In `tests/test-agent-toolkit.sh`, replace the three deleted installer entries
with:

```bash
installers/agent-skills.ts \
```

Keep `installers/agent-browser.ts` and the non-Agent-Skills installers.

Update the fake Git clone fixture to create the two catalog entries that use a
nested `path`. Replace its Agent Browser-only condition with:

```bash
if [[ "$*" == *"https://github.com/vercel-labs/agent-browser.git"* ]]; then
  mkdir -p "$destination/skills/agent-browser"
fi
if [[ "$*" == *"https://github.com/shadcn/improve.git"* ]]; then
  mkdir -p "$destination/skills/improve"
fi
```

- [ ] **Step 2: Add the single-checkout integration assertion**

After the `--all` installation assertions and before clearing `GIT_LOG`, add:

```bash
MATT_POCOCK_CLONES="$(grep -Fc -- "clone --filter=blob:none --no-checkout https://github.com/mattpocock/skills.git" "$GIT_LOG")"
if [[ "$MATT_POCOCK_CLONES" -ne 1 ]]; then
  echo "Expected mattpocock/skills to be cloned exactly once per Planning Skills bundle" >&2
  cat "$GIT_LOG" >&2
  exit 1
fi
```

Retain the existing `npx` assertions for all six Planning Skills.

- [ ] **Step 3: Run the end-to-end integration contract**

```bash
rtk pnpm run test:integration
```

Expected: PASS. The Task 3 unit test already established the RED/GREEN cycle for
single-checkout behavior; this step verifies the same outcome through the shell
entrypoint.

- [ ] **Step 4: Make README provenance explicit and catalog-complete**

Update the What It Installs table and Planning Skills example to preserve the
approved bundle-level UX. Replace the locked-source rows for Improve, Agent
Browser skill, Frontend Skills, and Planning Skills with one Agent Skills row
that names the exact normalized sources and identifiers:

```text
skills@1.5.13;
shadcn/improve@03369ee6d7cafbfcecc4346539b05b3dc0a603bb;
vercel-labs/agent-browser@afae698a51242166170b6fe4809dd57fe9f75798;
pbakaus/impeccable@3590bf9e37c84ecbc92f9c205ce1aebf2185a971;
vercel-labs/agent-skills@f8a72b9603728bb92a217a879b7e62e43ad76c81;
millionco/react-doctor@aa519e5f5505105ef8c00e1b1972c98514f7577a;
remotion-dev/skills@8b1d51ade295b2d9bd22a8f07047d13c0740f275;
mattpocock/skills@391a2701dd948f94f56a39f7533f8eea9a859c87;
bundles: improve, agent-browser, frontend-skills, planning-skills;
skills: improve, agent-browser, impeccable, web-design-guidelines,
react-doctor, remotion-best-practices, grill-me, grilling, grill-with-docs,
domain-modeling, codebase-design, improve-codebase-architecture
```

State that repositories are cloned once per selected bundle, pins are verified
before use, and independent skills continue after individual failures.

- [ ] **Step 5: Add a data-driven README/catalog check**

Add this Node block to `tests/test-agent-toolkit.sh` after the existing README
checks:

```bash
ROOT_DIR="$ROOT_DIR" "$REAL_NODE" --input-type=module <<'NODE'
import { readFile } from "node:fs/promises";

const root = process.env.ROOT_DIR;
const lock = JSON.parse(await readFile(`${root}/tools.lock.json`, "utf8"));
const readme = await readFile(`${root}/README.md`, "utf8");
const sectionStart = readme.indexOf("Current external sources:");
const sectionEnd = readme.indexOf(
  "Bundled third-party skills preserve upstream attribution",
  sectionStart,
);
if (sectionStart === -1 || sectionEnd === -1) {
  console.error("Expected README to contain the external source section");
  process.exit(1);
}
const lockedSourceSection = readme.slice(sectionStart, sectionEnd);
const missing = [];
for (const [bundleId, bundle] of Object.entries(lock.tools.agentSkills.bundles)) {
  if (!lockedSourceSection.includes(bundleId)) missing.push(bundleId);
  for (const { skill } of bundle.skills) {
    if (!lockedSourceSection.includes(skill)) missing.push(skill);
  }
}
if (missing.length > 0) {
  console.error(`Expected README to document catalog entries: ${missing.join(", ")}`);
  process.exit(1);
}
NODE
```

- [ ] **Step 6: Run integration, then the full project gate**

```bash
rtk pnpm run test:integration
rtk pnpm run check
```

Expected: both PASS. If root `rtk pnpm run check` is blocked only by the
pre-existing nested `.worktrees/feat/toolkit-evolution/biome.json`, run and
record this equivalent gate:

```bash
pnpm exec biome check README.md src/state.ts src/tool-lock.ts src/provenance.ts src/lock-update.ts src/status.ts src/runtimes.ts src/main.ts src/installers/agent-skills.ts src/installers/agent-browser.ts tests/unit/tool-lock.test.ts tests/unit/state.test.ts tests/unit/lock-update.test.ts tests/unit/installers.test.ts tests/unit/runtimes.test.ts tests/test-agent-toolkit.sh tools.lock.json
pnpm run typecheck
pnpm run test:unit
pnpm run build
find dist/bin dist/src -name '*.js' -print0 | xargs -0 -n1 node --check
bash -n setup-agent-toolkit.sh
pnpm run test:integration
```

- [ ] **Step 7: Refresh Graphify only when present**

```bash
if [[ -f graphify-out/graph.json ]]; then
  rtk graphify update .
fi
```

Expected: graph refresh succeeds when present; absent graph is a no-op.

- [ ] **Step 8: Review the final diff and commit documentation/integration**

```bash
git diff --check
git status --short
git diff -- tools.lock.json src tests README.md
git add README.md tests/test-agent-toolkit.sh
git commit -m "docs: document agent skills catalog"
```

Expected final state: no legacy Agent Skills source arrays or installer modules,
one normalized repository pin per upstream, unchanged public flags, all tests
green, and only unrelated user-owned changes left uncommitted.
