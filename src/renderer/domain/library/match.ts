import type { Track } from "./schema.js";

/**
 * 在线曲目 → 本地同曲匹配（P0 #3 降级播放链）。
 *
 * 判据只有三样：标题（必需）、歌手（双方都有时必需）、时长（双方都有时 ±3s）。
 * 文件标签与平台字段常有空格/标点/「A / B」差异，先归一化再比。
 * 纯函数，测试见 test/local-match.test.mjs。
 */

export interface MatchTarget {
  title: string;
  artist?: string;
  durationMs?: number;
}

export interface MatchOptions {
  /** 时长容差（毫秒），默认 3000。任一方没有时长时这条判据不参与。 */
  toleranceMs?: number;
}

const NOISE = /[\s\-—_·•.,，。!！?？'"“”‘’()（）[\]【】<>《》]/g;

export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(NOISE, "");
}

function artistParts(value: string): string[] {
  return value
    .split(/\s*[/、&,，;；]\s*/)
    .map(normalizeText)
    .filter((part) => part.length > 0 && part !== "未知歌手" && part !== "unknown");
}

/** 标题歌手时长都合上才返回；多个候选取时长最接近的。 */
export function findLocalMatch(tracks: Track[], target: MatchTarget, opts: MatchOptions = {}): Track | null {
  const title = normalizeText(target.title ?? "");
  if (!title) return null;
  const tolerance = Math.max(0, opts.toleranceMs ?? 3_000);
  const wantArtists = artistParts(target.artist ?? "");
  let best: { track: Track; score: number } | null = null;

  for (const track of tracks) {
    if (normalizeText(track.title) !== title) continue;
    let score = 10;

    if (wantArtists.length > 0) {
      const have = artistParts(track.artist);
      if (have.length > 0) {
        if (!wantArtists.some((a) => have.includes(a))) continue;
        score += 3;
      }
    }

    if (target.durationMs && track.durationMs) {
      const diff = Math.abs(target.durationMs - track.durationMs);
      if (diff > tolerance) continue;
      score += 2 * (1 - diff / tolerance);
    }

    if (!best || score > best.score) best = { track, score };
  }

  return best?.track ?? null;
}

/** 跨在线源远程曲目匹配（标题优先，歌手或时长辅助打分）。 */
export function findRemoteMatch<T extends { title: string; artist?: string; durationMs?: number }>(
  candidates: T[],
  target: MatchTarget,
  opts: MatchOptions = {}
): T | null {
  const title = normalizeText(target.title ?? "");
  if (!title) return null;
  const tolerance = Math.max(0, opts.toleranceMs ?? 6_000);
  const wantArtists = artistParts(target.artist ?? "");
  let best: { item: T; score: number } | null = null;

  for (const item of candidates) {
    const itemTitle = normalizeText(item.title);
    const exact = itemTitle === title;
    const partial = itemTitle.includes(title) || title.includes(itemTitle);
    if (!exact && !partial) continue;
    let score = exact ? 10 : 5;

    if (wantArtists.length > 0 && item.artist) {
      const have = artistParts(item.artist);
      if (have.length > 0) {
        if (!wantArtists.some((a) => have.includes(a))) continue;
        score += 3;
      }
    }

    if (target.durationMs && item.durationMs) {
      const diff = Math.abs(target.durationMs - item.durationMs);
      if (diff > tolerance) continue;
      score += 2 * (1 - diff / tolerance);
    }

    if (!best || score > best.score) best = { item, score };
  }

  return best?.item ?? null;
}
