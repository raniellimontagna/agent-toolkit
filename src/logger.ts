const colorEnabled = !process.env.NO_COLOR;

export const color = {
  red: colorEnabled ? "\x1b[0;31m" : "",
  green: colorEnabled ? "\x1b[0;32m" : "",
  yellow: colorEnabled ? "\x1b[0;33m" : "",
  blue: colorEnabled ? "\x1b[0;34m" : "",
  cyan: colorEnabled ? "\x1b[0;36m" : "",
  bold: colorEnabled ? "\x1b[1m" : "",
  reset: colorEnabled ? "\x1b[0m" : "",
};

export class InstallerError extends Error {}

export function ok(message: string): void {
  console.log(`${color.green}  [+]${color.reset} ${message}`);
}

export function warn(message: string): void {
  console.log(`${color.yellow}  [!]${color.reset} ${message}`);
}

export function err(message: string): void {
  console.error(`${color.red}  [x]${color.reset} ${message}`);
}

export function info(message: string): void {
  console.log(`${color.cyan}  [>]${color.reset} ${message}`);
}

export function step(message: string): void {
  console.log("");
  console.log(`${color.bold}${color.blue}> ${message}${color.reset}`);
}

export function skip(message: string): void {
  console.log(`${color.yellow}  [~]${color.reset} Skipped - ${message}`);
}

export function die(message: string): never {
  throw new InstallerError(message);
}
