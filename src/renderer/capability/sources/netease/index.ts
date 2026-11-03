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
 * 网易云音源。
 *
 * 走主进程内嵌的 NeteaseCloudMusicApi（weapi/eapi 加密通道），
 * 也就是 LX Music 与 Folia 都在用的那条路。**不碰** `music.163.com/api/*` 明文接口——
 * 那套按 IP 限流，多申请几次扫码 key 就返回 8821。
 *
 * 渲染层这里只认"方法名 + 参数"，加密、cookie 都在主进程一侧，不进渲染层。
 */

interface ApiError extends Error {
  code: string;
}

function err(code: string, message: string): ApiError {
  return Object.assign(new Error(message), { code }) as ApiError;
}

export function createNeteaseProvider(api: LocalApiPort): SourceProvider {
  const ncm = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
    api.call("netease", method, params) as Promise<T>;

  /* ---------- 数据归一化 ---------- */

  function pickArtists(song: Record<string, unknown>): string {
    const list = (song.ar ?? song.artists) as { name?: string }[] | undefined;
    const names = (list ?? []).map((a) => a?.name).filter((n): n is string => !!n);
    if (names.length === 0 && typeof song.artist === "string") names.push(song.artist);
    return names.join(" / ") || "未知歌手";
  }

  function pickAlbum(song: Record<string, unknown>): { name: string; cover?: string } {
    const al = (song.al ?? song.album ?? {}) as { name?: string; picUrl?: string };
    return { name: al.name ?? "未知专辑", cover: al.picUrl };
  }

  function pickDuration(song: Record<string, unknown>): number {
    const raw = Number(song.dt ?? song.duration ?? 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw > 3600 ? Math.round(raw) : Math.round(raw * 1000);
  }

  function toTrack(song: Record<string, unknown>): RemoteTrack | null {
    const id = song.id;
    if (id === undefined || id === null) return null;
    const album = pickAlbum(song);
    return {
      sourceId: String(id),
      title: typeof song.name === "string" && song.name ? song.name : "未知曲目",
      artist: pickArtists(song),
      album: album.name,
      durationMs: pickDuration(song),
      coverUrl: album.cover,
    };
  }

  /* ---------- 契约实现 ---------- */

  return {
    id: "netease",
    name: "网易云音乐",

    capabilities: {
      canSearch: true,
      canGetDetail: true,
      canGetUrl: true,
      canGetLyric: true,
      canLogin: true,
      canGetAlbum: false,
      canGetArtist: false,
      canGetPlaylist: true,
      canListPlaylists: true,
      canGetRadio: false,
      canFavorite: false,
      canGetToplist: true, // A-14：toplist 匿名可读，榜单页不要求登录
    },

    traits: {
      requiresAuth: false, // 搜索匿名可用
      qualities: ["128k", "320k"],
    },

    async search(keyword: string, page = 0): Promise<SearchResult> {
      const limit = 30;
      const body = await ncm<{ result?: { songs?: Record<string, unknown>[]; songCount?: number } }>("cloudsearch", {
        keywords: keyword,
        type: 1,
        limit,
        offset: page * limit,
      });

      const songs = body?.result?.songs ?? [];
      const items = songs.map(toTrack).filter((t): t is RemoteTrack => t !== null);
      const total = Number(body?.result?.songCount ?? 0);

      return { items, nextPage: (page + 1) * limit < total ? page + 1 : undefined };
    },

    async getDetail(sourceId: string): Promise<RemoteTrack> {
      const body = await ncm<{ songs?: Record<string, unknown>[] }>("song_detail", { ids: sourceId });
      const song = (body?.songs ?? [])[0];
      const track = song ? toTrack(song) : null;
      if (!track) throw err("track-missing", `歌曲不存在：${sourceId}`);
      return track;
    },

    async getUrl(sourceId: string, quality): Promise<string> {
      const body = await ncm<{ data?: { url?: string | null; code?: number; fee?: number }[] }>("song_url_v1", {
        id: sourceId,
        level: quality === "320k" ? "exhigh" : "standard",
      });

      const first = (body?.data ?? [])[0];
      if (!first?.url) {
        // 有地址就播；没有的话：未登录 / 需要会员 / 真无版权，三种要分开说
        const profile = await api.profile("netease").catch(() => ({ loggedIn: false }));
        if (!profile.loggedIn) throw err("auth-required", "需要登录后才能播放");
        throw err(first?.fee === 1 ? "quality-unavailable" : "track-missing", "这首歌暂时没有可播放的地址");
      }
      return first.url;
    },

    async listPlaylists() {
      // uid 从登录态取（login_status 的 profile.userId），不要求调用方传
      const st = await ncm<{ profile?: { userId?: number }; code?: number }>("login_status");
      const uid = st?.profile?.userId;
      if (!uid) throw err("auth-required", "先登录后才能看歌单");

      const body = await ncm<{ playlist?: Record<string, unknown>[] }>("user_playlist", {
        uid,
        limit: 100,
        offset: 0,
      });
      return (body?.playlist ?? [])
        .map((p) => {
          const id = p.id;
          if (id === undefined || id === null) return null;
          return {
            id: String(id),
            name: typeof p.name === "string" && p.name ? p.name : "未命名歌单",
            count: Number(p.trackCount ?? 0),
            coverUrl: typeof p.coverImgUrl === "string" ? p.coverImgUrl : undefined,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    },

    /**
     * 榜单列表（A-14）。网易云的 toplist 匿名可读，且返回的 id 就是"榜歌单 id"，
     * 所以下钻直接复用 getPlaylist——榜单不需要第二套取曲目的代码。
     */
    async listToplists(): Promise<Toplist[]> {
      const body = await ncm<{ list?: Record<string, unknown>[] }>("toplist");
      return (body?.list ?? [])
        .map((t): Toplist | null => {
          const id = t.id;
          if (id === undefined || id === null) return null;
          return {
            id: String(id),
            name: typeof t.name === "string" && t.name ? t.name : "未命名榜单",
            count: Number(t.trackCount ?? 0),
            coverUrl: typeof t.coverImgUrl === "string" ? t.coverImgUrl : undefined,
          };
        })
        .filter((t): t is Toplist => t !== null);
    },

    async getPlaylist(playlistId: string, page = 0) {
      const limit = 50;
      const body = await ncm<{ songs?: Record<string, unknown>[]; total?: number }>("playlist_track_all", {
        id: playlistId,
        limit,
        offset: page * limit,
      });
      const songs = body?.songs ?? [];
      const items = songs.map(toTrack).filter((t): t is RemoteTrack => t !== null);
      const total = Number(body?.total ?? 0);
      return { items, nextPage: (page + 1) * limit < total ? page + 1 : undefined };
    },

    async getLyric(sourceId: string): Promise<LyricDoc> {
      // lyric_new（eapi /api/song/lyric/v1）才有 yrc 逐字；老 lyric 接口的 klyric 已实测全空
      // 实测（2026-11-03）：花海/孤勇者/泡沫有 yrc；晴天/大鱼/漠河舞厅没有——按歌降级到行级
      const body = await ncm<{
        lrc?: { lyric?: string };
        tlyric?: { lyric?: string };
        yrc?: { lyric?: string };
        ytlrc?: { lyric?: string };
      }>("lyric_new", { id: sourceId, cp: false, tv: 1, lv: 1, rv: 1, kv: 0, yv: 1, ytv: 1, yrv: 0 });

      const pick = (node?: { lyric?: string }): string => (node?.lyric ?? "").trim();

      const yrc = pick(body?.yrc);
      const lrc = pick(body?.lrc);
      const translated = pick(body?.tlyric);

      const source = yrc || lrc || translated;
      if (!source) throw err("track-missing", "这首歌没有歌词");

      const doc = parseLyrics(source, { trackId: sourceId, source: "netease" });
      return translated ? withTranslation(doc, translated, "zh") : doc;
    },

    async login(): Promise<void> {
      const profile = await api.profile("netease");
      if (!profile.loggedIn) throw err("auth-required", "尚未登录");
    },
  };
}

/* ---------------- 扫码登录（不属于契约，UI 直接调） ---------------- */

export interface QrSession {
  key: string;
  /** 服务端直接画好的二维码 dataURL，不需要前端再引二维码库 */
  qrImage: string;
}

export async function startQrLogin(api: LocalApiPort): Promise<QrSession> {
  const keyBody = (await api.call("netease", "login_qr_key")) as { data?: { unikey?: string } };
  const key = keyBody?.data?.unikey;
  if (!key) throw err("network", "获取二维码失败");

  const qrBody = (await api.call("netease", "login_qr_create", { key, qrimg: true })) as {
    data?: { qrimg?: string };
  };
  const qrImage = qrBody?.data?.qrimg ?? "";
  if (!qrImage) throw err("network", "二维码生成失败");

  return { key, qrImage };
}

export interface QrPollResult {
  code: number;
  loggedIn: boolean;
  message: string;
}

const QR_MESSAGES: Record<number, string> = {
  800: "二维码已过期，请刷新",
  801: "等待扫码",
  802: "已扫码，请在手机上确认",
};

export async function pollQrLogin(api: LocalApiPort, key: string): Promise<QrPollResult> {
  const body = (await api.call("netease", "login_qr_check", { key })) as {
    code?: number;
    message?: string;
  };

  const code = Number(body?.code ?? 0);

  if (code === 803) {
    // 803 时响应里带 cookie，主进程已经落盘；这里再用账号接口确认一次
    const profile = await api.profile("netease");
    return profile.loggedIn
      ? { code, loggedIn: true, message: `登录成功${profile.nick ? `：${profile.nick}` : ""}` }
      : { code, loggedIn: false, message: "扫码成功但没拿到登录态，请重试" };
  }

  return { code, loggedIn: false, message: QR_MESSAGES[code] ?? `未知状态（code=${code}）` };
}
