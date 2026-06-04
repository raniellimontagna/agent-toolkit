import { createHash } from "node:crypto";
import fs from "node:fs";

export function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function verifySha256File(
  filePath: string,
  expectedSha256: string,
): boolean {
  return sha256File(filePath).toLowerCase() === expectedSha256.toLowerCase();
}
