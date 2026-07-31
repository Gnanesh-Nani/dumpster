export const COLORS = {
  accent: "cyan",
  chrome: "gray",
  ok: "green",
  err: "red",
  warn: "yellow",
  text: "white",
} as const;

export function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
