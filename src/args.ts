import path from "node:path";
import { die, warn } from "./logger.js";
import {
  type RuntimeName,
  selectOnlyRuntime,
  selectOnlyTool,
  setAllRuntimes,
  setAllTools,
  splitList,
  state,
  type ToolName,
} from "./state.js";
import { usage } from "./usage.js";

export function parseArgs(argv: string[]): boolean {
  let lastOnlyTool: ToolName | null = null;
  let lastOnlyRuntime: RuntimeName | null = null;

  function applyOnlyTool(flag: string, tool: ToolName): void {
    if (lastOnlyTool && lastOnlyTool !== tool) {
      warn(
        `--${lastOnlyTool}-only was overridden by ${flag}; only ${tool} will be installed. These flags are mutually exclusive - use --all (with --no-<tool>) to combine tools instead of stacking "-only" flags.`,
      );
    }
    lastOnlyTool = tool;
    selectOnlyTool(tool);
  }

  function applyOnlyRuntime(flag: string, runtime: RuntimeName): void {
    if (lastOnlyRuntime && lastOnlyRuntime !== runtime) {
      warn(
        `--${lastOnlyRuntime} was overridden by ${flag}; only ${runtime} will be targeted. These flags are mutually exclusive - use --all-runtimes (with --no-<runtime>) to combine runtimes instead of stacking bare runtime flags.`,
      );
    }
    lastOnlyRuntime = runtime;
    selectOnlyRuntime(runtime);
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    switch (arg) {
      case "--all":
        setAllTools(true);
        state.tools["agent-browser"] = false;
        state.nonInteractive = true;
        break;
      case "--rtk-only":
        applyOnlyTool(arg, "rtk");
        state.nonInteractive = true;
        break;
      case "--caveman-only":
        applyOnlyTool(arg, "caveman");
        state.nonInteractive = true;
        break;
      case "--superpowers-only":
        applyOnlyTool(arg, "superpowers");
        state.nonInteractive = true;
        break;
      case "--graphify-only":
        applyOnlyTool(arg, "graphify");
        state.nonInteractive = true;
        break;
      case "--gsd-only":
        applyOnlyTool(arg, "gsd");
        state.nonInteractive = true;
        break;
      case "--improve-only":
        applyOnlyTool(arg, "improve");
        state.nonInteractive = true;
        break;
      case "--agent-browser-only":
        applyOnlyTool(arg, "agent-browser");
        state.nonInteractive = true;
        break;
      case "--frontend-skills-only":
        applyOnlyTool(arg, "frontend-skills");
        state.nonInteractive = true;
        break;
      case "--planning-skills-only":
        applyOnlyTool(arg, "planning-skills");
        state.nonInteractive = true;
        break;
      case "--skills-only":
        applyOnlyTool(arg, "skills");
        state.nonInteractive = true;
        break;
      case "--no-rtk":
        state.tools.rtk = false;
        state.nonInteractive = true;
        break;
      case "--no-caveman":
        state.tools.caveman = false;
        state.nonInteractive = true;
        break;
      case "--no-superpowers":
        state.tools.superpowers = false;
        state.nonInteractive = true;
        break;
      case "--no-graphify":
        state.tools.graphify = false;
        state.nonInteractive = true;
        break;
      case "--no-gsd":
        state.tools.gsd = false;
        state.nonInteractive = true;
        break;
      case "--no-improve":
        state.tools.improve = false;
        state.nonInteractive = true;
        break;
      case "--no-agent-browser":
        state.tools["agent-browser"] = false;
        state.nonInteractive = true;
        break;
      case "--no-frontend-skills":
        state.tools["frontend-skills"] = false;
        state.nonInteractive = true;
        break;
      case "--no-planning-skills":
        state.tools["planning-skills"] = false;
        state.nonInteractive = true;
        break;
      case "--no-skills":
        state.tools.skills = false;
        state.nonInteractive = true;
        break;
      case "--all-runtimes":
        setAllRuntimes(true);
        state.nonInteractive = true;
        break;
      case "--claude":
        applyOnlyRuntime(arg, "claude");
        state.nonInteractive = true;
        break;
      case "--codex":
        applyOnlyRuntime(arg, "codex");
        state.nonInteractive = true;
        break;
      case "--opencode":
        applyOnlyRuntime(arg, "opencode");
        state.nonInteractive = true;
        break;
      case "--gemini":
        applyOnlyRuntime(arg, "gemini");
        state.nonInteractive = true;
        break;
      case "--antigravity":
        applyOnlyRuntime(arg, "antigravity");
        state.nonInteractive = true;
        break;
      case "--no-claude":
        state.runtimes.claude = false;
        state.nonInteractive = true;
        break;
      case "--no-codex":
        state.runtimes.codex = false;
        state.nonInteractive = true;
        break;
      case "--no-opencode":
        state.runtimes.opencode = false;
        state.nonInteractive = true;
        break;
      case "--no-gemini":
        state.runtimes.gemini = false;
        state.nonInteractive = true;
        break;
      case "--no-antigravity":
        state.runtimes.antigravity = false;
        state.nonInteractive = true;
        break;
      case "--global":
        state.gsdScope = "global";
        break;
      case "--local":
        state.gsdScope = "local";
        break;
      case "--skills-dir":
        i += 1;
        {
          const skillsDir = argv[i];
          if (!skillsDir) die("--skills-dir requires a directory.");
          state.customSkillsDir = path.resolve(skillsDir);
        }
        break;
      case "--skills-scope":
        i += 1;
        {
          const skillsScope = argv[i];
          if (!skillsScope) die("--skills-scope requires a scope path.");
          state.skillScopes.push(...splitList(skillsScope));
        }
        state.nonInteractive = true;
        break;
      case "--skills-path":
        i += 1;
        {
          const skillsPath = argv[i];
          if (!skillsPath) die("--skills-path requires a skill path.");
          state.skillPaths.push(...splitList(skillsPath));
        }
        state.nonInteractive = true;
        break;
      case "--skills-package":
        i += 1;
        {
          const skillsPackage = argv[i];
          if (!skillsPackage) die("--skills-package requires a package name.");
          state.skillPackages.push(...splitList(skillsPackage));
        }
        state.nonInteractive = true;
        break;
      case "--skills-list":
        state.listSkills = true;
        state.nonInteractive = true;
        break;
      case "--dry-run":
      case "--plan-only":
        state.dryRun = true;
        state.nonInteractive = true;
        break;
      case "--doctor":
      case "--status":
        state.doctor = true;
        state.nonInteractive = true;
        break;
      case "--json":
        state.jsonOutput = true;
        break;
      case "--uninstall":
        state.uninstall = true;
        state.nonInteractive = true;
        break;
      case "--repair":
        state.repair = true;
        state.nonInteractive = true;
        break;
      case "--update-lock":
        state.updateLock = true;
        state.nonInteractive = true;
        break;
      case "--skills-audit":
        state.auditSkills = true;
        state.nonInteractive = true;
        break;
      case "--install-missing-clis":
        state.installMissingClis = true;
        break;
      case "--allow-mutable-sources":
        state.allowMutableSources = true;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        return false;
      default:
        die(`Unknown flag: ${arg}. Use --help for usage.`);
    }
  }

  return true;
}
