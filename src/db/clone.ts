import { spawn } from "child_process";
import cliProgress from "cli-progress";
import { ConnParams } from "./mysql";
import { mysqldumpArgs } from "./dump";
import { barFormat } from "../ui/theme";
import { SpeedTracker } from "./speed";

export async function cloneDatabase(
  sourceConn: ConnParams,
  sourceDb: string,
  targetConn: ConnParams,
  targetDb: string,
  estimatedSize: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dumpChild = spawn("mysqldump", mysqldumpArgs(sourceConn, sourceDb), {
      env: { ...process.env, MYSQL_PWD: sourceConn.password },
    });

    const importChild = spawn(
      "mysql",
      ["-h", targetConn.host, "-P", String(targetConn.port), "-u", targetConn.user, targetDb],
      { env: { ...process.env, MYSQL_PWD: targetConn.password } }
    );

    const bar = new cliProgress.SingleBar(
      {
        format: barFormat,
        hideCursor: true,
        barCompleteChar: "█",
        barIncompleteChar: "░",
      },
      cliProgress.Presets.shades_classic
    );
    bar.start(estimatedSize > 0 ? estimatedSize : 1, 0, { label: "cloning", speed: "-- MB/s", etaStr: "--:--" });
    const speed = new SpeedTracker();
    speed.total = estimatedSize;

    let written = 0;
    let dumpStderr = "";
    let importStderr = "";

    dumpChild.stdout.on("data", (chunk: Buffer) => {
      written += chunk.length;
      const { speedLabel, etaLabel } = speed.update(written);
      if (estimatedSize > 0) {
        bar.update(Math.min(written, estimatedSize), { label: "cloning", speed: speedLabel, etaStr: etaLabel });
      } else {
        bar.setTotal(written + 1);
        bar.update(written, { label: "cloning", speed: speedLabel, etaStr: "--:--" });
      }
    });

    dumpChild.stderr.on("data", (chunk: Buffer) => {
      dumpStderr += chunk.toString();
    });
    importChild.stderr.on("data", (chunk: Buffer) => {
      importStderr += chunk.toString();
    });

    dumpChild.stdout.pipe(importChild.stdin);
    // If the import side dies first, importChild.stdin closes and further writes
    // to it emit EPIPE — without a listener that crashes the process, and without
    // killing mysqldump it sits blocked on backpressure forever.
    importChild.stdin.on("error", () => {});

    let dumpDone = false;
    let importDone = false;
    let dumpCode: number | null = null;
    let importCode: number | null = null;

    function finish() {
      if (!dumpDone || !importDone) return;
      bar.update(estimatedSize > 0 ? estimatedSize : written);
      bar.stop();
      if (dumpCode !== 0 && dumpCode !== null) {
        reject(new Error(`mysqldump exited with code ${dumpCode}: ${dumpStderr}`));
      } else if (importCode !== 0) {
        reject(new Error(`mysql import exited with code ${importCode}: ${importStderr}`));
      } else {
        resolve();
      }
    }

    dumpChild.on("error", (err) => {
      bar.stop();
      importChild.kill();
      reject(err);
    });
    importChild.on("error", (err) => {
      bar.stop();
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
      // if import dies before dump finishes, dump has nowhere to write — kill it
      if (!dumpDone) {
        dumpChild.kill();
      }
      finish();
    });
  });
}
