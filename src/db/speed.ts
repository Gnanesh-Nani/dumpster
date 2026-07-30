// Tracks a rolling throughput window to report a stable MB/s + ETA instead of
// a jumpy instantaneous rate that swings with each chunk.
export class SpeedTracker {
  private samples: { t: number; bytes: number }[] = [];
  private readonly windowMs = 4000;

  update(totalWritten: number): { speedLabel: string; etaLabel: string } {
    const now = Date.now();
    this.samples.push({ t: now, bytes: totalWritten });
    while (this.samples.length > 1 && now - this.samples[0].t > this.windowMs) {
      this.samples.shift();
    }

    const first = this.samples[0];
    const elapsedSec = (now - first.t) / 1000;
    const deltaBytes = totalWritten - first.bytes;
    const bytesPerSec = elapsedSec > 0.2 ? deltaBytes / elapsedSec : 0;

    const speedLabel = bytesPerSec > 0 ? `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s` : "-- MB/s";

    return { speedLabel, etaLabel: this.eta(totalWritten, bytesPerSec) };
  }

  private eta(written: number, bytesPerSec: number): string {
    if (bytesPerSec <= 0 || this.total <= 0) return "--:--";
    const remaining = Math.max(this.total - written, 0);
    const secs = Math.round(remaining / bytesPerSec);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  total = 0;
}
