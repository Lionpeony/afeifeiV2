import type {
  LyricDoc,
  RemoteTrack,
  SearchResult,
  SourceProvider,
  Toplist,
} from "../../../../contracts/capability.js";
import type { LocalApiPort } from "../../../../contracts/ports.js";
import { parseLyrics, withTranslation } from "../../lyrics/index.js";

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

  /* yakult 的账号路由把歌曲放在顶层 `songs`；旧路由可能在 `data.songs`，两种都收 */
  function songsOf(body: unknown): Record<string, unknown>[] {
    const b = body as { songs?: unknown; data?: { songs?: unknown } } | null;
    const list = Array.isArray(b?.songs) ? b.songs : Array.isArray(b?.data?.songs) ? b.data.songs : [];
    return list.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null);
  }

  function tracksOf(body: unknown): RemoteTrack[] {
    return songsOf(body)
      .map(toTrack)
      .filter((t): t is RemoteTrack => t !== null);
  }

  /** 红心分页：每页 100，最多 2000 首（与 folia 同一上限，避免大账号一次拉爆）。 */
  async function likedAll(): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let page = 0; page < 20 && out.length < 2000; page += 1) {
      const body = await qq<{ songs?: unknown; more?: unknown }>("likedSongs", { offset: out.length, limit: 100 });
      const songs = songsOf(body);
      out.push(...songs);
      if (!body?.more || songs.length === 0) break;
    }
    return out;
  }

  interface QqSearchBody {
    code?: number;
    items?: Record<string, unknown>[];
    total?: number;
  }

  /* yakult 的 recommend 系路由是扁平结构：{ code: 200, groups } / { code: 200, songs, more }，
     与旧路由（getMusicPlay 的 { data: … }）不同 —— 别照着旧路由猜 */
  interface QqToplistsBody {
    code?: number;
    groups?: { toplists?: { id?: unknown; title?: unknown; total?: unknown; cover?: unknown }[] }[];
  }

  interface QqToplistBody {
    code?: number;
    songs?: Record<string, unknown>[];
    total?: unknown;
    more?: unknown;
  }

  interface QqUrlBody {
    data?: { playUrl?: Record<string, { url?: unknown }> };
  }

  const TOP_PREFIX = "top:";

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
      // canGetPlaylist 只被 playlistTracks（榜单下钻）消费：实现只认 top: 前缀
      // （榜单 id），普通 QQ 歌单没接 —— canListPlaylists 仍是 false，我的歌单页不出现 QQ
      canGetPlaylist: true,
      canListPlaylists: false,
      canGetRadio: false,
      canFavorite: false,
      // A-14：榜单匿名可读（yakult /recommend/toplists + /recommend/toplist）。
      // 榜单 id 加 top: 前缀走 getPlaylist 分流 —— 榜不是歌单，接口不同，但 UI 拿到的
      // 是不透明 id，契约不变
      canGetToplist: true,
    },

    traits: {
      requiresAuth: false, // 搜索与歌词匿名可用；只有播放地址要登录
      qualities: ["128k", "320k"],
    },

    /*
     * 账号级数据（2026-11-05 补）：与 folia 同一组后端路由。
     * 听歌历史：qq-music-api 3.3 没有这个路由，如实报「不支持」，不拿本地记录冒充平台数据。
     */
    account: {
      async dailySongs(): Promise<RemoteTrack[]> {
        return tracksOf(await qq("daily"));
      },
      async likedIds(): Promise<string[]> {
        return (await likedAll())
          .map((song) => (typeof song.mid === "string" ? song.mid : ""))
          .filter((mid) => mid.length > 0);
      },
      async likedSongs(): Promise<RemoteTrack[]> {
        return (await likedAll())
          .map(toTrack)
          .filter((t): t is RemoteTrack => t !== null);
      },
      async likedTotal(): Promise<number> {
        const body = await qq<{ total?: unknown }>("likedSongs", { offset: 0, limit: 1 });
        const total = Number(body?.total);
        return Number.isFinite(total) && total >= 0 ? total : 0;
      },
      async setLiked(songId: string, liked: boolean): Promise<void> {
        if (!/^[0-9A-Za-z]{6,20}$/.test(songId)) throw err("track-missing", "QQ 歌曲标识不合法");
        const info = await qq<Record<string, unknown>>("songInfo", { mid: songId });
        const data = (info as { data?: Record<string, unknown>; track_info?: Record<string, unknown> } | null) ?? null;
        const track = data?.track_info ?? data?.data ?? info;
        const id = Number((track as { id?: unknown } | null)?.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw err("invalid-response", "QQ 没给出这首歌的数字 id");
        const body = await qq<{ code?: number; data?: { liked?: boolean } }>("like", { mid: songId, id, liked });
        if (body?.code !== undefined && body.code !== 200) throw err("unknown", "QQ 红心没写成");
      },
      async listeningHistory(): Promise<RemoteTrack[]> {
        throw err("capability-missing", "QQ 音乐不提供听歌排行");
      },
      async personalFm(): Promise<RemoteTrack[]> {
        return tracksOf(await qq("guessYouLike"));
      },
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
      // QRC 逐字优先（main 直连 GetPlayLyricInfo + 3DES 解密，匿名可读）；
      // 上游 24001 = 无 QRC 权限，回落 yakult 包的 LRC 路由
      try {
        const qrc = await qq<{ qrc?: string; trans?: string }>("qrc", { songmid: sourceId });
        const text = (qrc?.qrc ?? "").trim();
        if (text) {
          const doc = parseLyrics(text, { trackId: sourceId, source: "qq" });
          const trans = (qrc?.trans ?? "").trim();
          return trans ? withTranslation(doc, trans, "zh") : doc;
        }
      } catch {
        // QRC 链路失败不致命：走 LRC 兜底
      }
      // yakult 包实测：{ response: { lyric: LRC 文本 } }（旧包是 { code: 0, lrc }）
      const body = await qq<{ response?: { lyric?: string } }>("lyric", { songmid: sourceId });
      const lrc = body?.response?.lyric?.trim();
      if (!lrc) throw err("track-missing", "这首歌没有歌词");
      return parseLyrics(lrc, { trackId: sourceId, source: "qq" });
    },

    async login(): Promise<void> {
      const profile = await qq<{ loggedIn: boolean }>("profile");
      if (!profile.loggedIn) throw err("auth-required", "尚未登录");
    },

    /**
     * 榜单清单（A-14）。yakult /recommend/toplists 按组给，摊平成一列给 UI；
     * id 加 top: 前缀——getPlaylist 靠它分流到榜单路由（榜不是歌单）。
     * 没有 total 的榜给 0（UI 显示"首"数只是参考，不参与判据）。
     */
    async listToplists(): Promise<Toplist[]> {
      const body = await qq<QqToplistsBody>("toplists");
      if (!body || body.code !== 200 || !Array.isArray(body.groups)) {
        throw err("network", "QQ 音乐榜单暂时不可用");
      }
      const out: Toplist[] = [];
      for (const group of body.groups) {
        for (const t of group.toplists ?? []) {
          const id = typeof t.id === "number" ? t.id : Number(t.id);
          if (!Number.isSafeInteger(id) || id <= 0) continue; // 没有 id 的榜下钻必 404，直接丢
          out.push({
            id: `${TOP_PREFIX}${id}`,
            name: typeof t.title === "string" && t.title ? t.title : "未命名榜单",
            count: Number.isSafeInteger(t.total) ? (t.total as number) : 0,
            coverUrl: typeof t.cover === "string" && t.cover ? t.cover : undefined,
          });
        }
      }
      return out;
    },

    /** 只认 top: 前缀（榜单下钻）；QQ 的普通歌单没接，别拿这个方法当歌单入口。 */
    async getPlaylist(listId: string, page = 0): Promise<SearchResult> {
      if (!listId.startsWith(TOP_PREFIX)) {
        throw err("capability-missing", "QQ 音乐的普通歌单暂不支持");
      }
      const id = listId.slice(TOP_PREFIX.length);
      const limit = 30;
      const body = await qq<QqToplistBody>("toplist", { id, offset: page * limit, limit });
      if (!body || body.code !== 200 || !Array.isArray(body.songs)) {
        throw err("network", "这个榜单暂时取不到曲目");
      }
      const items = body.songs.map(toTrack).filter((t): t is RemoteTrack => t !== null);
      const more = body.more === true;
      return { items, nextPage: more ? page + 1 : undefined };
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
      // yakult 包返回的已是完整地址（domain + purl）；非 http 的 url 是异常数据，不瞎拼旧前缀
      if (!/^https?:\/\//i.test(url)) throw err("unknown", "播放地址格式异常，请重试");
      return url;
    },
  };
}
