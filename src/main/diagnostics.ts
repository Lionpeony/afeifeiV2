/**
 * 诊断包（P0 #4）：一个可直接贴到 issue 的文本包。
 *
 * 内容：版本/平台、非敏感设置快照、日志尾部、最近崩溃记录。
 * **明确不包含**：cookie、会话 token、账号凭据、曲库文件列表。日志与崩溃文本统一过
 * `redact()`，凭据形态与手机号先遮掉再落盘。纯文本单文件，不引第三方压缩依赖。
 */
import fs from "node:fs";
import path from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import { dataDir } from "./paths.js";
import { readKey } from "./fs/kv.js";
import { redact } from "./redact.js";

/** 只读这些设置键；不在名单里的（会话、cookie）永远不进包。 */
const SAFE_KEYS = ["active-source", "ui-zoom", "playback", "quality", "theme"];
const LOG_TAIL_BYTES = 120_000;
const CRASH_MAX = 3;
const CRASH_MAX_BYTES = 20_000;

function readTail(file: string, maxBytes: number): string {
  try {
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(file, "r");
    try {
      const length = stat.size - start;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      return buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

function crashSection(): string {
  const dir = path.join(dataDir(), "logs");
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => /^crash-\d+\.log$/.test(f))
      .sort()
      .slice(-CRASH_MAX);
  } catch {
    return "（没有日志目录）";
  }
  if (files.length === 0) return "（没有崩溃记录）";
  return files
    .map((f) => `--- ${f} ---\n${redact(readTail(path.join(dir, f), CRASH_MAX_BYTES)).trim()}`)
    .join("\n\n");
}

export async function buildDiagnostics(): Promise<string> {
  const settings: string[] = [];
  for (const key of SAFE_KEYS) {
    const raw = await readKey(key);
    if (raw !== null) settings.push(`${key}: ${redact(raw.trim())}`);
  }

  const header = [
    "Afeifei 诊断包",
    `生成时间: ${new Date().toISOString()}`,
    `版本: ${app.getVersion()}${app.isPackaged ? "" : "（dev）"}`,
    `平台: ${process.platform} ${process.arch} / Electron ${process.versions.electron} / Chrome ${process.versions.chrome}`,
    `locale: ${app.getLocale()}`,
  ].join("\n");

  const logs = readTail(path.join(dataDir(), "logs", "app.log"), LOG_TAIL_BYTES);

  return [
    header,
    "",
    "== 设置（非敏感白名单） ==",
    settings.length > 0 ? settings.join("\n") : "（没有可导出的设置项）",
    "",
    "== 最近日志（尾部，已遮罩凭据/手机号） ==",
    logs ? redact(logs).trim() : "（没有日志）",
    "",
    "== 崩溃记录（最近 3 条） ==",
    crashSection(),
    "",
    "说明: 本文件不包含 cookie、登录 token、账号凭据或本地文件列表。",
    "",
  ].join("\n");
}

/** 弹保存框并写文件；取消返回 null。 */
export async function saveDiagnostics(parent: BrowserWindow | null): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");
  const options = {
    defaultPath: `afeifei-diagnostics-${stamp}.txt`,
    filters: [{ name: "诊断包", extensions: ["txt"] }],
  };
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  await fs.promises.writeFile(result.filePath, await buildDiagnostics(), "utf8");
  return result.filePath;
}
