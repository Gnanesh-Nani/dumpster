#!/usr/bin/env node
import { Command } from "commander";
import * as path from "path";
import { select, input } from "@inquirer/prompts";
import { manageRemoteSources, pickServer } from "./prompts/server";
import { pickDatabase, pickOrCreateTargetDatabase } from "./prompts/database";
import { getLocalTarget } from "./prompts/localTarget";
import { serverToConnParams, estimateDatabaseSize, ConnParams } from "./db/mysql";
import { dumpToFile, checkBinaryOnPath } from "./db/dump";
import { cloneDatabase } from "./db/clone";
import * as ui from "./ui/theme";
import { GoBack } from "./ui/nav";

const program = new Command();

program
  .name("dumpster")
  .description("MySQL dump/clone CLI")
  .version("0.1.0");

program.action(async () => {
  await runInteractiveFlow();
});

const REMOTE_SOURCES = "remote-sources";
const DUMP_LOCAL = "dump-local";
const DUMP_FILE = "dump-file";

async function runInteractiveFlow(): Promise<void> {
  ui.banner();

  for (const bin of ["mysqldump", "mysql"]) {
    if (!checkBinaryOnPath(bin)) {
      ui.errorMsg(`'${bin}' not found on PATH. Install MySQL client tools first.`);
      process.exit(1);
    }
  }

  for (;;) {
    const action = await select({
      message: "What do you want to do?",
      choices: [
        { name: "Remote sources", value: REMOTE_SOURCES },
        { name: "Dump to local database", value: DUMP_LOCAL },
        { name: "Dump to a .sql file", value: DUMP_FILE },
      ],
    });

    try {
      if (action === REMOTE_SOURCES) {
        await manageRemoteSources();
      } else if (action === DUMP_LOCAL) {
        await runDumpToLocal();
        break;
      } else {
        await runDumpToFile();
        break;
      }
    } catch (err) {
      if (err instanceof GoBack) continue;
      throw err;
    }
  }
}

// Picks source server + database, replacing both finished prompts with a
// single "source: host : db" breadcrumb once both are chosen.
async function pickSource(): Promise<{ server: Awaited<ReturnType<typeof pickServer>>; conn: ConnParams; database: string }> {
  for (;;) {
    const server = await pickServer("remote");
    const conn = serverToConnParams(server);
    try {
      const database = await pickDatabase(conn, server.name);
      ui.clearLines(2);
      ui.breadcrumb("source", `${server.host} : ${database}`);
      return { server, conn, database };
    } catch (err) {
      if (err instanceof GoBack) continue; // back to server picker
      throw err;
    }
  }
}

async function runDumpToFile(): Promise<void> {
  const { server: sourceServer, conn: sourceConn, database } = await pickSource();
  const estimatedSize = await estimateDatabaseSize(sourceConn, database).catch(() => 0);

  const defaultOut = path.resolve(process.cwd(), `${database}_dump_${timestamp()}.sql`);
  const outFile = await input({ message: "Output file path:", default: defaultOut });
  ui.clearLines(1);
  ui.breadcrumb("output", outFile);

  console.log();
  await dumpToFile(sourceConn, database, outFile, estimatedSize);
  ui.summaryBox([`Dump complete`, `Database : ${database}`, `Saved to : ${outFile}`]);
}

async function runDumpToLocal(): Promise<void> {
  const { server: sourceServer, conn: sourceConn, database } = await pickSource();
  const estimatedSize = await estimateDatabaseSize(sourceConn, database).catch(() => 0);

  const targetConn = await getLocalTarget();
  const { dbName: targetDb, promptLines } = await pickOrCreateTargetDatabase(targetConn);
  ui.clearLines(promptLines);
  ui.breadcrumb("target", targetDb);

  console.log();
  await cloneDatabase(sourceConn, database, targetConn, targetDb, estimatedSize);
  ui.summaryBox([
    `Clone complete`,
    `Source : ${database} (${sourceServer.name})`,
    `Target : ${targetDb} (local)`,
  ]);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
