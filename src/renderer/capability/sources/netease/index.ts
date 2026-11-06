import type {
  LyricDoc,
  OnlinePlaylist,
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

/** song_detail 一次带多少个 id。实测 200 稳；再大 URL 会变长，eapi 那边也没必要。 */
const LIKED_BATCH = 200;

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

  /* ---------- 账号身份 ---------- */

  /** 红心 id 列表（likelist 必须带 uid）。likedIds 与 likedSongs 共用。 */
  async function likedIdList(): Promise<string[]> {
    const body = await ncm<{ ids?: (number | string)[] }>("likelist", { uid: await requireUid() });
    return (body?.ids ?? []).map((id) => String(id));
  }

  /**
   * uid 只从主进程的登录档案取。
   *
   * **不能用 `login_status`**：真实环境里它只回 `{ data }`，没有 `profile.userId`
   * （2026-11-04 真实账号实测：红心/听歌排行全报「先登录」，接口本身却是通的）。
   * `api.profile` 走 `user_account`，还顺带处理了「匿名账号 id 有值但不算登录」这个坑。
   */
  async function requireUid(): Promise<number> {
    const profile = await api.profile("netease");
    const uid = Number(profile.uid);
    if (!profile.loggedIn || !Number.isFinite(uid) || uid <= 0) {
      throw err("auth-required", "先登录后才能用这项");
    }
    return uid;
  }

  /**
   * 空列表分不清「今天真没有」和「没登录」——网易云未登录时多数接口返回空 + code 301。
   * 所以凡是可能空着返回的账号接口，空了就回头问一次登录态，把话说清楚。
   */
  async function requireLogin(): Promise<void> {
    const profile = await api.profile("netease").catch(() => ({ loggedIn: false }));
    if (!profile.loggedIn) throw err("auth-required", "先登录后才能用这项");
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
      const level = quality === "320k" ? "exhigh" : "standard";
      const pick = (body: unknown): { url?: string; fee?: number } => {
        const first = (body as { data?: { url?: string | null; fee?: number }[] } | null)?.data?.[0];
        return { url: first?.url ?? undefined, fee: first?.fee };
      };

      const ask = async (fn: string, params: Record<string, unknown>) =>
        pick(await ncm(fn, params).catch(() => null));

      // 实测（2026-11-06）：带登录 cookie 调 v1 会稳定触发网易云 -460「网络环境存在风险」，
      // 旧 song_url 同一凭证可取到地址；两者偶发空返回，重试一次即可恢复。
      let got = await ask("song_url", { id: sourceId, br: quality === "320k" ? 320000 : 128000 });
      if (!got.url) got = await ask("song_url_v1", { id: sourceId, level });
      if (!got.url) got = await ask("song_url", { id: sourceId, br: quality === "320k" ? 320000 : 128000 });
      // 最后一层：匿名取流。登录 cookie 被风控 -460 时，匿名请求往往还能拿到免费曲地址。
      if (!got.url) got = await ask("song_url_v1", { id: sourceId, level, cookie: "" });

      if (!got.url) {
        // 有地址就播；没有的话：未登录 / 需要会员 / 真无版权，三种要分开说
        const profile = await api.profile("netease").catch(() => ({ loggedIn: false }));
        if (!profile.loggedIn) throw err("auth-required", "需要登录后才能播放");
        if (got.fee === 1) throw err("quality-unavailable", "这首歌需要会员音质，已无法取到地址");
        throw err("track-missing", "网易云没有给出这首歌的地址，请稍后再试");
      }
      return got.url;
    },

    async listPlaylists() {
      // 同一个坑：login_status 里没有 profile.userId，统一走 requireUid
      const uid = await requireUid();

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

    /** 歌单头信息（M11 导入用）。id 不存在时上游给 code=404，统一报人话。 */
    async playlistMeta(playlistId: string): Promise<OnlinePlaylist> {
      const body = await ncm<{
        playlist?: { id?: number | string; name?: string; trackCount?: number; coverImgUrl?: string };
      }>("playlist_detail", { id: playlistId });
      const p = body?.playlist;
      if (!p) throw err("network", "这个歌单不存在，或作者已经删掉了");
      return {
        id: String(p.id ?? playlistId),
        name: typeof p.name === "string" && p.name ? p.name : "未命名歌单",
        count: Number(p.trackCount ?? 0),
        coverUrl: typeof p.coverImgUrl === "string" ? p.coverImgUrl : undefined,
      };
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

    /**
     * 账号级数据（R1 第一批，url 见 docs/22 §R1）。五件事都要求登录。
     * 没有做成 capabilities 里的 flag：它是一整包，扫描单个 flag 表达不了「五件事齐全」。
     */
    account: {
      async dailySongs(): Promise<RemoteTrack[]> {
        // v3 给 data.dailySongs；老版本给 recommend，两个都认
        const body = await ncm<{
          data?: { dailySongs?: Record<string, unknown>[] };
          recommend?: Record<string, unknown>[];
        }>("recommend_songs");
        const list = body?.data?.dailySongs ?? body?.recommend ?? [];
        if (list.length === 0) await requireLogin();
        return list.map(toTrack).filter((t): t is RemoteTrack => t !== null);
      },

      async likedIds(): Promise<string[]> {
        return likedIdList();
      },

      /** 红心详情：likelist 只给 id，列表页要标题/时长/封面，必须再发 song_detail。 */
      async likedSongs(): Promise<RemoteTrack[]> {
        const ids = await likedIdList();
        const out: RemoteTrack[] = [];
        // song_detail 一次吃一批 id（实测 200 个没问题）：500 首红心 = 3 次请求，不是 500 次
        for (let i = 0; i < ids.length; i += LIKED_BATCH) {
          const chunk = ids.slice(i, i + LIKED_BATCH);
          const body = await ncm<{ songs?: Record<string, unknown>[] }>("song_detail", { ids: chunk.join(",") });
          for (const song of body?.songs ?? []) {
            const track = toTrack(song);
            if (track) out.push(track);
          }
        }
        return out;
      },

      /**
       * 「我喜欢的音乐」歌单的 trackCount。只用来分辨「真空」和「读取失败」。
       * 走 user_playlist 一次拿全（specialType = 5 那个就是红心歌单），不额外打 playlist_detail。
       */
      async likedTotal(): Promise<number> {
        const body = await ncm<{ playlist?: { specialType?: number; trackCount?: number }[] }>("user_playlist", {
          uid: await requireUid(),
          limit: 1000,
          offset: 0,
        });
        const liked = (body?.playlist ?? []).find((p) => p?.specialType === 5);
        return Number(liked?.trackCount ?? 0);
      },

      async setLiked(songId: string, liked: boolean): Promise<void> {
        // like 接口认字符串 'false' 为取消（见 NeteaseCloudMusicApi/module/like.js）
        await ncm("like", { id: songId, like: liked ? "true" : "false" });
      },

      async listeningHistory(range: "week" | "all"): Promise<RemoteTrack[]> {
        const body = await ncm<{ weekData?: Record<string, unknown>[]; allData?: Record<string, unknown>[] }>(
          "user_record",
          { uid: await requireUid(), type: range === "week" ? 1 : 0 },
        );
        // 排行每行是 { playCount, score, song }，歌在 song 里
        const rows = (range === "week" ? body?.weekData : body?.allData) ?? [];
        return rows
          .map((row) => (row?.song ?? row) as Record<string, unknown>)
          .map(toTrack)
          .filter((t): t is RemoteTrack => t !== null);
      },

      async personalFm(): Promise<RemoteTrack[]> {
        const body = await ncm<{ data?: Record<string, unknown>[] }>("personal_fm");
        const list = body?.data ?? [];
        if (list.length === 0) await requireLogin();
        return list.map(toTrack).filter((t): t is RemoteTrack => t !== null);
      },

      /** 少推这首（B-11）：本地名单由 domain 管，这里只负责告诉上游。 */
      async dislike(songId: string, scene: "fm" | "daily"): Promise<void> {
        if (scene === "fm") await ncm("fm_trash", { id: songId });
        else await ncm("recommend_songs_dislike", { id: songId });
      },
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
