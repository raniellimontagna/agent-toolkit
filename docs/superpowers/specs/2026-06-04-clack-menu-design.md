# Clack Menu Design

## Goal

Replace the plain readline prompts used in interactive runs with a visual menu that feels appropriate for a published Node CLI.

## Decision

Use `@clack/prompts` for TTY-based interactive runs. It provides a styled installer flow with multi-select, select, confirm, cancellation and concise completion messages while staying much lighter than full TUI frameworks.

## Behavior

Interactive terminals show:

- a Clack intro for Agent Toolkit;
- multi-select tools with an explicit `All tools` option;
- multi-select runtimes with an explicit `All runtimes` option;
- a global/local install-scope select;
- a confirmation for installing missing runtime CLIs;
- a skill-scope multi-select when Custom Skills is selected.

The prompt must not preselect every tool or runtime. Users must explicitly choose `All tools` or `All runtimes`, preserving the existing safety rule that pressing Enter does not silently install the full kit.

## Fallbacks

Non-TTY and piped input keep the existing line-based answer parser so automation remains stable. Set `AGENT_TOOLKIT_MENU=plain` to force the previous readline prompts in an interactive terminal.

## Testing

Unit tests use a fake Clack API to verify visual prompt selections update the installer state. The existing shell integration test continues to cover non-interactive flags, piped menus, wrapper behavior and installer wiring.
