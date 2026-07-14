import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallerError } from "../../src/logger.js";
import {
  checkAntigravitySource,
  normalizeAntigravityInstallUrl,
} from "../../src/provenance.js";
import { state } from "../../src/state.js";

let originalInstallScript: string | undefined;
let originalAllowMutableSources: boolean;

beforeEach(() => {
  originalInstallScript = process.env.ANTIGRAVITY_INSTALL_SCRIPT;
  originalAllowMutableSources = state.allowMutableSources;
  delete process.env.ANTIGRAVITY_INSTALL_SCRIPT;
  state.allowMutableSources = false;
});

afterEach(() => {
  if (originalInstallScript === undefined) {
    delete process.env.ANTIGRAVITY_INSTALL_SCRIPT;
  } else {
    process.env.ANTIGRAVITY_INSTALL_SCRIPT = originalInstallScript;
  }
  state.allowMutableSources = originalAllowMutableSources;
  vi.restoreAllMocks();
});

describe("normalizeAntigravityInstallUrl", () => {
  it("accepts and normalizes a normal HTTPS URL", () => {
    expect(
      normalizeAntigravityInstallUrl("https://EXAMPLE.com/install.sh"),
    ).toBe("https://example.com/install.sh");
  });

  it("preserves an HTTPS query containing an ampersand as URL data", () => {
    const input = "https://example.com/install.sh?channel=stable&arch=x64";

    expect(normalizeAntigravityInstallUrl(input)).toBe(input);
  });

  it("rejects HTTP", () => {
    expect(() =>
      normalizeAntigravityInstallUrl("http://example.com/install.sh"),
    ).toThrow(InstallerError);
  });

  it("rejects malformed input", () => {
    expect(() => normalizeAntigravityInstallUrl("not a URL")).toThrow(
      InstallerError,
    );
  });

  it("rejects HTTPS without a hostname", () => {
    expect(() =>
      normalizeAntigravityInstallUrl("https://?channel=stable"),
    ).toThrow(InstallerError);
  });

  it.each([
    "https://user@example.com/install.sh",
    "https://user:secret@example.com/install.sh",
  ])("rejects credentials in %s", (input) => {
    expect(() => normalizeAntigravityInstallUrl(input)).toThrow(InstallerError);
  });
});

describe("checkAntigravitySource", () => {
  it("accepts the normalized default without mutable-source authorization", () => {
    process.env.ANTIGRAVITY_INSTALL_SCRIPT =
      "HTTPS://ANTIGRAVITY.GOOGLE/cli/install.sh";

    expect(() => checkAntigravitySource()).not.toThrow();
  });

  it("requires mutable-source authorization for a non-default valid URL", () => {
    process.env.ANTIGRAVITY_INSTALL_SCRIPT =
      "https://example.com/install.sh?channel=stable&arch=x64";

    expect(() => checkAntigravitySource()).toThrow(
      /overrides the official installer URL/,
    );
  });

  it("allows a non-default valid URL only when explicitly authorized", () => {
    process.env.ANTIGRAVITY_INSTALL_SCRIPT =
      "https://example.com/install.sh?channel=stable&arch=x64";
    state.allowMutableSources = true;
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(() => checkAntigravitySource()).not.toThrow();
  });
});
