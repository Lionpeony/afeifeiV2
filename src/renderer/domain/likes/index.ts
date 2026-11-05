import type { TrackId } from "../../../contracts/index.js";
import type { KeyValuePort } from "../../../contracts/ports.js";
import { normalizePath } from "../library/schema.js";

/**
 * 本机收藏（Ring 1）。一个 Set，一个写入口。
 * 收藏是"跟歌走"的数据：歌在不在磁盘上不影响它是不是被收藏过。
 *
 * id 一律按 normalizePath 归一：播放状态里存的是原始路径（盘符大小写 / 反斜杠），
 * 曲库 id 是小写正斜杠，两套直接比会让"刚点的红心"在喜欢页消失。
 */

const KEY = "likes";

let ids = new Set<TrackId>();
const listeners = new Set<() => void>();

export const getLikes = (): ReadonlySet<TrackId> => ids;
export const isLiked = (id: TrackId): boolean => ids.has(normalizePath(id));

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

/** 唯一写入口。返回切换后的状态。 */
export function toggleLike(id: TrackId): boolean {
  const key = normalizePath(id);
  if (ids.has(key)) ids.delete(key);
  else ids.add(key);
  notify();
  return ids.has(key);
}

export function setLikes(next: Iterable<TrackId>): void {
  ids = new Set([...next].map(normalizePath));
  notify();
}

export async function loadLikes(port: KeyValuePort): Promise<number> {
  const raw = await port.read(KEY);
  if (!raw) return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      setLikes(parsed.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    /* 坏文件当没收藏过，不要因此让应用起不来 */
  }
  return ids.size;
}

export async function saveLikes(port: KeyValuePort): Promise<void> {
  await port.write(KEY, JSON.stringify([...ids]));
}
