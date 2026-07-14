import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ".worktrees/**"],
    // menu.test.ts pays fixed setup cost (worker startup + side-effect imports
    // that read tools.lock.json); the 5s default flakes under machine load.
    testTimeout: 15000,
  },
});
