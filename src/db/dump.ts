import { spawn } from "child_process";
import * as fs from "fs";
import cliProgress from "cli-progress";
import { ConnParams } from "./mysql";
import { barFormat } from "../ui/theme";
import { SpeedTracker } from "./speed";

export function checkBinaryOnPath(bin: string): boolean {
  const result = require("child_process").spawnSync(
    process.platform === "win32" ? "where" : "which",
    [bin]
  );
  return result.status === 0;
}

export function mysqldumpArgs(conn: ConnParams, database: string): string[] {
  return [
    "-h", conn.host,
    "-P", String(conn.port),
    "-u", conn.user,
    "--single-transaction",
    "--no-tablespaces",
    "--routines",
    "--triggers",
    "--events",
    "--set-gtid-purged=OFF",
    database,
  ];
}

function makeBar(estimatedTotal: number, label: string): cliProgress.SingleBar {
  const bar = new cliProgress.SingleBar(
    {
      format: barFormat,
      hideCursor: true,
      barCompleteChar: "█",
      barIncompleteChar: "░",
    },
    cliProgress.Presets.shades_classic
  );
  bar.start(estimatedTotal > 0 ? estimatedTotal : 1, 0, { label, speed: "-- MB/s", etaStr: "--:--" });
  return bar;
}

export async function dumpToFile(
  conn: ConnParams,
  database: string,
  outFile: string,
  estimatedSize: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("mysqldump", mysqldumpArgs(conn, database), {
      env: { ...process.env, MYSQL_PWD: conn.password },
    });

    const out = fs.createWriteStream(outFile);
    const bar = makeBar(estimatedSize, "dumping");
    const speed = new SpeedTracker();
    speed.total = estimatedSize;
    let written = 0;
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      written += chunk.length;
      const { speedLabel, etaLabel } = speed.update(written);
      if (estimatedSize > 0) {
        bar.update(Math.min(written, estimatedSize), { label: "dumping", speed: speedLabel, etaStr: etaLabel });
      } else {
        bar.setTotal(written + 1);
        bar.update(written, { label: "dumping", speed: speedLabel, etaStr: "--:--" });
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdout.pipe(out);

    child.on("error", (err) => {
      bar.stop();
      reject(err);
    });

    child.on("close", (code) => {
      bar.update(estimatedSize > 0 ? estimatedSize : written);
      bar.stop();
      if (code !== 0) {
        reject(new Error(`mysqldump exited with code ${code}: ${stderr}`));
      } else {
        resolve();
      }
    });
  });
}
