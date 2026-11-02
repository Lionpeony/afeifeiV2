import type {
  LyricDoc,
  RemoteTrack,
  SearchResult,
  SourceProvider,
} from "../../../../contracts/capability.js";
import type { LocalApiPort } from "../../../../contracts/ports.js";
import { parseLyrics } from "../../lyrics/index.js";

/**
 * QQ 音乐音源。
 *
 * 能力按**实测事实**声明（2026-11-02，见 main/net/qqClient.ts）：
 * 搜索与歌词匿名可用；播放地址（vkey）匿名拿不到 —— canGetUrl 先声明 false，
 * 真号联调打通后再开。**声明为 false 的能力 UI 就不渲染对应控件**（50 §7.2），
 * 不是置灰，是不存在。
 */
interface ApiError extends Error {
  code: string;
}

function err(code: string, message: string): ApiError {
  return Object.assign(new Error(message), { code }) as ApiError;
}

export function createQqProvider(api: LocalApiPort): SourceProvider {
  const qq = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
    api.call("qq", method, params) as Promise<T>;

  /* ---------- 数据归一化 ---------- */

  function toTrack(s: Record<string, unknown>): RemoteTrack | null {
    const mid = s.mid;
    if (typeof mid !== "string" || !mid) return null;
    const singer = (s.singer ?? []) as { name?: string }[];
    // yakult 版搜索结果的专辑名在 album.title（匿名 musicu 直连时是 album.name），两者都收
    const album = (s.album ?? {}) as { name?: unknown; title?: unknown; mid?: unknown };
    const interval = Number(s.interval);
    return {
      sourceId: mid,
      title: typeof s.name === "string" && s.name ? s.name : "未知曲目",
      artist:
        singer
          .map((a) => a?.name)
          .filter((n): n is string => !!n)
          .join(" / ") || "未知歌手",
      album:
      ([album.title, album.name].find((v) => typeof v === "string" && v) as string | undefined) ??
      "未知专辑",
      durationMs: Number.isFinite(interval) && interval > 0 ? Math.round(interval * 1000) : 0,
      coverUrl:
        typeof album.mid === "string" && album.mid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album.mid}.jpg`
          : undefined,
    };
  }

  interface QqSearchBody {
    code?: number;
    items?: Record<string, unknown>[];
    total?: number;
  }

  interface QqUrlBody {
    data?: { playUrl?: Record<string, { url?: unknown }> };
  }

  return {
    id: "qq",
    name: "QQ 音乐",

    capabilities: {
      canSearch: true,
      canGetDetail: false,
      canGetUrl: true, // 登录态走 GetEVkey（M6.1）；未登录时上游不给 vkey，错误翻译成人话
      canGetLyric: true,
      canLogin: true, // 本地服务扫码登录（main/net/qqClient.ts）
      canGetAlbum: false,
      canGetArtist: false,
      canGetPlaylist: false,
      canGetRadio: false,
      canFavorite: false,
    },

    traits: {
      requiresAuth: false, // 搜索与歌词匿名可用；只有播放地址要登录
      qualities: ["128k", "320k"],
    },

    async search(keyword: string, page = 0): Promise<SearchResult> {
      const kw = keyword.trim();
      if (!kw) return { items: [], nextPage: undefined }; // 空关键词不打上游（会被 400）
      const limit = 30;
      // yakult 包实测（2026-11-03）：{ code: 200, items: [...], total }，字段 mid/name/singer[]/album.mid|title
      const body = await qq<QqSearchBody>("search", { keyword: kw, page });
      if (!body || body.code !== 200 || !Array.isArray(body.items)) {
        throw err("network", "QQ 音乐搜索暂时不可用");
      }
      const items = body.items.map(toTrack).filter((t): t is RemoteTrack => t !== null);
      const total = Number(body.total ?? 0);
      return { items, nextPage: (page + 1) * limit < total ? page + 1 : undefined };
    },

    async getLyric(sourceId: string): Promise<LyricDoc> {
      // yakult 包实测：{ response: { lyric: LRC 文本 } }（旧包是 { code: 0, lrc }）
      const body = await qq<{ response?: { lyric?: string } }>("lyric", { songmid: sourceId });
      const lrc = body?.response?.lyric?.trim();
      if (!lrc) throw err("track-missing", "这首歌没有歌词");
      return parseLyrics(lrc);
    },

    async login(): Promise<void> {
      const profile = await qq<{ loggedIn: boolean }>("profile");
      if (!profile.loggedIn) throw err("auth-required", "尚未登录");
    },

    async getUrl(sourceId: string): Promise<string> {
      const body = await qq<QqUrlBody>("url", { songmid: sourceId });
      const info = body?.data?.playUrl?.[sourceId];
      const url = typeof info?.url === "string" ? info.url : "";
      if (!url) {
        // 上游对"没登录"和"没版权"都返回空 url —— 必须分开说（00 §10：错误只翻译一次）
        const profile = await qq<{ loggedIn: boolean }>("profile");
        if (!profile.loggedIn) throw err("auth-required", "请先登录 QQ 音乐");
        throw err("quality-unavailable", "这首歌没有可播放的地址（可能需要会员）");
      }
      return /^https?:\/\//i.test(url) ? url : `http://dl.stream.qqmusic.qq.com/${url}`;
    },
  };
}
