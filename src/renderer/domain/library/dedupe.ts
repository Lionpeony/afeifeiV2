import type { TrackId } from "../../../contracts/index.js";
import type { Track } from "./schema.js";

/**
 * 去重建议（50 §6.1）。**只出建议，不自动删** —— 自动删用户的歌是不可原谅的错。
 *
 * 三档的取舍：
 *   - inode：Windows 上不可靠（NTFS 有 file index，但 Node 拿不到），放弃
 *   - size + duration：同一首歌的重复拷贝几乎必然命中，误判率极低
 *   - 同名 + 同 duration：不同目录下的同一首歌（常见于"我下载了两次"）
 */

export type DupLevel = "same-size-duration" | "same-name-duration";

export interface DupGroup {
  key: string;
  trackIds: TrackId[];
}

function groupBy(tracks: Track[], keyOf: (t: Track) => string | null): DupGroup[] {
  const buckets = new Map<string, TrackId[]>();
  for (const t of tracks) {
    const key = keyOf(t);
    if (!key) continue;
    const list = buckets.get(key);
    if (list) list.push(t.id);
    else buckets.set(key, [t.id]);
  }

  const out: DupGroup[] = [];
  for (const [key, ids] of buckets) {
    if (ids.length > 1) out.push({ key, trackIds: ids });
  }
  // 组大的排前面：先看 3 份重复，再看 2 份重复
  return out.sort((a, b) => b.trackIds.length - a.trackIds.length);
}

export function findDuplicates(tracks: Track[], level: DupLevel): DupGroup[] {
  if (level === "same-size-duration") {
    // 0 字节文件不算重复（那是读取失败的占位）
    return groupBy(tracks, (t) => (t.size > 0 && t.durationMs > 0 ? `${t.size}:${Math.round(t.durationMs / 1000)}` : null));
  }

  return groupBy(tracks, (t) => {
    if (t.durationMs <= 0) return null;
    const name = (t.path.split(/[\\/]/).pop() ?? "").toLowerCase();
    return name ? `${name}:${Math.round(t.durationMs / 1000)}` : null;
  });
}

/** 建议保留哪一个：路径最短的通常是"原件"，其余视为副本。 */
export function suggestKeep(group: DupGroup, byId: Map<TrackId, Track>): TrackId | null {
  let best: Track | null = null;
  for (const id of group.trackIds) {
    const t = byId.get(id);
    if (!t) continue;
    if (!best || t.path.length < best.path.length) best = t;
  }
  return best?.id ?? null;
}
