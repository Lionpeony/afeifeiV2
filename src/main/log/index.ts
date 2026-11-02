import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 3;

let dir = "";

export function initLog(dataDir: string): void {
  dir = path.join(dataDir, "logs");
  fs.mkdirSync(dir, { recursive: true });
}

const mainFile = (): string => path.join(dir, "app.log");

function rotate(): void {
  if (!dir) return;
  let size = 0;
  try {
    size = fs.statSync(mainFile()).size;
  } catch {
    return; // 还没有日志文件
  }
  if (size < MAX_BYTES) return;
  for (let i = KEEP - 1; i >= 1; i -= 1) {
    const from = path.join(dir, `app.${i}.log`);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(dir, `app.${i + 1}.log`));
  }
  fs.renameSync(mainFile(), path.join(dir, "app.1.log"));
}

function write(level: string, tag: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] [${tag}] ${args.map(String).join(" ")}\n`;
  process.stdout.write(line);
  if (!dir) return;
  try {
    rotate();
    fs.appendFileSync(mainFile(), line);
  } catch {
    // 日志写失败绝不影响主流程
  }
}

export const log = (tag: string, ...a: unknown[]): void => write("info", tag, a);
export const warn = (tag: string, ...a: unknown[]): void => write("warn", tag, a);
export const error = (tag: string, ...a: unknown[]): void => write("error", tag, a);
