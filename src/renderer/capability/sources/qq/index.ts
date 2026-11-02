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
    const album = (s.album ?? {}) as { name?: unknown; mid?: unknown };
    const interval = Number(s.interval);
    return {
      sourceId: mid,
      title: typeof s.name === "string" && s.name ? s.name : "未知曲目",
      artist:
        singer
          .map((a) => a?.name)
          .filter((n): n is string => !!n)
          .join(" / ") || "未知歌手",
      album: typeof album.name === "string" && album.name ? album.name : "未知专辑",
      durationMs: Number.isFinite(interval) && interval > 0 ? Math.round(interval * 1000) : 0,
      coverUrl:
        typeof album.mid === "string" && album.mid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album.mid}.jpg`
          : undefined,
    };
  }

  interface QqSearchBody {
    req_1?: {
      code?: number;
      data?: { body?: { song?: { list?: Record<string, unknown>[]; totalNum?: number } } };
    };
  }

  interface QqUrlBody {
    req?: {
      code?: number;
      data?: { midurlinfo?: { purl?: unknown }[] };
    };
  }

  return {
    id: "qq",
    name: "QQ 音乐",

    capabilities: {
      canSearch: true,
      canGetDetail: false,
      canGetUrl: true, // 登录态走 GetEVkey（M6.1）；未登录时上游不给 vkey，错误翻译成人话
      canGetLyric: true,
      canLogin: true, // 真实窗口登录（main/net/qqSession.ts）
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
      const limit = 30;
      const body = await qq<QqSearchBody>("search", { keyword, page });

      const req = body?.req_1;
      if (!req || req.code !== 0) throw err("network", "QQ 音乐搜索暂时不可用");

      const song = req.data?.body?.song;
      const list = song?.list ?? [];
      const items = list.map(toTrack).filter((t): t is RemoteTrack => t !== null);
      const total = Number(song?.totalNum ?? 0);
      return { items, nextPage: (page + 1) * limit < total ? page + 1 : undefined };
    },

    async getLyric(sourceId: string): Promise<LyricDoc> {
      const body = await qq<{ code?: number; lrc?: string }>("lyric", { songmid: sourceId });
      if (!body || body.code !== 0 || !body.lrc?.trim()) {
        throw err("track-missing", "这首歌没有歌词");
      }
      return parseLyrics(body.lrc);
    },

    async login(): Promise<void> {
      const profile = await qq<{ loggedIn: boolean }>("profile");
      if (!profile.loggedIn) throw err("auth-required", "尚未登录");
    },

    async getUrl(sourceId: string): Promise<string> {
      const body = await qq<QqUrlBody>("url", { songmid: sourceId });
      const req = body?.req;
      if (!req || req.code !== 0) throw err("network", "QQ 音乐暂时不可用");
      const info = req.data?.midurlinfo?.[0];
      const purl = typeof info?.purl === "string" ? info.purl : "";
      if (!purl) {
        // 上游对"没登录"和"没版权"都返回空 purl —— 必须分开说（00 §10：错误只翻译一次）
        const profile = await qq<{ loggedIn: boolean }>("profile");
        if (!profile.loggedIn) throw err("auth-required", "请先登录 QQ 音乐");
        throw err("quality-unavailable", "这首歌没有可播放的地址（可能需要会员）");
      }
      return /^https?:\/\//i.test(purl) ? purl : `http://dl.stream.qqmusic.qq.com/${purl}`;
    },
  };
}
