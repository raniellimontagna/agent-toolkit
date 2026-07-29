import process from "node:process";
import { runAriadne } from "./ariadne/cli.js";
import { runInstaller } from "./main.js";

export type CliDeps = {
  runInstaller: (argv: string[]) => Promise<void>;
  runAriadne: (argv: string[]) => Promise<number>;
};

const defaultCliDeps: CliDeps = {
  runInstaller,
  runAriadne,
};

export async function runCli(
  argv: string[] = process.argv.slice(2),
  deps: CliDeps = defaultCliDeps,
): Promise<number> {
  if (argv[0] === "ariadne") return deps.runAriadne(argv.slice(1));
  await deps.runInstaller(argv);
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}
