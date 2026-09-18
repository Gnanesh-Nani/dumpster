import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ConnParams } from "./mysql";
import { mysqldumpArgs, OnProgress, buildSpawn, dumpToFileJs, importFileJs, checkBinaryOnPath } from "./dump";
import { SpeedTracker } from "./speed";

// child.kill() throws EINVAL on Windows if the process handle is already
// gone (e.g. it exited right before the call), so swallow that race.
function safeKill(child: ChildProcess) {
  try {
    child.kill();
  } catch {
    // process already exited/handle invalid; nothing to do
  }
}

export async function cloneDatabase(
  sourceConn: ConnParams,
  sourceDb: string,
  targetConn: ConnParams,
  targetDb: string,
  estimatedSize: number,
  onProgress?: OnProgress
): Promise<void> {
  // The target is always the local machine (this tool only clones remote ->
  // local), so if it has no `mysql` CLI on PATH (e.g. Workbench-only
  // installs, which don't add the CLI to PATH), fall back to a JS-only path
  // for both sides rather than failing with ENOENT on the import.
  const targetNeedsJsImport = !targetConn.container && !checkBinaryOnPath("mysql");
  if (sourceConn.dumpMethod === "js" || targetNeedsJsImport) {
    return cloneViaJsDump(sourceConn, sourceDb, targetConn, targetDb, onProgress);
  }
  return new Promise((resolve, reject) => {
    const dumpSpec = buildSpawn(sourceConn, "mysqldump", mysqldumpArgs(sourceConn, sourceDb));
    const dumpChild = spawn(dumpSpec.bin, dumpSpec.args, { env: dumpSpec.env });

    const importHost = targetConn.container ? "127.0.0.1" : targetConn.host;
    const importPort = targetConn.container ? 3306 : targetConn.port;
    const importSpec = buildSpawn(
      targetConn,
      "mysql",
      ["-h", importHost, "-P", String(importPort), "-u", targetConn.user, targetDb]
    );
    const importChild = spawn(importSpec.bin, importSpec.args, { env: importSpec.env });

    const speed = new SpeedTracker();
    speed.total = estimatedSize;

    let written = 0;
    let dumpStderr = "";
    let importStderr = "";

    dumpChild.stdout.on("data", (chunk: Buffer) => {
      written += chunk.length;
      const { speedLabel, etaLabel } = speed.update(written);
      const total = estimatedSize > 0 ? estimatedSize : written + 1;
      onProgress?.({ written: Math.min(written, total), total, speedLabel, etaLabel: estimatedSize > 0 ? etaLabel : "--:--" });
    });

    dumpChild.stderr.on("data", (chunk: Buffer) => {
      dumpStderr += chunk.toString();
    });
    importChild.stderr.on("data", (chunk: Buffer) => {
      importStderr += chunk.toString();
    });

    dumpChild.stdout.pipe(importChild.stdin);
    importChild.stdin.on("error", () => {});

    let dumpDone = false;
    let importDone = false;
    let dumpCode: number | null = null;
    let importCode: number | null = null;

    function finish() {
      if (!dumpDone || !importDone) return;
      const total = estimatedSize > 0 ? estimatedSize : written;
      onProgress?.({ written: total, total, speedLabel: "done", etaLabel: "00:00" });
      if (dumpCode !== 0 && dumpCode !== null) {
        reject(new Error(`mysqldump exited with code ${dumpCode}: ${dumpStderr}`));
      } else if (importCode !== 0) {
        reject(new Error(`mysql import exited with code ${importCode}: ${importStderr}`));
      } else {
        resolve();
      }
    }

    dumpChild.on("error", (err) => {
      safeKill(importChild);
      reject(err);
    });
    importChild.on("error", (err) => {
      safeKill(dumpChild);
      reject(err);
    });

    dumpChild.on("close", (code) => {
      dumpDone = true;
      dumpCode = code;
      finish();
    });
    importChild.on("close", (code) => {
      importDone = true;
      importCode = code;
      if (!dumpDone) {
        safeKill(dumpChild);
      }
      finish();
    });
  });
}

// Clone runs two connections against two different servers, so an error like
// a TLS failure is ambiguous on its own. Tag it with the stage and host it
// came from, keeping the original as `cause`.
function stageError(stage: string, host: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`${stage} (${host}): ${message}`, { cause: err });
}

// JS-fallback clone path: no mysqldump/docker binary available for the source
// connection, so dump to a temp file via the pure-JS dumper, then pipe that
// file into a `mysql` import (still requiring `mysql`/docker on the *target*
// side, same as before — only the source-side dump changes).
async function cloneViaJsDump(
  sourceConn: ConnParams,
  sourceDb: string,
  targetConn: ConnParams,
  targetDb: string,
  onProgress?: OnProgress
): Promise<void> {
  const tmpFile = path.join(os.tmpdir(), `dumpster_${sourceDb}_${process.pid}.sql`);
  try {
    try {
      await dumpToFileJs(sourceConn, sourceDb, tmpFile, onProgress);
    } catch (err) {
      throw stageError("source dump", sourceConn.host, err);
    }

    if (!targetConn.container && !checkBinaryOnPath("mysql")) {
      try {
        await importFileJs(targetConn, targetDb, tmpFile);
      } catch (err) {
        throw stageError("target import", targetConn.host, err);
      }
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const importHost = targetConn.container ? "127.0.0.1" : targetConn.host;
      const importPort = targetConn.container ? 3306 : targetConn.port;
      const importSpec = buildSpawn(
        targetConn,
        "mysql",
        ["-h", importHost, "-P", String(importPort), "-u", targetConn.user, targetDb]
      );
      const importChild = spawn(importSpec.bin, importSpec.args, { env: importSpec.env });
      let importStderr = "";
      importChild.stderr.on("data", (c: Buffer) => (importStderr += c.toString()));
      importChild.on("error", reject);
      importChild.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`mysql import exited with code ${code}: ${importStderr}`));
        } else {
          resolve();
        }
      });
      fs.createReadStream(tmpFile).pipe(importChild.stdin);
    });
  } finally {
    fs.unlink(tmpFile, () => {});
  }
}
