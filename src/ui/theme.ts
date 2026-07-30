import chalk from "chalk";
import figlet from "figlet";
import gradient from "gradient-string";

const neon = gradient(["#00f5ff", "#ff00e6"]);

export function banner(): void {
  const text = figlet.textSync("DUMPSTER", { font: "ANSI Shadow" });
  console.log(neon.multiline(text));
  console.log(chalk.gray("  MySQL project · server · database cloner\n"));
}

export function divider(): void {
  console.log(chalk.dim("──────────────────────────────────────────"));
}

export function section(step: string, title: string): void {
  console.log();
  console.log(chalk.bgHex("#1a1a2e").hex("#00f5ff").bold(` ${step} `) + " " + chalk.bold.white(title));
  divider();
}

export function success(message: string): void {
  console.log(chalk.hex("#00ff9c")(`  ✓ ${message}`));
}

export function info(message: string): void {
  console.log(chalk.hex("#00f5ff")(`  › ${message}`));
}

export function warn(message: string): void {
  console.log(chalk.hex("#ffcc00")(`  ! ${message}`));
}

export function errorMsg(message: string): void {
  console.log(chalk.hex("#ff3b6b")(`  ✗ ${message}`));
}

export function dim(message: string): string {
  return chalk.dim(message);
}

// Erase the last `n` printed lines (used to make a finished prompt disappear
// right before we print its breadcrumb replacement).
export function clearLines(n: number): void {
  for (let i = 0; i < n; i++) {
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine(1);
  }
  process.stdout.cursorTo(0);
}

export function breadcrumb(label: string, value: string): void {
  console.log(chalk.hex("#00f5ff").bold(`  ${label}: `) + chalk.white(value));
}

export function summaryBox(lines: string[]): void {
  console.log();
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const top = "┌" + "─".repeat(width) + "┐";
  const bottom = "└" + "─".repeat(width) + "┘";
  console.log(chalk.hex("#00ff9c")(top));
  for (const line of lines) {
    console.log(chalk.hex("#00ff9c")("│") + "  " + chalk.white(line.padEnd(width - 2)) + chalk.hex("#00ff9c")("│"));
  }
  console.log(chalk.hex("#00ff9c")(bottom));
}

export const barFormat =
  chalk.hex("#00f5ff")("{bar}") +
  " " +
  chalk.bold("{percentage}%") +
  chalk.dim(" | {speed} | ETA {etaStr} | {label}");
