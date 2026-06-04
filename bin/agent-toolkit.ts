#!/usr/bin/env node
import process from "node:process";
import { err, InstallerError } from "../src/logger.js";
import { runInstaller } from "../src/main.js";

runInstaller().catch((error) => {
  if (error instanceof InstallerError) {
    err(error.message);
    console.error("");
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
