import fs from "node:fs";
import path from "node:path";
import { AriadneStateError, validateConfig, validatePrd } from "./schema.js";
import type { AriadneConfig, AriadnePrd } from "./types.js";

export type AriadnePaths = {
  root: string;
  config: string;
  prd: string;
  progress: string;
  lock: string;
  runs: string;
  archive: string;
};

function safePathPart(value: string, label: string): string {
  if (
    !value ||
    path.basename(value) !== value ||
    value === "." ||
    value === ".."
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

export class AriadneStore {
  readonly paths: AriadnePaths;

  constructor(readonly projectRoot: string) {
    const root = path.join(projectRoot, ".ariadne");
    this.paths = {
      root,
      config: path.join(root, "config.json"),
      prd: path.join(root, "prd.json"),
      progress: path.join(root, "progress.md"),
      lock: path.join(root, "lock"),
      runs: path.join(root, "runs"),
      archive: path.join(root, "archive"),
    };
  }

  ensureLayout(): void {
    fs.mkdirSync(this.paths.root, { recursive: true });
    fs.mkdirSync(this.paths.archive, { recursive: true });
  }

  loadConfig(): AriadneConfig {
    return validateConfig(this.readJson(this.paths.config));
  }

  loadPrd(): AriadnePrd {
    return validatePrd(this.readJson(this.paths.prd));
  }

  saveConfig(config: AriadneConfig): void {
    this.writeJsonAtomic(this.paths.config, validateConfig(config));
  }

  savePrd(prd: AriadnePrd): void {
    this.writeJsonAtomic(this.paths.prd, validatePrd(prd));
  }

  appendProgress(entry: string): void {
    this.ensureLayout();
    fs.appendFileSync(this.paths.progress, `${entry}\n`, "utf8");
  }

  createRunDir(runId: string): string {
    const directory = path.join(this.paths.runs, safePathPart(runId, "run id"));
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  writeRunJson(runId: string, name: string, value: unknown): string {
    const destination = path.join(
      this.createRunDir(runId),
      safePathPart(name, "run file name"),
    );
    this.writeJsonAtomic(destination, value);
    return destination;
  }

  archiveImportedPrd(sourceText: string, timestamp: string): string {
    const normalized = new Date(timestamp)
      .toISOString()
      .replace(/:/g, "-")
      .replace(".", "-");
    const destination = path.join(
      this.paths.archive,
      `import-${normalized}`,
      "prd.json",
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, sourceText, "utf8");
    return destination;
  }

  private readJson(source: string): unknown {
    let contents: string;
    try {
      contents = fs.readFileSync(source, "utf8");
    } catch {
      throw new AriadneStateError(source, "unable to read Ariadne state");
    }
    try {
      return JSON.parse(contents) as unknown;
    } catch {
      throw new AriadneStateError(source, "contains malformed JSON");
    }
  }

  private writeJsonAtomic(destination: string, value: unknown): void {
    this.ensureLayout();
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp`;
    try {
      const descriptor = fs.openSync(temporary, "w");
      try {
        fs.writeFileSync(
          descriptor,
          `${JSON.stringify(value, null, 2)}\n`,
          "utf8",
        );
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, destination);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
}
