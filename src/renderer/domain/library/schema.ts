import type { TrackId } from "../../../contracts/index.js";

/**
 * 曲库的数据形状与版本迁移（50 §6.1 / §6.2）。
 *
 * `id` 是规范化路径的小写形式，`path` 保留原始大小写用于显示与播放。
 * Windows 大小写不敏感，所以身份判定必须走小写，否则 C:\A.mp3 与 c:\a.mp3 会变成两首歌。
 */

export const SCHEMA_VERSION = 1;

export interface Track {
  id: TrackId;
  /** 原始路径（显示、交给 media 端口时用它） */
  path: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  size: number;
  mtimeMs: number;
  hasCover: boolean;
  /** 上次扫描时这个文件已经不在了。条目保留（50 §16 M2），只是点播会失败。 */
  missing?: boolean;
}

export interface LibrarySnapshot {
  v: number;
  tracks: Track[];
  savedAt: number;
}

/** 反斜杠统一成正斜杠、压掉重复分隔符、小写。 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
}

export function trackIdOf(p: string): TrackId {
  return normalizePath(p);
}

export function fileNameOf(p: string): string {
  const parts = normalizePath(p).split("/");
  return parts[parts.length - 1] ?? p;
}

export function isEmptySnapshot(snap: LibrarySnapshot | null): boolean {
  return !snap || snap.tracks.length === 0;
}

function isTrack(x: unknown): x is Track {
  if (!x || typeof x !== "object") return false;
  const t = x as Partial<Track>;
  return (
    typeof t.id === "string" &&
    typeof t.path === "string" &&
    typeof t.title === "string" &&
    typeof t.size === "number" &&
    typeof t.mtimeMs === "number"
  );
}

/**
 * 迁移器。M2 只有 v1，所以这一版是"校验 + 空转"。
 *
 * 它现在就必须存在：等到哪天真加字段，没有迁移器意味着**用户整个曲库读不出来**，
 * 而那时才发现就晚了（50 §6.2）。
 */
export function migrate(raw: unknown): LibrarySnapshot | null {
  if (!raw || typeof raw !== "object") return null;

  const snap = raw as Partial<LibrarySnapshot>;
  switch (snap.v) {
    case 1: {
      if (!Array.isArray(snap.tracks)) return null;
      const tracks = snap.tracks.filter(isTrack);
      // 去重：同一个 id 出现两次会让虚拟列表错位
      const seen = new Set<TrackId>();
      const unique: Track[] = [];
      for (const t of tracks) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        unique.push(t);
      }
      return { v: SCHEMA_VERSION, tracks: unique, savedAt: snap.savedAt ?? 0 };
    }
    default:
      return null; // 版本比本代码新，或太老没有迁移路径 —— 当没存过，不要硬猜
  }
}

export function createSnapshot(tracks: Track[], savedAt = Date.now()): LibrarySnapshot {
  return { v: SCHEMA_VERSION, tracks, savedAt };
}
