#!/usr/bin/env node
import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { App } from "./ui/App";

const program = new Command();

program
  .name("dumpster")
  .description("MySQL dump/clone CLI")
  .version("2.1.0");

program.action(() => {
  // No startup binary check: when a local server is missing mysqldump/mysql,
  // the app now prompts per-connection to run via an ad-hoc Docker container
  // or a pure-JS dump — either path works with no client tools installed.
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
