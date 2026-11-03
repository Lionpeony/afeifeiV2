/**
 * 网易云 SourceAdapter（21 §三 SourceAdapter 的第一个实现）。
 *
 * 实测结论（2026-11-03，scripts/probe-netease.ts）：
 *   · 搜索 `api/search/get`：**可用**，能正确命中《老人と海 / ヨルシカ》
 *   · 行级歌词 `api/song/lyric?lv=1`：**可用**（含 tlyric 翻译）
 *   · 逐字 `klyric`：**公开接口拿不到**（20 首全部为空）——需要登录 cookie 或 weapi 签名
 *     ⇒ 逐字的路径是「网易云登录」，与 A-08 的登录实现是同一件事。
 */
import type { Work, Offering, SourceId } from "./types";
import type { HttpPort } from "../../../contracts/ports";

const API = "https://music.163.com";
const HEADERS = {
  Referer: `${API}/`,
  Accept: "application/json, text/plain, */*",
};

export interface NeteaseSong {
  id: number;
  name: string;
  artists?: { id: number; name: string }[];
  album?: { id: number; name: string };
  duration?: number;
}

export interface NeteaseLyric {
  lrc?: { lyric?: string };
  tlyric?: { lyric?: string };
  klyric?: { lyric?: string };
}

/** 搜歌。返回的是**平台条目**，还不是 Work（要经聚合才成 Work）。 */
export async function searchNetease(
  http: Pick<HttpPort, "fetchJson">,
  query: string,
  limit = 10,
): Promise<NeteaseSong[]> {
  const url = `${API}/api/search/get?s=${encodeURIComponent(query)}&type=1&limit=${limit}&offset=0`;
  const res = await http.fetchJson(url, { headers: HEADERS });
  if (res.status !== 200 || !res.json) return [];
  const songs = (res.json as { result?: { songs?: NeteaseSong[] } }).result?.songs ?? [];
  return songs;
}

/** 取歌词。行级 lrc 一定有；逐字 klyric 需要登录态（拿不到就返回空）。 */
export async function fetchNeteaseLyric(
  http: Pick<HttpPort, "fetchJson">,
  songId: number,
): Promise<{ lrc: string; translated: string; karaoke: string }> {
  const url = `${API}/api/song/lyric?os=pc&id=${songId}&lv=1&kv=1&tv=-1`;
  const res = await http.fetchJson(url, { headers: HEADERS });
  const j = (res.json ?? {}) as NeteaseLyric;
  return {
    lrc: j.lrc?.lyric ?? "",
    translated: j.tlyric?.lyric ?? "",
    karaoke: j.klyric?.lyric ?? "",
  };
}

/** 平台条目 → Work（作品层的第一步：与平台无关的"一首歌"）。 */
export function toWork(song: NeteaseSong): Work {
  const artist = (song.artists ?? []).map((a) => a.name).join(", ");
  const album = song.album?.name ?? "";
  return {
    /* 稳定 id：平台 + 平台内 id。聚合层再算跨平台的归一 id。 */
    workId: `netease:${song.id}`,
    title: song.name,
    artist,
    album: album || undefined,
    durationMs: song.duration ?? 0,
  };
}

/** 平台条目 → Offering（这个平台上的一个可播放版本）。 */
export function toOffering(song: NeteaseSong): Offering {
  return {
    sourceId: "netease" as SourceId,
    songId: String(song.id),
    quality: "320k",       // 公开接口拿不到真实码率，先按 320k 记
    playable: true,
    durationMs: song.duration ?? 0,
  };
}
