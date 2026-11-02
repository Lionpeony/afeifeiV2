import type {
  LyricDoc,
  RemoteTrack,
  SearchResult,
  SourceProvider,
} from "../../../../contracts/capability.js";
import type { HttpPort } from "../../../../contracts/ports.js";
import { parseLyrics } from "../../lyrics/index.js";

/**
 * 网易云音源（50 §7.2 的第一个真实实现）。
 *
 * 全部走官方域名 music.163.com 的明文 `/api` 接口（GET 或 POST form），
 * 不用任何第三方中转，也不做 weapi/eapi 加密。接口清单来自旧仓库
 * `app/main/sources/netease.js` 的注释（已跑通），这里是重写而不是搬运。
 *
 * 登录态靠 Chromium session 里的 cookie：扫码成功后 Set-Cookie 自动生效，
 * 后续请求天然带着它 —— 所以下面每个请求都不需要手动拼 cookie。
 */

const HOST = "https://music.163.com";
const REFERER = "https://music.163.com/";
/** 网页版裸接口不带这两个基础 cookie 会 301/400 */
const BASE_COOKIES = { os: "pc", appver: "8.10.90" } as const;

interface ApiOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number>;
  form?: Record<string, string | number>;
}

function err(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export function createNeteaseProvider(http: HttpPort): SourceProvider {
  let baseCookiesReady = false;
  /** 登录态缓存：界面会反复取地址，每首都查一次账号接口不划算 */
  let loginCache: { at: number; loggedIn: boolean } = { at: 0, loggedIn: false };
  const LOGIN_TTL = 30 * 1000;

  async function ensureBaseCookies(): Promise<void> {
    if (baseCookiesReady) return;
    for (const [name, value] of Object.entries(BASE_COOKIES)) {
      await http.setCookie(HOST, name, value);
    }
    baseCookiesReady = true;
  }

  async function api(pathname: string, options: ApiOptions = {}): Promise<Record<string, unknown>> {
    await ensureBaseCookies();

    const url = new URL(HOST + pathname);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const result = await http.fetchJson(url.toString(), {
      method: options.method ?? "GET",
      form: options.form,
      headers: { referer: REFERER, origin: HOST },
    });

    const body = result.json;
    if (!body || typeof body !== "object") {
      throw err("network", `网易云返回非 JSON（HTTP ${result.status}）`);
    }

    const code = (body as { code?: number }).code;
    if (code === 301 || code === -460 || code === -462) throw err("auth-required", "需要登录");
    if (code === 401) throw err("auth-expired", "登录已过期");
    if (code === 404) throw err("track-missing", "资源不存在");

    return body as Record<string, unknown>;
  }

  async function isLoggedIn(): Promise<boolean> {
    if (Date.now() - loginCache.at < LOGIN_TTL) return loginCache.loggedIn;
    try {
      const body = await api("/api/nuser/account/get");
      const account = body.account as { id?: number } | null;
      loginCache = { at: Date.now(), loggedIn: !!account?.id };
    } catch {
      // 网络出错时不要谎报已登录（旧仓库在这踩过，界面会显示假用户名）
      loginCache = { at: Date.now(), loggedIn: false };
    }
    return loginCache.loggedIn;
  }

  /* ---------------- 数据归一化：老接口 artists/album/duration，新接口 ar/al/dt ---------------- */

  function pickArtists(song: Record<string, unknown>): string {
    const list = (song.ar ?? song.artists) as { name?: string }[] | undefined;
    const names = (list ?? []).map((a) => a?.name).filter((n): n is string => !!n);
    if (names.length === 0 && typeof song.artist === "string") names.push(song.artist);
    return names.join(" / ") || "未知歌手";
  }

  function pickAlbum(song: Record<string, unknown>): { name: string; cover?: string } {
    const al = (song.al ?? song.album ?? {}) as { name?: string; picUrl?: string; blurPicUrl?: string };
    return { name: al.name ?? "未知专辑", cover: al.picUrl ?? al.blurPicUrl };
  }

  /** 网易云时长单位是毫秒；个别老接口给秒，这里兜底判断 */
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

  /* ---------------------------------- 契约实现 ---------------------------------- */

  const provider: SourceProvider = {
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
      canGetPlaylist: false,
      canGetRadio: false,
      canFavorite: false,
    },

    traits: {
      requiresAuth: false, // 搜索与部分播放地址匿名可用
      qualities: ["128k", "320k"], // flac 需要会员，先不声明
    },

    async search(keyword: string, page = 0): Promise<SearchResult> {
      const limit = 30;
      const body = await api("/api/cloudsearch/pc", {
        method: "POST",
        form: {
          s: keyword,
          type: 1,
          limit,
          offset: page * limit,
        },
      });

      const result = (body.result ?? {}) as { songs?: Record<string, unknown>[]; songCount?: number };
      const songs = result.songs ?? [];
      const items = songs.map(toTrack).filter((t): t is RemoteTrack => t !== null);
      const total = Number(result.songCount ?? 0);

      return {
        items,
        nextPage: (page + 1) * limit < total ? page + 1 : undefined,
      };
    },

    async getDetail(sourceId: string): Promise<RemoteTrack> {
      const body = await api("/api/v3/song/detail", {
        method: "POST",
        form: { c: JSON.stringify([{ id: Number(sourceId) }]) },
      });
      const songs = (body.songs ?? []) as Record<string, unknown>[];
      const track = songs.length > 0 ? toTrack(songs[0]) : null;
      if (!track) throw err("track-missing", `歌曲不存在：${sourceId}`);
      return track;
    },

    async getUrl(sourceId: string, quality): Promise<string> {
      const level = quality === "320k" ? "exhigh" : "standard";
      const body = await api("/api/song/enhance/player/url/v1", {
        query: {
          ids: JSON.stringify([Number(sourceId)]),
          level,
          encodeType: "mp3",
        },
      });

      const data = (body.data ?? []) as { url?: string | null; code?: number; fee?: number }[];
      const first = data[0];
      if (!first?.url) {
        // 没地址有三种原因，别混成一句"没有版权"：
        //   未登录（网易云对匿名用户基本不给地址，码常是 -110）
        //   需要会员 / 音质不可用
        //   真的无版权
        const loggedIn = await isLoggedIn();
        if (!loggedIn) throw err("auth-required", "需要登录后才能播放");
        throw err(first?.fee === 1 ? "quality-unavailable" : "track-missing", "这首歌暂时没有可播放的地址");
      }
      return first.url;
    },

    async getLyric(sourceId: string): Promise<LyricDoc> {
      const body = await api("/api/song/lyric", {
        query: { id: sourceId, lv: -1, tv: -1, kv: -1, rv: -1, yv: -1 },
      });

      const pick = (key: string): string => {
        const node = body[key] as { lyric?: string } | undefined;
        return (node?.lyric ?? "").trim();
      };

      // 优先级：YRC（逐字最准）> QRC > LRC；纯文本兜底
      const yrc = pick("yrc");
      const qrc = pick("klyric");
      const lrc = pick("lrc");
      const translated = pick("tlyric");

      const source = yrc || qrc || lrc || translated;
      if (!source) throw err("track-missing", "这首歌没有歌词");

      const doc = parseLyrics(source);

      // 翻译层单独解析，挂到 docs 上（渲染器按需取）
      if (translated) {
        const zh = parseLyrics(translated);
        const result: LyricDoc = { ...doc, translations: [{ lang: "zh", lines: zh.lines }] };
        return result;
      }
      return doc;
    },

    async login(): Promise<void> {
      // 扫码流程由 UI 编排（要展示二维码、轮询），这里只做登录态确认
      loginCache = { at: 0, loggedIn: false }; // 强制重新查一次
      if (!(await isLoggedIn())) throw err("auth-required", "尚未登录");
    },
  };

  return provider;
}

