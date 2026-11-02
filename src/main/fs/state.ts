import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../paths.js";

/** 主进程只负责读写这个文件，不知道里面是什么（50 §2.1）。 */
const stateFile = (): string => path.join(dataDir(), "app-state.json");

export async function loadState(): Promise<string | null> {
  try {
    return await fs.readFile(stateFile(), "utf8");
  } catch {
    return null; // 首次启动没有文件，不是错误
  }
}

/** 原子写：先写 .tmp 再 rename。断电时不会留下半个 JSON。 */
export async function saveState(json: string): Promise<void> {
  const target = stateFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, target);
}
