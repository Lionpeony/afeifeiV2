import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../paths.js";

/**
 * 索引文件的读写（快照 + 增量日志）。
 *
 * 主进程在这里**只做文件操作**：它不知道 JSON 里是什么、也不知道要合并什么，
 * 那都是环 1 的事（50 §2.1）。文件名用 library.* 只是习惯，别据此在宿主里做业务。
 */

const snapshotPath = (): string => path.join(dataDir(), "library.json");
const logPath = (): string => path.join(dataDir(), "library.log");

export async function loadIndex(): Promise<string | null> {
  try {
    return await fs.readFile(snapshotPath(), "utf8");
  } catch {
    return null;
  }
}

/** 原子写：先 .tmp 再 rename，断电不会留下半个 JSON。 */
export async function saveIndex(json: string): Promise<void> {
  const target = snapshotPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, target);
}

export async function appendIndexLog(lines: string): Promise<void> {
  if (!lines) return;
  const target = logPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, lines, "utf8");
}

export async function readIndexLog(): Promise<string> {
  try {
    return await fs.readFile(logPath(), "utf8");
  } catch {
    return "";
  }
}

export async function clearIndexLog(): Promise<void> {
  try {
    await fs.rm(logPath(), { force: true });
  } catch {
    /* 没有就算了 */
  }
}
