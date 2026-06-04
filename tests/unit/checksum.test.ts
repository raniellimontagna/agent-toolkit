import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256File, verifySha256File } from "../../src/checksum.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-toolkit-checksum-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("checksum helpers", () => {
  it("computes and verifies SHA-256 hashes for downloaded assets", () => {
    const filePath = path.join(tempDir, "asset.bin");
    fs.writeFileSync(filePath, "agent-toolkit");

    const expected =
      "85935602d79f75ee23f6452a6c26dbabc54c850dc17353a6305dcaaa8cf6ab02";

    expect(sha256File(filePath)).toBe(expected);
    expect(verifySha256File(filePath, expected)).toBe(true);
    expect(verifySha256File(filePath, "0".repeat(64))).toBe(false);
  });
});
