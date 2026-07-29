#!/usr/bin/env node
import process from "node:process";
import { runCli } from "../src/cli.js";
import { err, InstallerError } from "../src/logger.js";

runCli()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    if (error instanceof InstallerError) {
      err(error.message);
      console.error("");
      process.exitCode = 1;
      return;
    }

    console.error(error);
    process.exitCode = 1;
  });