/** 扫码登录的工具（不属于 SourceProvider 契约，UI 直接调）。 */
export interface QrLoginSession {
  key: string;
  qrImage: string;
}

export async function startQrLogin(http: HttpPort): Promise<QrLoginSession> {
  const result = await http.fetchJson(`${HOST}/api/login/qrcode/unikey`, {
    method: "POST",
    form: { type: 1 },
    headers: { referer: REFERER },
  });
  const key = (result.json as { unikey?: string } | null)?.unikey;
  if (!key) throw err("network", "获取二维码失败");

  const qrImage = await http.qrDataUrl(`https://music.163.com/login?codekey=${key}`);
  return { key, qrImage };
}

export interface QrPollResult {
  code: number | string;
  loggedIn: boolean;
  message: string;
}

export interface LoginProfile {
  loggedIn: boolean;
  nick: string | null;
  uid: string | null;
}

/** 当前登录态。网络出错时**不谎报已登录**（旧仓库在这踩过，界面上会显示假的用户名）。 */
export async function checkLogin(http: HttpPort): Promise<LoginProfile> {
  try {
    const result = await http.fetchJson(`${HOST}/api/nuser/account/get`, { headers: { referer: REFERER } });
    const body = result.json as { account?: { id?: number }; profile?: { nickname?: string } } | null;
    const uid = body?.account?.id;
    return uid
      ? { loggedIn: true, nick: body?.profile?.nickname ?? null, uid: String(uid) }
      : { loggedIn: false, nick: null, uid: null };
  } catch {
    return { loggedIn: false, nick: null, uid: null };
  }
}

/** 轮询扫码结果：800 过期 / 801 待扫 / 802 待确认 / 803 成功。 */
export async function pollQrLogin(http: HttpPort, key: string): Promise<QrPollResult> {
  const result = await http.fetchJson(
    `${HOST}/api/login/qrcode/client/login?key=${encodeURIComponent(key)}&type=1`,
    { headers: { referer: REFERER } },
  );

  const code = (result.json as { code?: number } | null)?.code ?? 0;
  if (code === 803) {
    // cookie 已经被 Chromium session 吸收，再用一次接口确认登录态
    const check = await http.fetchJson(`${HOST}/api/nuser/account/get`, { headers: { referer: REFERER } });
    const account = (check.json as { account?: { id?: number } } | null)?.account;
    return account?.id
      ? { code: 803, loggedIn: true, message: "登录成功" }
      : { code: 803, loggedIn: false, message: "扫码成功但没拿到登录态，请重试" };
  }

  const messages: Record<number, string> = {
    800: "二维码已过期，请刷新",
    801: "等待扫码",
    802: "已扫码，请在手机上确认",
  };
  return { code, loggedIn: false, message: messages[code] ?? "未知状态" };
}
