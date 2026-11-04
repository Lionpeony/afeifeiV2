import type { KeyValuePort } from "../../../contracts/ports.js";

/**
 * 「不喜欢 / 少推这首」（Ring 1）。
 *
 * 抄 lx `DislikeListModal` 的语义：本地一份名单，**过滤在取牌之前**，
 * 而不是抽到了再跳过——后者会让用户反复看到同一首不想要的歌。
 * 存的是曲目 key，不是歌名：改名后仍然认得出来。
 *
 * 在线源另外提供上报（网易云 `fm_trash` / `recommend_songs_dislike`），
 * 但上报失败**不回滚本地名单**：本地过滤照样生效，这是我们能兑现的那部分。
 */

const KEY = "dislikes";
const MAX = 500;

let ids = new Set<string>();
const listeners = new Set<() => void>();

/** 本地曲目用 trackId；在线曲目用 `源:曲目id`，避免两家源撞 id。 */
export const remoteDislikeKey = (sourceId: string, songId: string): string => `${sourceId}:${songId}`;

export const getDislikes = (): ReadonlySet<string> => ids;
export const hasDislike = (key: string): boolean => ids.has(key);

function notify(): void {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 加入；已在名单里返回 false（不重复通知、不重复写盘）。 */
export function addDislike(key: string): boolean {
  const clean = key.trim().slice(0, 200);
  if (!clean || ids.has(clean)) return false;
  if (ids.size >= MAX) {
    const oldest = ids.values().next().value;
    if (oldest) ids.delete(oldest);
  }
  ids.add(clean);
  notify();
  return true;
}

export function removeDislike(key: string): boolean {
  if (!ids.delete(key)) return false;
  notify();
  return true;
}

export function clearDislikes(): void {
  if (ids.size === 0) return;
  ids = new Set();
  notify();
}

/** KV 读回：只留非空字符串，坏条目丢弃。 */
export function parseDislikes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim().slice(0, 200))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export async function loadDislikes(port: KeyValuePort): Promise<number> {
  ids = new Set(parseDislikes(await port.read(KEY)));
  notify();
  return ids.size;
}

export async function saveDislikes(port: KeyValuePort): Promise<void> {
  await port.write(KEY, JSON.stringify([...ids]));
}
