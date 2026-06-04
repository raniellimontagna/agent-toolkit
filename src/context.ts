import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT =
  path.basename(SRC_DIR) === "src" &&
  path.basename(path.dirname(SRC_DIR)) === "dist"
    ? path.resolve(SRC_DIR, "..", "..")
    : path.resolve(SRC_DIR, "..");
export const HOME = process.env.HOME || os.homedir();
