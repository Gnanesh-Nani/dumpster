import { spawn } from "child_process";
import * as fs from "fs";
import { ConnParams } from "./mysql";
import { SpeedTracker } from "./speed";

export interface ProgressUpdate {
  written: number;
  total: number;
  speedLabel: string;
  etaLabel: string;
}

export type OnProgress = (u: ProgressUpdate) => void;

export function checkBinaryOnPath(bin: string): boolean {
  const result = require("child_process").spawnSync(
    process.platform === "win32" ? "where" : "which",
    [bin]
  );
  return result.status === 0;
}

export function mysqldumpArgs(conn: ConnParams, database: string): string[] {
  // When running inside a container, connect to MySQL over its localhost
  // (the container's own bind), not the host address the user entered.
  const host = conn.container ? "127.0.0.1" : conn.host;
  const port = conn.container ? 3306 : conn.port;
  return [
    "-h", host,
    "-P", String(port),
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

// Build (bin, args, env) for a mysqldump or mysql call, wrapping in
// `docker exec` when the conn is container-scoped so binaries inside the
// container are used instead of ones on the host PATH.
export function buildSpawn(
  conn: ConnParams,
  bin: "mysqldump" | "mysql",
  toolArgs: string[]
): { bin: string; args: string[]; env: NodeJS.ProcessEnv } {
  if (conn.container) {
    return {
      bin: "docker",
      args: ["exec", "-i", "-e", "MYSQL_PWD", conn.container, bin, ...toolArgs],
      env: { ...process.env, MYSQL_PWD: conn.password },
    };
  }
  return {
    bin,
    args: toolArgs,
    env: { ...process.env, MYSQL_PWD: conn.password },
  };
}

export async function dumpToFile(
  conn: ConnParams,
  database: string,
  outFile: string,
  estimatedSize: number,
  onProgress?: OnProgress
): Promise<void> {
  return new Promise((resolve, reject) => {
    const spec = buildSpawn(conn, "mysqldump", mysqldumpArgs(conn, database));
    const child = spawn(spec.bin, spec.args, { env: spec.env });

    const out = fs.createWriteStream(outFile);
    const speed = new SpeedTracker();
    speed.total = estimatedSize;
    let written = 0;
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      written += chunk.length;
      const { speedLabel, etaLabel } = speed.update(written);
      const total = estimatedSize > 0 ? estimatedSize : written + 1;
      onProgress?.({ written: Math.min(written, total), total, speedLabel, etaLabel: estimatedSize > 0 ? etaLabel : "--:--" });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdout.pipe(out);

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      const total = estimatedSize > 0 ? estimatedSize : written;
      onProgress?.({ written: total, total, speedLabel: "done", etaLabel: "00:00" });
      if (code !== 0) {
        reject(new Error(`mysqldump exited with code ${code}: ${stderr}`));
      } else {
        resolve();
      }
    });
  });
}
