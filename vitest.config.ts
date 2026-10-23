import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vendored skills ship node:test suites that vitest cannot collect.
    exclude: [...configDefaults.exclude, ".worktrees/**", "skills/**"],
    // menu.test.ts pays fixed setup cost (worker startup + side-effect imports
    // that read tools.lock.json); the 5s default flakes under machine load.
    testTimeout: 15000,
  },
});
