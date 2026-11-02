import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../paths.js";

/**
 * 通用小文件存储：一个 key 一个 `data/<key>.json`。
 *
 * 为什么不让主进程知道里面是什么：收藏、歌单、历史将来还会加，
 * 每加一个就让宿主多认识一种数据结构，主进程迟早又会变成业务层（50 §2.1）。
 */

/** key 白名单：只允许小写字母开头的短标识符，杜绝 `../` 这类路径穿越。 */
const KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;

function fileOf(key: string): string | null {
  if (!KEY_RE.test(key)) return null;
  return path.join(dataDir(), `${key}.json`);
}

export async function readKey(key: string): Promise<string | null> {
  const file = fileOf(key);
  if (!file) return null;
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null; // 没有就是没有，不是错误
  }
}

/** 原子写：先 .tmp 再 rename，断电不会留下半个 JSON。 */
export async function writeKey(key: string, json: string): Promise<void> {
  const file = fileOf(key);
  if (!file) throw new Error(`非法的存储 key：${key}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, file);
}
