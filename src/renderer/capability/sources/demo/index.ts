import type { LyricDoc, RemoteTrack, SearchResult, SourceProvider } from "../../../../contracts/capability.js";

/**
 * 示例音源：**走正式契约的假数据**，不联网。
 *
 * 它的用途不是"给用户听歌"，而是：
 *   1. 证明契约本身是能实现、能跑通的（否则 M3 的契约只是纸面）；
 *   2. 让 UI 在没有真号的情况下也能开发（50 §13 的假数据纪律）；
 *   3. 契约测试的靶子 —— 加第三家源时，同一套断言也会套在它身上。
 */

const TRACKS: RemoteTrack[] = [
  { sourceId: "demo-1", title: "示例曲目一", artist: "示例歌手", album: "示例专辑", durationMs: 214000 },
  { sourceId: "demo-2", title: "示例曲目二", artist: "示例歌手", album: "示例专辑", durationMs: 198000 },
  { sourceId: "demo-3", title: "另一首歌", artist: "另一个人", album: "别的专辑", durationMs: 240000 },
];

const LYRIC: LyricDoc = {
  format: "lrc",
  plain: "第一行示例歌词\n第二行示例歌词",
  lines: [
    { at: 0, dur: 4000, text: "第一行示例歌词" },
    { at: 4000, dur: 4000, text: "第二行示例歌词" },
  ],
  words: [],
  translations: [],
};

export const demoProvider: SourceProvider = {
  id: "demo",
  name: "示例音源",

  capabilities: {
    canSearch: true,
    canGetDetail: true,
    canGetUrl: true,
    canGetLyric: true,
    canLogin: false,
    canGetAlbum: false,
    canGetArtist: false,
    canGetPlaylist: true,
    canListPlaylists: true,
    canGetRadio: false,
    canFavorite: false,
  },

  traits: {
    requiresAuth: false,
    qualities: ["128k", "320k"],
  },

  async search(keyword: string, page = 0): Promise<SearchResult> {
    const k = keyword.trim().toLowerCase();
    const items = k ? TRACKS.filter((t) => t.title.toLowerCase().includes(k) || t.artist.toLowerCase().includes(k)) : TRACKS;
    const pageSize = 2;
    const start = page * pageSize;
    const slice = items.slice(start, start + pageSize);
    return { items: slice, nextPage: start + pageSize < items.length ? page + 1 : undefined };
  },

  async getDetail(sourceId: string): Promise<RemoteTrack> {
    const found = TRACKS.find((t) => t.sourceId === sourceId);
    if (!found) throw new Error("404 not found");
    return found;
  },

  async getUrl(sourceId: string, quality): Promise<string> {
    const found = TRACKS.some((t) => t.sourceId === sourceId);
    if (!found) throw new Error("404 not found");
    // 示例源不给真地址。错误必须**结构化带 code**，不要指望上层去猜 message
    throw Object.assign(new Error(`示例音源不提供 ${quality} 播放地址`), { code: "capability-missing" });
  },

  async getLyric(sourceId: string): Promise<LyricDoc> {
    const found = TRACKS.some((t) => t.sourceId === sourceId);
    if (!found) throw new Error("404 not found");
    return LYRIC;
  },

  // M9-5：demo 当"第三家源"，验证歌单页 UI 零改动（能力声明驱动，不写死任何一家）
  async listPlaylists() {
    return [{ id: "pl-1", name: "示例歌单", count: TRACKS.length }];
  },

  async getPlaylist(playlistId: string): Promise<SearchResult> {
    if (playlistId !== "pl-1") throw new Error("404 not found");
    return { items: TRACKS };
  },
};
