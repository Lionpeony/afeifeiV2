/**
 * LRCLIB 抓取（21 §二第 4 步）。
 * API：https://lrclib.net/api/search（免鉴权，要求礼貌的 User-Agent）。
 * 只做 HTTP 与挑选，解析复用 parse-lrc —— 网络层不认识歌词语义。
 */
import type { HttpPort } from "../../../contracts/ports";

const API = "https://lrclib.net/api/search";
const UA = "afeifei/0.1 (local music player)";

export interface LrclibHit {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  /** 秒（LRCLIB 用秒，我们用毫秒）。 */
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricQuery {
  trackName: string;
  artistName?: string;
  /** 目标时长（毫秒），用于挑最接近的版本。 */
  durationMs?: number;
  /** 自由文本（P0-19 手动搜索用的「歌名 歌手」）：有它就只发 `q`，让 LRCLIB 自己分词。 */
  q?: string;
}

export async function searchLrclib(
  http: Pick<HttpPort, "fetchJson">,
  query: LyricQuery,
): Promise<LrclibHit[]> {
  const params = new URLSearchParams();
  if (query.q) {
    params.set("q", query.q);
  } else {
    params.set("track_name", query.trackName);
    if (query.artistName) params.set("artist_name", query.artistName);
  }
  const res = await http.fetchJson(`${API}?${params.toString()}`, {
    headers: { "User-Agent": UA },
  });
  if (res.status !== 200 || !Array.isArray(res.json)) return [];
  return (res.json as LrclibHit[]).filter((h) => h && typeof h.trackName === "string");
}

/**
 * 挑最佳版本：**有同步歌词 > 时长最接近**。
 * 纯函数，选择过程可解释（20 B-03 的"为什么选它"同款纪律）。
 */
export function pickBest(hits: LrclibHit[], durationMs?: number): LrclibHit | null {
  const synced = hits.filter((h) => h.syncedLyrics && h.syncedLyrics.trim());
  const pool = synced.length ? synced : hits.filter((h) => h.plainLyrics);
  if (!pool.length) return null;
  if (!durationMs) return pool[0];
  const target = durationMs / 1000;
  return [...pool].sort(
    (a, b) => Math.abs(a.duration - target) - Math.abs(b.duration - target),
  )[0];
}

/** 拉歌词原文（synced 优先，退 plain）。失败返回 null，不抛错。 */
export async function fetchLyricText(
  http: Pick<HttpPort, "fetchJson">,
  query: LyricQuery,
): Promise<string | null> {
  try {
    const hits = await searchLrclib(http, query);
    const best = pickBest(hits, query.durationMs);
    if (!best) return null;
    return best.syncedLyrics ?? best.plainLyrics;
  } catch {
    return null;   // 网络失败不阻塞播放，回退"无歌词"态
  }
}
