import { state } from "../state.js";
import { installSkillsCliSources } from "./frontend-skills.js";

export function installPlanningSkills(): boolean {
  return installSkillsCliSources(
    "Planning Skills",
    "Third-party planning/design skills installed via Agent Skills CLI",
    state.planningSkillSources,
  );
}
