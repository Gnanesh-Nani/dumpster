import { spawn } from "child_process";
import { ConnParams } from "./mysql";
import { mysqldumpArgs, OnProgress, buildSpawn } from "./dump";
import { SpeedTracker } from "./speed";

export async function cloneDatabase(
  sourceConn: ConnParams,
  sourceDb: string,
  targetConn: ConnParams,
  targetDb: string,
  estimatedSize: number,
  onProgress?: OnProgress
): Promise<void> {
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
      importChild.kill();
      reject(err);
    });
    importChild.on("error", (err) => {
      dumpChild.kill();
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
        dumpChild.kill();
      }
      finish();
    });
  });
}
