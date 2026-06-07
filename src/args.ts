import path from "node:path";
import { die } from "./logger.js";
import {
  selectOnlyRuntime,
  selectOnlyTool,
  setAllRuntimes,
  setAllTools,
  splitList,
  state,
} from "./state.js";
import { usage } from "./usage.js";

export function parseArgs(argv: string[]): boolean {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    switch (arg) {
      case "--all":
        setAllTools(true);
        state.nonInteractive = true;
        break;
      case "--rtk-only":
        selectOnlyTool("rtk");
        state.nonInteractive = true;
        break;
      case "--caveman-only":
        selectOnlyTool("caveman");
        state.nonInteractive = true;
        break;
      case "--superpowers-only":
        selectOnlyTool("superpowers");
        state.nonInteractive = true;
        break;
      case "--graphify-only":
        selectOnlyTool("graphify");
        state.nonInteractive = true;
        break;
      case "--gsd-only":
        selectOnlyTool("gsd");
        state.nonInteractive = true;
        break;
      case "--frontend-skills-only":
        selectOnlyTool("frontend-skills");
        state.nonInteractive = true;
        break;
      case "--skills-only":
        selectOnlyTool("skills");
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
      case "--no-frontend-skills":
        state.tools["frontend-skills"] = false;
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
        selectOnlyRuntime("claude");
        state.nonInteractive = true;
        break;
      case "--codex":
        selectOnlyRuntime("codex");
        state.nonInteractive = true;
        break;
      case "--opencode":
        selectOnlyRuntime("opencode");
        state.nonInteractive = true;
        break;
      case "--gemini":
        selectOnlyRuntime("gemini");
        state.nonInteractive = true;
        break;
      case "--antigravity":
        selectOnlyRuntime("antigravity");
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
