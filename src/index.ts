#!/usr/bin/env node
import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { checkBinaryOnPath } from "./db/dump";

const program = new Command();

program
  .name("dumpster")
  .description("MySQL dump/clone CLI")
  .version("2.1.0");

program.action(() => {
  const hasMysqlBins = checkBinaryOnPath("mysqldump") && checkBinaryOnPath("mysql");
  const hasDocker = checkBinaryOnPath("docker");
  if (!hasMysqlBins && !hasDocker) {
    console.error(
      "Error: neither MySQL client tools ('mysqldump'/'mysql') nor 'docker' found on PATH.\n" +
        "Install one of:\n" +
        "  - MySQL client tools (mysqldump + mysql), or\n" +
        "  - Docker (if your MySQL runs inside a container — dumpster can exec into it)"
    );
    process.exit(1);
  }
  // Enter the terminal's alternate screen buffer so prior scrollback is
  // hidden while dumpster runs, and restored untouched on exit.
  const ENTER_ALT = "\x1b[?1049h";
  const LEAVE_ALT = "\x1b[?1049l";
  const CLEAR = "\x1b[2J\x1b[3J\x1b[H";
  process.stdout.write(ENTER_ALT + CLEAR);
  const restore = () => process.stdout.write(LEAVE_ALT);
  process.on("exit", restore);
  process.on("SIGINT", () => { restore(); process.exit(130); });
  process.on("SIGTERM", () => { restore(); process.exit(143); });

  const { waitUntilExit } = render(React.createElement(App));
  waitUntilExit().finally(restore);
});

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
