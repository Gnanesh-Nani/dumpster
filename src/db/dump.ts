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

// True when a connection attempt failed because the server has no TLS set up
// (so retrying in plaintext is the right move), rather than for some unrelated
// reason. mysql2 reports this as HANDSHAKE_NO_SSL_SUPPORT.
export function isTlsUnsupportedError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "HANDSHAKE_NO_SSL_SUPPORT") return true;
  return /does not support secure connect/i.test(e.message ?? "");
}

export function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
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

// Docker image used for the ad-hoc container path (dumpMethod: "docker-adhoc") —
// a throwaway container that just runs the mysql client tools, not a database.
const ADHOC_MYSQL_IMAGE = "mysql:latest";

// Build (bin, args, env) for a mysqldump or mysql call. Three cases:
//  - dumpMethod "docker-adhoc": no local client tools installed, spawn a
//    disposable `docker run --rm` container with `--network host` so it can
//    reach the host's own MySQL over 127.0.0.1.
//  - conn.container set: exec into the user's own long-lived container.
//  - otherwise: run the binary directly off the host PATH.
export function buildSpawn(
  conn: ConnParams,
  bin: "mysqldump" | "mysql",
  toolArgs: string[]
): { bin: string; args: string[]; env: NodeJS.ProcessEnv } {
  if (conn.dumpMethod === "docker-adhoc") {
    return {
      bin: "docker",
      args: [
        "run", "--rm", "-i", "--network", "host",
        "-e", "MYSQL_PWD",
        ADHOC_MYSQL_IMAGE, bin, ...toolArgs,
      ],
      env: { ...process.env, MYSQL_PWD: conn.password },
    };
  }
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

// Pure-JS fallback: dumps via a mysql2 connection using the `mysqldump` npm
// package, needing no `mysqldump`/`docker` binary at all. No byte-level
// progress is available from this library, so we report an indeterminate
// spinner-style update while it runs and a final 100% on completion.
export async function dumpToFileJs(
  conn: ConnParams,
  database: string,
  outFile: string,
  onProgress?: OnProgress
): Promise<void> {
  const mysqldump = require("mysqldump");
  onProgress?.({ written: 0, total: 0, speedLabel: "-- MB/s", etaLabel: "--:--" });
  const connection = {
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database,
  };
  // This library defaults to no TLS, which servers with
  // --require_secure_transport=ON (e.g. Azure Database for MySQL) reject.
  // Try SSL first, fall back to plaintext only when the server itself can't
  // do TLS - any other failure is a real error and must not be masked by a
  // second full dump attempt.
  try {
    await mysqldump({ connection: { ...connection, ssl: {} }, dumpToFile: outFile });
  } catch (err) {
    if (!isTlsUnsupportedError(err)) throw err;
    await mysqldump({ connection, dumpToFile: outFile });
  }
  const written = fs.statSync(outFile).size;
  onProgress?.({ written, total: written, speedLabel: "done", etaLabel: "00:00" });
}

// Pure-JS fallback for the import side: runs the dump file's SQL through a
// mysql2 connection instead of spawning the `mysql` CLI, for machines with
// no MySQL command-line client on PATH (e.g. Workbench-only installs).
export async function importFileJs(
  conn: ConnParams,
  database: string,
  inFile: string
): Promise<void> {
  const mysql = require("mysql2/promise");
  const base = {
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database,
    multipleStatements: true,
  };
  // Servers that require TLS (e.g. Azure Database for MySQL) reject plain
  // connections; servers with no TLS configured reject an SSL handshake.
  // Try SSL first, then fall back to plaintext, same as mysql.ts's connect().
  let connection;
  try {
    connection = await mysql.createConnection({ ...base, ssl: {} });
  } catch (err) {
    if (!isTlsUnsupportedError(err)) throw err;
    connection = await mysql.createConnection(base);
  }
  try {
    const sql = fs.readFileSync(inFile, "utf8");
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

export async function dumpToFile(
  conn: ConnParams,
  database: string,
  outFile: string,
  estimatedSize: number,
  onProgress?: OnProgress
): Promise<void> {
  if (conn.dumpMethod === "js") {
    return dumpToFileJs(conn, database, outFile, onProgress);
  }
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
