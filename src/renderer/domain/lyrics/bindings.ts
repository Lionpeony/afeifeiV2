/**
 * 手动换词绑定（P0-19）：用户从候选里挑了一版词，这首歌以后就用它。
 *
 * **存原文而不是存 LRCLIB id**：重放时要能离线出词，也不想为了"上次挑的那版"
 * 再打一次网络。一条词几 KB，上限 100 条约 300KB，换来的是"挑一次管一辈子"。
 *
 * 为什么不并进 `capability/lyrics/cache.ts`：缓存是**可以丢的**（超 120 条按新旧淘汰），
 * 绑定是**用户的决定**；绑定被缓存淘汰掉 = 用户白挑一次。
 */
export interface LyricBinding {
  /** 歌词原文（同步优先，退纯文本） */
  text: string;
  /** 绑定时刻，只用于超限淘汰 */
  at: number;
}

export type LyricBindings = Record<string, LyricBinding>;

/** 上限。手动换词是低频操作，100 条足够覆盖"真的在意的那几首"。 */
export const LYRIC_BINDING_LIMIT = 100;

/**
 * 绑定键。**必须区分线上与本地**：线上用 sourceId:songId（换直链不影响），
 * 本地用曲目 id（规范化路径）。同一个曲目在两条通路上不该互相串。
 */
export function lyricBindKey(
  remote: { sourceId: string; songId: string } | null | undefined,
  trackId: string | null | undefined,
): string | null {
  if (remote) return `online:${remote.sourceId}:${remote.songId}`;
  return trackId ? `local:${trackId}` : null;
}

/** KV 读回 → 合法绑定表。坏条目逐条丢，一条烂数据不该清掉用户所有选择。 */
export function parseLyricBindings(raw: string | null): LyricBindings {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: LyricBindings = {};
  for (const [key, entry] of Object.entries(data as Record<string, unknown>)) {
    if (!key || !entry || typeof entry !== "object") continue;
    const e = entry as { text?: unknown; at?: unknown };
    if (typeof e.text !== "string" || !e.text.trim()) continue;
    if (typeof e.at !== "number" || !Number.isFinite(e.at)) continue;
    out[key] = { text: e.text, at: e.at };
  }
  return out;
}

export function getLyricBinding(bindings: LyricBindings, key: string | null): string | null {
  if (!key) return null;
  return bindings[key]?.text ?? null;
}

/** 写入并淘汰：超限按 `at` 从旧到新删。返回新对象，旧对象不动。 */
export function putLyricBinding(
  bindings: LyricBindings,
  key: string,
  text: string,
  now: number,
  limit = LYRIC_BINDING_LIMIT,
): LyricBindings {
  if (!text.trim()) return bindings;
  const next: LyricBindings = { ...bindings, [key]: { text, at: now } };
  const keys = Object.keys(next);
  if (keys.length <= limit) return next;
  keys
    .sort((a, b) => next[a].at - next[b].at)
    .slice(0, keys.length - Math.max(1, limit))
    .forEach((k) => delete next[k]);
  return next;
}

/** 落盘用。键序按 at 升序，文件 diff 稳定。 */
export function serializeLyricBindings(bindings: LyricBindings): string {
  const ordered: LyricBindings = {};
  for (const key of Object.keys(bindings).sort((a, b) => bindings[a].at - bindings[b].at)) {
    ordered[key] = bindings[key];
  }
  return JSON.stringify(ordered);
}
