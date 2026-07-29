import type { AriadneDoctorReport } from "./doctor.js";
import type { AriadneStatusReport } from "./status.js";

export function formatAriadneJson(
  report: AriadneStatusReport | AriadneDoctorReport,
): string {
  return JSON.stringify(report, null, 2);
}

export function formatAriadneStatus(report: AriadneStatusReport): string {
  const lines = [
    "Ariadne status",
    `Project: ${report.project}`,
    `Branch: ${report.branch.current} (configured: ${report.branch.configured})`,
    report.runtime
      ? `Runtime: ${report.runtime.name} (${report.runtime.state}${report.runtime.version ? `, ${report.runtime.version}` : ""})`
      : "Runtime: not configured",
    `Stories: ${report.stories.pending} pending, ${report.stories.inProgress} in progress, ${report.stories.completed} completed, ${report.stories.blocked} blocked`,
    report.activeStory
      ? `Active story: ${report.activeStory.id} ${report.activeStory.title} (attempts: ${report.activeStory.attempts})`
      : "Active story: none",
    report.lastRun
      ? `Last run: ${report.lastRun.id} (${report.lastRun.outcome}, ${report.lastRun.durationMs}ms)`
      : "Last run: none",
    `Worktree: ${report.dirty ? "dirty" : "clean"}`,
    `Lock: ${report.lock.state}${report.lock.pid ? ` (PID ${report.lock.pid}${report.lock.runId ? `, run ${report.lock.runId}` : ""})` : ""}`,
    `Progress: ${report.paths.progress}`,
    `Runs: ${report.paths.runs}`,
  ];
  return lines.join("\n");
}

export function formatAriadneDoctor(report: AriadneDoctorReport): string {
  const lines = [
    `Ariadne doctor: ${report.ok ? "ok" : "issues found"}`,
    "",
    formatAriadneStatus(report.status),
  ];
  if (report.issues.length === 0) {
    lines.push("", "Issues: none");
    return lines.join("\n");
  }
  lines.push("", "Issues:");
  for (const issue of report.issues) {
    lines.push(
      `- ${issue.severity.toUpperCase()} [${issue.code}] ${issue.message}`,
    );
  }
  return lines.join("\n");
}
