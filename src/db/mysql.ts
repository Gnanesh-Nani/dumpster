import mysql from "mysql2/promise";
import { spawn } from "child_process";
import { ServerProfile } from "../config/types";
import { decryptPassword } from "../config/crypto";

const SYSTEM_DBS = new Set(["information_schema", "performance_schema", "mysql", "sys"]);

export interface ConnParams {
  host: string;
  port: number;
  user: string;
  password: string;
  container?: string;
}

export function serverToConnParams(server: ServerProfile): ConnParams {
  return {
    host: server.host,
    port: server.port,
    user: server.user,
    password: decryptPassword(server.passwordEnc),
    container: server.container,
  };
}

// Servers that require TLS (e.g. Azure Database for MySQL) reject plain connections;
// servers with no TLS configured (e.g. local MySQL) reject an SSL handshake attempt.
// Try SSL first, then fall back to plaintext so both cases work without per-server config.
async function connect(conn: ConnParams): Promise<mysql.Connection> {
  const { container: _c, ...clean } = conn;
  try {
    return await mysql.createConnection({ ...clean, ssl: {} });
  } catch (err) {
    return mysql.createConnection(clean);
  }
}

// Run a MySQL query inside a container via `docker exec ... mysql -N -B -e ...`,
// used when the caller can't reach MySQL over the network (port not mapped).
async function dockerQuery(conn: ConnParams, sql: string): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", "-e", "MYSQL_PWD", conn.container!, "mysql",
        "-h", "127.0.0.1", "-u", conn.user, "-N", "-B", "-e", sql],
      { env: { ...process.env, MYSQL_PWD: conn.password } }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `docker exec mysql exited ${code}`));
      const rows = stdout
        .split("\n")
        .filter((l) => l.length > 0)
        .map((l) => l.split("\t"));
      resolve(rows);
    });
  });
}

export async function testConnection(conn: ConnParams): Promise<void> {
  if (conn.container) {
    await dockerQuery(conn, "SELECT 1");
    return;
  }
  const connection = await connect(conn);
  try {
    await connection.query("SELECT 1");
  } finally {
    await connection.end();
  }
}

export async function listDatabases(conn: ConnParams): Promise<string[]> {
  if (conn.container) {
    const rows = await dockerQuery(conn, "SHOW DATABASES");
    return rows.map((r) => r[0]).filter((n) => !SYSTEM_DBS.has(n));
  }
  const connection = await connect(conn);
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>("SHOW DATABASES");
    return rows
      .map((r) => r.Database as string)
      .filter((name) => !SYSTEM_DBS.has(name));
  } finally {
    await connection.end();
  }
}

export async function estimateDatabaseSize(conn: ConnParams, database: string): Promise<number> {
  const safeDb = database.replace(/'/g, "''");
  const sql = `SELECT IFNULL(SUM(data_length + index_length), 0) FROM information_schema.tables WHERE table_schema = '${safeDb}'`;
  if (conn.container) {
    const rows = await dockerQuery(conn, sql);
    return Number(rows[0]?.[0] ?? 0);
  }
  const connection = await connect(conn);
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT IFNULL(SUM(data_length + index_length), 0) AS size FROM information_schema.tables WHERE table_schema = ?",
      [database]
    );
    return Number(rows[0]?.size ?? 0);
  } finally {
    await connection.end();
  }
}

export async function createDatabaseIfMissing(conn: ConnParams, database: string): Promise<void> {
  const safe = database.replace(/`/g, "");
  const sql = `CREATE DATABASE IF NOT EXISTS \`${safe}\``;
  if (conn.container) {
    await dockerQuery(conn, sql);
    return;
  }
  const connection = await connect(conn);
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}
