/**
 * QQ 音乐通道（M6.1 P1）：全部走本地 `qqBackend` 服务的 HTTP 接口。
 *
 * 协议细节（扫码/登录态/vkey/签名）都在 `@yakult-green-tea/qq-music-api` 包内，
 * 这里只做「转发 + 数据归一化」。接口路径与参数为 2026-11-03 实测确认：
 *   - 搜索 `/search?keyword=&page=&limit=`（字段：mid/name/singer[]/album.mid|title）
 *   - 歌词 `/getLyric?songmid=`（`response.lyric` 为 LRC 文本）
 *   - 播放 `/getMusicPlay/:songmid`（未登录/无版权 → `data.playUrl[mid].url` 为空）
 *   - 扫码 `/login/qr/key` → `/login/qr/create?key=&channel=qq` → `/login/qr/check?key=`（801=未扫）
 */
import { fetchJson } from "./fetchJson.js";
import { qqApiUrl } from "./qqBackend.js";
import { readKey, writeKey } from "../fs/kv.js";

interface QqBody {
  code?: number;
  message?: string;
  data?: unknown;
  response?: unknown;
}

/* ---------- 会话 token（照抄 Folia 的模式） ----------
 * 包的登录路由按 `?cookie=` / header 里的 token 找会话，**不带 token 永远匿名**。
 * 扫码 803 时包会把 `qqmusic_session=<token>` 写进 Set-Cookie，存住、之后每次带上。
 * token 只是不透明的会话 id，不是 QQ 凭证本身；持久化到 KV，重启后登录态还在。 */
const TOKEN_KEY = "qq-session-token";
const SESSION_COOKIE_RE = /qqmusic_session=([^;]+)/;

let qqToken = "";
let tokenLoaded = false;
let tokenLoad: Promise<string> | null = null;

/**
 * KV 是异步的（fs/promises），这里必须 await。
 * **并发安全**：启动时首页与站尺会同时问登录态，共享同一个 Promise；
 * 首个调用置 tokenLoaded 前先 await，后来者若直接返回按旧实现会拿到空串，
 * 于是以匿名身份请求 /login/status —— 首页就显示成「未登录」。
 */
function loadToken(): Promise<string> {
  if (tokenLoaded) return Promise.resolve(qqToken);
  tokenLoad ??= readKey(TOKEN_KEY)
    .then((raw) => {
      if (!tokenLoaded) {
        qqToken = typeof raw === "string" ? raw : "";
        tokenLoaded = true;
      }
      return qqToken;
    })
    .catch(() => {
      tokenLoaded = true;
      return qqToken;
    })
    .finally(() => {
      tokenLoad = null;
    });
  return tokenLoad;
}

function saveToken(token: string): void {
  qqToken = token;
  tokenLoaded = true; // 抢先写入时，磁盘旧值不再覆盖
  void writeKey(TOKEN_KEY, token).catch(() => undefined); // 存不上只影响下次启动，不阻塞
}

/** 从 Set-Cookie 行数组或整串 cookie 里提取 token，有就存。 */
function harvestToken(sources: (string | undefined)[]): void {
  for (const s of sources) {
    if (!s) continue;
    const m = SESSION_COOKIE_RE.exec(s);
    if (m?.[1]) {
      saveToken(m[1]);
      return;
    }
  }
}

async function callApi<T = QqBody>(pathAndQuery: string): Promise<T> {
  const token = await loadToken();
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const session = token ? `${sep}cookie=${encodeURIComponent(`qqmusic_session=${token}`)}` : "";
  const { json } = await fetchJson(`${qqApiUrl()}${pathAndQuery}${session}`);
  return json as T;
}

/** 渲染层可见的接口面：与旧实现同名，底层换服务。 */
const ALLOWED = new Set([
  "search",
  "lyric",
  "url",
  "qrStart",
  "qrPoll",
  "status",
  "logout",
  "toplists", // A-14：榜单清单（/recommend/toplists，匿名可读）
  "toplist", // A-14：单榜曲目（/recommend/toplist，注意榜单不是歌单，接口不同）
  "daily", // 账号：每日推荐（/user/daily-songs，需登录）
  "likedSongs", // 账号：红心曲目分页（/user/liked-songs）
  "guessYouLike", // 账号：猜你喜欢（/user/guess-you-like，个人 FM 的替代）
  "songInfo", // 红心写入前取数字 songId（/getSongInfo/:songmid）
  "like", // 账号：红心写入（POST /user/song/like）
]);

export async function callQq(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (!ALLOWED.has(method)) throw new Error(`不允许调用 QQ 接口：${method}`);
  switch (method) {
    case "search":
      return qqSearch(params);
    case "lyric":
      return qqLyric(params);
    case "url":
      return qqUrl(params);
    case "qrStart":
      return qqQrStart(params);
    case "qrPoll":
      return qqQrPoll(params);
    case "status":
      return qqStatus();
    case "logout":
      saveToken(""); // 会话作废，本地 token 一并清掉
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      lastRefreshAt = 0;
      return callApi("/logout");
    case "toplists":
      return qqToplists();
    case "toplist":
      return qqToplist(params);
    case "daily":
      return qqDaily();
    case "likedSongs":
      return qqLikedSongs(params);
    case "guessYouLike":
      return qqGuessYouLike();
    case "songInfo":
      return qqSongInfo(params);
    case "like":
      return qqLike(params);
    default:
      throw new Error(`QQ 接口未实现：${method}`);
  }
}

