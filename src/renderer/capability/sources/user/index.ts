import type {
  LyricDoc,
  RemoteTrack,
  SearchResult,
  SourceProvider,
} from "../../../../contracts/capability.js";
import { parseLyrics } from "../../lyrics/index.js";

/**
 * 用户源（M5）：KV 里的代码经沙箱装载后，包成标准 SourceProvider。
 *
 * **能力来自 manifest（沙箱校验过的声明），不靠 try/catch 探测** —— 与内置源同一套契约。
 * 用户源的数据形状不可信：归一化时逐字段验证，坏字段回落默认，绝不抛原始结构给 UI。
 */
export interface StoredUserSource {
  id: string;
  name: string;
  code: string;
}

export interface UserManifest {
  id: string;
  name: string;
  capabilities: string[];
}

function err(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code }) as Error & { code: string };
}

function toTrack(s: unknown): RemoteTrack | null {
  if (!s || typeof s !== "object") return null;
  const r = s as Record<string, unknown>;
  const id = r.sourceId ?? r.id;
  if (typeof id !== "string" || !id) return null;
  const dur = Number(r.durationMs);
  return {
    sourceId: id,
    title: typeof r.title === "string" && r.title ? r.title : "未知曲目",
    artist: typeof r.artist === "string" && r.artist ? r.artist : "未知歌手",
    album: typeof r.album === "string" && r.album ? r.album : "未知专辑",
    durationMs: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 0,
    coverUrl: typeof r.coverUrl === "string" ? r.coverUrl : undefined,
  };
}

export function createUserProvider(
  manifest: UserManifest,
  call: (method: string, params: unknown) => Promise<unknown>,
): SourceProvider {
  const caps = (m: string): boolean => manifest.capabilities.includes(m);

  return {
    id: manifest.id,
    name: manifest.name,

    capabilities: {
      canSearch: caps("search"),
      canGetDetail: caps("getDetail"),
      canGetUrl: caps("getUrl"),
      canGetLyric: caps("getLyric"),
      canLogin: false,
      canGetAlbum: false,
      canGetArtist: false,
      canGetPlaylist: false,
      canGetRadio: false,
      canFavorite: false,
    },

    traits: { requiresAuth: false, qualities: ["128k"] },

    async search(keyword: string, page = 0): Promise<SearchResult> {
      const raw = (await call("search", { keyword, page })) as unknown;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { items?: unknown[] })?.items)
          ? (raw as { items: unknown[] }).items
          : [];
      return { items: list.map(toTrack).filter((t): t is RemoteTrack => t !== null) };
    },

    async getDetail(songId: string): Promise<RemoteTrack> {
      const t = toTrack(await call("getDetail", { songId }));
      if (!t) throw err("track-missing", "曲目不存在");
      return t;
    },

    async getUrl(songId: string): Promise<string> {
      const url = await call("getUrl", { songId });
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
        throw err("track-missing", "这个源没有给出可播放的地址");
      }
      return url;
    },

    async getLyric(songId: string): Promise<LyricDoc> {
      const text = await call("getLyric", { songId });
      if (typeof text !== "string" || !text.trim()) throw err("track-missing", "这首歌没有歌词");
      return parseLyrics(text);
    },
  };
}
