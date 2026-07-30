import mysql from "mysql2/promise";
import { ServerProfile } from "../config/types";
import { decryptPassword } from "../config/crypto";

const SYSTEM_DBS = new Set(["information_schema", "performance_schema", "mysql", "sys"]);

export interface ConnParams {
  host: string;
  port: number;
  user: string;
  password: string;
}

export function serverToConnParams(server: ServerProfile): ConnParams {
  return {
    host: server.host,
    port: server.port,
    user: server.user,
    password: decryptPassword(server.passwordEnc),
  };
}

// Servers that require TLS (e.g. Azure Database for MySQL) reject plain connections;
// servers with no TLS configured (e.g. local MySQL) reject an SSL handshake attempt.
// Try SSL first, then fall back to plaintext so both cases work without per-server config.
async function connect(conn: ConnParams): Promise<mysql.Connection> {
  try {
    return await mysql.createConnection({ ...conn, ssl: {} });
  } catch (err) {
    return mysql.createConnection(conn);
  }
}

export async function testConnection(conn: ConnParams): Promise<void> {
  const connection = await connect(conn);
  try {
    await connection.query("SELECT 1");
  } finally {
    await connection.end();
  }
}

export async function listDatabases(conn: ConnParams): Promise<string[]> {
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
  const connection = await connect(conn);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, "")}\``);
  } finally {
    await connection.end();
  }
}