/* ---------- 搜索 ---------- */

/*
 * fcg 搜索实测要 20–45s（真机数据），同一关键词反复打太遭罪。
 * 进程内缓存 5 分钟：相同 (keyword,page) 直接回上次结果。
 * 只缓存"成功"的响应 —— 失败不缓存，下次还得真打。
 */
const SEARCH_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<string, { at: number; body: unknown }>();

async function qqSearch(params: Record<string, unknown>): Promise<unknown> {
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const keyword = String(params.keyword ?? "").slice(0, 100);
  const key = `${keyword}\n${page}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.body;
  const body = await callApi(`/search?keyword=${encodeURIComponent(keyword)}&page=${page + 1}&limit=30`);
  searchCache.set(key, { at: Date.now(), body });
  if (searchCache.size > 50) {
    // 简单防涨：清掉最旧的一半。搜索缓存不值得 LRU 的精确性
    const keys = [...searchCache.keys()].slice(0, 25);
    for (const k of keys) searchCache.delete(k);
  }
  return body;
}

/* ---------- 榜单（A-14，匿名可读，2026-11-03 实测） ---------- */

/**
 * yakult 包实测：`/recommend/toplists` → { data: { groups: [{ id, name,
 * toplists: [{ id, title, period?, total?, cover?, preview }] }] } }；
 * `/recommend/toplist?id=&period=&offset=&limit=` → { data: { toplist, songs, total?, more? } }，
 * songs 保持上游原格式（mid/name/singer[]/album/interval，与搜索同构）。
 */
async function qqToplists(): Promise<unknown> {
  return callApi("/recommend/toplists");
}

async function qqToplist(params: Record<string, unknown>): Promise<unknown> {
  const id = String(params.id ?? "");
  if (!/^\d{1,12}$/.test(id)) throw new Error("非法榜单 id");
  // period 空串 = 最新一期；非空必须是上游认识的一期标识
  const period = typeof params.period === "string" ? params.period : "";
  if (!/^[A-Za-z0-9_]*$/.test(period)) throw new Error("非法榜单期号");
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);
  const limit = Math.min(100, Math.max(10, Number(params.limit ?? 30) || 30));
  const q = new URLSearchParams({ id, period, offset: String(offset), limit: String(limit) });
  return callApi(`/recommend/toplist?${q.toString()}`);
}

/* ---------- 歌词 ---------- */

async function qqLyric(params: Record<string, unknown>): Promise<unknown> {
  const songmid = String(params.songmid ?? "");
  if (!/^[0-9A-Za-z]{6,20}$/.test(songmid)) throw new Error("非法 songmid");
  return callApi(`/getLyric?songmid=${encodeURIComponent(songmid)}`);
}

/* ---------- 播放地址（登录态） ---------- */

interface QqPlayBody {
  code?: number;
  data?: { playUrl?: Record<string, { url?: unknown; error?: unknown }> };
}

async function qqUrl(params: Record<string, unknown>): Promise<unknown> {
  const songmid = String(params.songmid ?? "");
  if (!/^[0-9A-Za-z]{6,20}$/.test(songmid)) throw new Error("非法 songmid");
  return callApi<QqPlayBody>(`/getMusicPlay/${encodeURIComponent(songmid)}`);
}

/* ---------- 扫码登录（包内三件套，语义与网易云对齐） ---------- */

/** 扫码通道。默认 qqmusic：换凭证按扫码 App 实报的账号类型适配（Folia 同款一张码三种 App 都能扫）；
 *  qq 通道只会按手机 QQ 换凭证，别的 App 扫必被上游拒（50006）。
 *  **通道在 /login/qr/key 这一步定死**（包的 create 路由不读 channel），不传就是包默认 qq。 */
const QR_CHANNELS = new Set(["qq", "qqmusic", "wechat"]);
const DEFAULT_CHANNEL = "qqmusic";

async function qqQrStart(params: Record<string, unknown>): Promise<unknown> {
  const channel = typeof params.channel === "string" && QR_CHANNELS.has(params.channel) ? params.channel : DEFAULT_CHANNEL;
  // key 这一步要看状态码：上次登录失败后包有 15s 冷却，冷却内回 429 + retryAfterMs
  const keyRes = await fetchJson(`${qqApiUrl()}/login/qr/key?channel=${channel}`);
  if (keyRes.status === 429) {
    const waitSec = Math.ceil(Number((keyRes.json as { retryAfterMs?: number })?.retryAfterMs ?? 15_000) / 1000);
    throw new Error(`登录太频繁，约 ${waitSec} 秒后再点「刷新」`);
  }
  const keyBody = keyRes.json as { data?: { unikey?: string } };
  const key = keyBody?.data?.unikey;
  if (!key) throw new Error("获取二维码失败");
  // create 只认 key（实测确认 channel 参数被忽略），码画在 key 对应的会话上
  const create = await callApi<{ code?: number; data?: { qrimg?: string } }>(
    `/login/qr/create?key=${encodeURIComponent(key)}`,
  );
  const qrImage = create?.data?.qrimg ?? "";
  if (!qrImage) throw new Error("QQ 登录页没有给出二维码");
  return { key, qrImage };
}

async function qqQrPoll(params: Record<string, unknown>): Promise<unknown> {
  // key 是扫码会话的标识，check 必须带着——丢了永远 801（Waiting for QR scan）
  const key = String(params.key ?? "");
  if (!key) throw new Error("缺少扫码会话 key");
  // 原生 fetch：803 时包把 `qqmusic_session=<token>` 写进 Set-Cookie，fetchJson 不透出头
  const r = await fetch(`${qqApiUrl()}/login/qr/check?key=${encodeURIComponent(key)}`);
  const body = (await r.json()) as { code?: number; cookie?: string };
  const setCookies = r.headers.getSetCookie?.() ?? [];
  harvestToken([...setCookies, body?.cookie]);
  return body;
}

/* ---------- 登录态 ---------- */

/*
 * 会话续期（照 folia `qqSessionRefresh`）：stored 后端在同一个 token 下静默续期，
 * 但只在"离到期不到 6 小时、又正好有请求"时才续——不主动问，会话到期就被删，
 * 表现就是「登录过几次之后登录态自己丢了」。这里启动时问一次，之后每小时问一次。
 */
const REFRESH_MS = 60 * 60 * 1000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastRefreshAt = 0;

async function qqRefresh(): Promise<void> {
  const token = await loadToken();
  if (!token) return;
  // 路由是 POST（GET 回 405 Allow: POST）；带 token 让包把当前会话续在同一个 key 上
  const { json } = await fetchJson(
    `${qqApiUrl()}/login/refresh?cookie=${encodeURIComponent(`qqmusic_session=${token}`)}`,
    { method: "POST", timeoutMs: 20000 },
  );
  const data = (json as { data?: { rotated?: unknown; token?: unknown } } | null)?.data;
  const next = typeof data?.token === "string" ? data.token.trim() : "";
  if (data?.rotated === true && next && !/[;\s]/.test(next)) saveToken(next);
}

function keepSessionFresh(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    void qqRefresh().catch(() => undefined);
  }, REFRESH_MS);
  refreshTimer.unref?.();
}

async function qqStatus(): Promise<unknown> {
  const token = await loadToken();
  if (token) {
    keepSessionFresh();
    if (Date.now() - lastRefreshAt >= REFRESH_MS) {
      lastRefreshAt = Date.now();
      await qqRefresh().catch(() => undefined);
    }
  }
  return callApi("/login/status");
}

/* ---------- 账号级数据（每日 / 红心 / 猜你喜欢） ----------
 * 与 Folia 同一组后端路由（qq-music-api 3.3）：
 *   /user/daily-songs、/user/liked-songs、/user/guess-you-like、/user/song/like。
 * 听歌历史这个包没有提供路由——不做假数据，provider 那边如实报不支持。
 */

interface QqSongsBody {
  code?: number;
  songs?: Record<string, unknown>[];
  total?: unknown;
  more?: unknown;
}

async function qqDaily(): Promise<unknown> {
  return callApi<QqSongsBody>("/user/daily-songs");
}

async function qqLikedSongs(params: Record<string, unknown>): Promise<unknown> {
  const offset = Math.max(0, Math.floor(Number(params.offset ?? 0) || 0));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(params.limit ?? 100) || 100)));
  return callApi<QqSongsBody>(`/user/liked-songs?offset=${offset}&limit=${limit}`);
}

async function qqGuessYouLike(): Promise<unknown> {
  return callApi<QqSongsBody>("/user/guess-you-like");
}

/** 红心写入要「数字 songId + songmid + type:0」三件套；mid 拿不到数字 id 就不写。 */
async function qqSongInfo(params: Record<string, unknown>): Promise<unknown> {
  const mid = String(params.mid ?? "");
  if (!/^[0-9A-Za-z]{6,20}$/.test(mid)) throw new Error("非法 songmid");
  return callApi(`/getSongInfo/${encodeURIComponent(mid)}`);
}

async function qqLike(params: Record<string, unknown>): Promise<unknown> {
  const mid = String(params.mid ?? "");
  const id = Number(params.id);
  const liked = params.liked === true;
  if (!/^[0-9A-Za-z]{6,20}$/.test(mid)) throw new Error("非法 songmid");
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("QQ 红心缺数字 songId");
  const token = await loadToken();
  const sep = token ? `?cookie=${encodeURIComponent(`qqmusic_session=${token}`)}` : "";
  const { json } = await fetchJson(`${qqApiUrl()}/user/song/like${sep}`, {
    method: "POST",
    json: { song: { id, mid, type: 0 }, liked },
    timeoutMs: 20000,
  });
  return json;
}
