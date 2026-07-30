export function ariadneUsage(): string {
  return `Usage:
  agent-toolkit ariadne init [--runtime <name>] [--check <command>...] [--json]
  agent-toolkit ariadne run [--runtime <name>] [--max-iterations <n>] [--max-runtime <duration>] [--dry-run] [--json]
  agent-toolkit ariadne status [--json]
  agent-toolkit ariadne doctor [--json]`;
}
