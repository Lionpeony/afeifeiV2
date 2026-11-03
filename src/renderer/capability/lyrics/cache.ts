/**
 * 歌词本地缓存（A-03 判据「缓存到本地」）。
 *
 * 说明白一件事：**这里不解析、不改 doc**，只负责"同一首词第二次不再打网络"。
 * 纯函数 + 显式 now，node --test 可跑；落盘在 ui/bootstrap 的 KV（lyric-cache）。
 *
 * 为什么不缓存 quality:"none"：没有歌词的曲目缓存了会一次判死——
 * 上游补词、用户改源之后仍然读到空 doc，而重试成本本来就低。
 */
import type { LyricDoc } from "../../../contracts/lyric.js";

/** 一条缓存：doc 原样存 + 写入时刻（淘汰只按它还新不新）。 */
export interface LyricCacheEntry {
  doc: LyricDoc;
  at: number;
}

/** key → entry。key 由 source + id 拼，换源不会互相污染。 */
export type LyricCache = Record<string, LyricCacheEntry>;

/** 上限。一百多首歌词 JSON 约 1–2MB，够覆盖最近听的，又不至于让 KV 文件失控。 */
export const LYRIC_CACHE_LIMIT = 120;

/** 缓存键：来源 + 上游 id。两者都在 doc 里有，但拼 key 不需要 doc。 */
export function lyricCacheKey(sourceId: string, songId: string): string {
  return `${sourceId}:${songId}`;
}

/** 只有"真有歌词"的 doc 值得缓存（判据要求的是命中，不是记住失败）。 */
export function shouldCacheLyric(doc: LyricDoc | null | undefined): doc is LyricDoc {
  return !!doc && doc.quality !== "none" && Array.isArray(doc.lines) && doc.lines.length > 0;
}

function isDocLike(v: unknown): v is LyricDoc {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<LyricDoc>;
  return (
    typeof d.trackId === "string" &&
    typeof d.source === "string" &&
    Array.isArray(d.lines) &&
    Array.isArray(d.segments) &&
    typeof d.offsetMs === "number" &&
    typeof d.fetchedAt === "number"
  );
}

/** KV 读回 → 合法缓存。坏条目逐条丢，不整体作废（一条烂数据不该清空用户缓存）。 */
export function parseLyricCache(raw: unknown): LyricCache {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: LyricCache = {};
  for (const [key, entry] of Object.entries(data as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { doc?: unknown; at?: unknown };
    if (!isDocLike(e.doc)) continue;
    if (typeof e.at !== "number" || !Number.isFinite(e.at)) continue;
    out[key] = { doc: e.doc, at: e.at };
  }
  return out;
}

/** 命中返回 doc；key 不存在返回 null（不用 undefined：调用方要能一脚判掉）。 */
export function getCachedLyric(cache: LyricCache, key: string): LyricDoc | null {
  return cache[key]?.doc ?? null;
}

/**
 * 写入并淘汰：超限时按 `at` 从旧到新删。
 * 返回**新对象**（旧对象不动），调用方把它替换掉即可。
 */
export function putCachedLyric(
  cache: LyricCache,
  key: string,
  doc: LyricDoc,
  now: number,
  limit = LYRIC_CACHE_LIMIT,
): LyricCache {
  if (!shouldCacheLyric(doc)) return cache;
  const next: LyricCache = { ...cache, [key]: { doc, at: now } };
  const keys = Object.keys(next);
  if (keys.length <= limit) return next;
  keys
    .sort((a, b) => next[a].at - next[b].at)
    .slice(0, keys.length - Math.max(1, limit))
    .forEach((k) => delete next[k]);
  return next;
}

/** 落盘用。键序按 at 升序，文件 diff 稳定，人眼看也像"最近听的"。 */
export function serializeLyricCache(cache: LyricCache): string {
  const ordered: LyricCache = {};
  for (const key of Object.keys(cache).sort((a, b) => cache[a].at - cache[b].at)) {
    ordered[key] = cache[key];
  }
  return JSON.stringify(ordered);
}
