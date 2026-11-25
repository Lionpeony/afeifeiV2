import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "../paths.js";
import { log } from "../log/index.js";
import { FailureBackoff } from "./backoff.js";
import { DEFAULT_TIMEOUT } from "./fetchJson.js";
import { openSecret, sealSecret } from "../fs/secret.js";
import { safeCipher } from "../fs/safe.js";

/**
 * 网易云通道：直接用 NeteaseCloudMusicApi 的函数式接口。
 *
 * 为什么不用它的 HTTP 服务：那要多占一个端口、多一层 CORS、多一个进程要管。
 * 这个包把 300+ 个接口都导出成函数，主进程本来就在 Node 里，直接调最省事。
 *
 * 为什么不用官方 `music.163.com/api/*` 那条路：那是明文接口，按 IP 限流，
 * 多申请几次扫码 key 就开始返回 8821。这个包内部走 weapi/eapi 加密通道，
 * 也就是 LX Music 和 Folia 都在用的那条路。
 *
 * **cookie 由我们自己存**：这个库是无状态的，登录成功的 cookie 要从响应里取出来，
 * 之后每个请求都带上，并按用户目录持久化。
 */

type NcmFn = (params: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;

/**
 * **每次都换一个设备标识**（照抄 Folia 的做法）。
 *
 * 上游 `util/request.js` 用 `deviceId: cookie.deviceId || global.deviceId`，
 * 不设它就是 undefined —— 网易那边看来永远是同一台设备在反复撞，
 * 一旦被限流，失败状态会一直粘着，重启也不解。
 *
 * Folia 源码里的原话：
 *   「扫码请求被网易直接断开（连接被重置）后，同一设备标识和出口 IP 下继续扫码多半还是被断；
 *     用户反馈要重新联网（换出口 IP）或重启应用才恢复。」
 *
 * 所以这里在 require 之前就写好，让加载期和请求期都是这个值。
 */
const DEVICE_ID = randomUUID().replace(/-/g, "").toUpperCase();
(globalThis as Record<string, unknown>).deviceId = DEVICE_ID;

/**
 * **上游 4.32 的暗雷**：`util/request.js` 在**模块加载时**同步读
 * `os.tmpdir()/anonymous_token`，文件不存在就直接抛 ENOENT。require 期抛错意味着
 * 所有接口（扫码 key、榜单、搜索、播放地址）一起废掉，日志里只剩一行
 * `Error invoking remote method 'netease:call': ENOENT ... anonymous_token`。
 *
 * 系统清理临时目录、换机器、首次安装都会踩到。这里在任何人 require request.js
 * 之前补一个空占位——实测空文件即可正常走 weapi（MUSIC_A 只是未登录时的兜底 cookie）；
 * 文件已存在（真 token / 别的客户端生成）就绝不覆盖。
 */
function ensureAnonymousToken(): void {
  const file = path.join(os.tmpdir(), "anonymous_token");
  if (fs.existsSync(file)) return;
  try {
    fs.writeFileSync(file, "", "utf8");
  } catch (err) {
    log("warn", `[netease] 建匿名 token 占位失败：code=${(err as NodeJS.ErrnoException).code ?? "unknown"}`);
  }
}

ensureAnonymousToken();

/** 连续失败熔断（按接口名）。瞬时抖动不熔断，第 3 次起阶梯冷却。 */
const backoff = new FailureBackoff();

/**
 * 上游 `util/request.js` 的 axios **不设 timeout**（默认 0 = 永不超时），
 * 网络半死时请求会一直挂着，UI 永远等不到失败。这里与 fetchJson 用同一个超时值。
 * 只负责让调用方拿到失败；底层 socket 由 axios 自己收尾，不会泄漏我们的状态。
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

type NcmRequest = (...args: unknown[]) => Promise<unknown>;
type NcmRoute = (
  query: Record<string, unknown>,
  request: NcmRequest,
) => Promise<{ status: number; body: Record<string, unknown> }>;

/**
 * 按路由单独 require。整包 index 会把 300+ 个模块一次性载入（本机实测 3.6s），
 * 每次请求只载入自己那一个路由，request 链首次用到时才载入（约 1.7s）。
 * 冷启动不再为音源付钱，第一次联网请求的卡顿也从 3.6s 降到 1.7s（P0 #1）。
 */
let ncmRequest: NcmRequest | null = null;
let cookieToJson: ((cookie: string) => Record<string, unknown>) | null = null;
const routeCache = new Map<string, NcmFn>();

function ncmFn(method: string): NcmFn | null {
  const cached = routeCache.get(method);
  if (cached) return cached;
  if (!/^[a-z0-9_]+$/.test(method)) return null;
  let route: NcmRoute;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    route = require(`NeteaseCloudMusicApi/module/${method}.js`) as NcmRoute;
  } catch {
    return null; // 路由不存在：与整包 index 的行为一致（callNcm 报「接口不存在」）
  }
  if (!cookieToJson) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const util = require("NeteaseCloudMusicApi/util/index.js") as {
      cookieToJson(v: string): Record<string, unknown>;
    };
    cookieToJson = util.cookieToJson;
  }
  const fn: NcmFn = (data = {}) => {
    const cookie =
      typeof data.cookie === "string"
        ? cookieToJson!(data.cookie)
        : ((data.cookie as Record<string, unknown> | undefined) ?? {});
    return route({ ...data, cookie }, async (...args) => {
      if (!ncmRequest) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        ncmRequest = require("NeteaseCloudMusicApi/util/request.js") as NcmRequest;
      }
      return ncmRequest(...args);
    });
  };
  routeCache.set(method, fn);
  return fn;
}

export const currentDeviceId = (): string => DEVICE_ID;

const cookieFile = (): string => path.join(dataDir(), "netease-cookie.txt");

let cookie = "";
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = fs.readFileSync(cookieFile(), "utf8").trim();
    // 旧版本落下的是明文；新版本是 safeStorage 密文（P1-3）。解不开就当未登录。
    const plain = openSecret(raw, safeCipher) ?? "";
    // 只认带 MUSIC_U 的：早期版本把匿名 NMTID 也存下来了，那是脏凭证
    cookie = plain.includes("MUSIC_U") ? plain : "";
  } catch {
    cookie = "";
  }
}

function persist(next: string): void {
  cookie = next;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    // 密文落盘 + 原子替换：断电不会留下半个 cookie 文件（P1-3）
    const file = cookieFile();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, sealSecret(next, safeCipher), "utf8");
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
  } catch (err) {
    // 00 §10.2：凭据绝不入日志。fs 错误的 message 可能带路径，只打错误码
    log("warn", `[netease] 存 cookie 失败：code=${(err as NodeJS.ErrnoException).code ?? "unknown"}`);
  }
}

export interface NcmResult {
  status: number;
  body: Record<string, unknown>;
}

const COOKIE_ATTRS = /^(max-age|expires|path|domain|secure|httponly|samesite|version|comment)$/i;

/**
 * 上游回的 cookie 是完整 Set-Cookie 串（`NMTID=x; Max-Age=...; Path=/`），
 * 直接透传会把 `Max-Age`、`Path` 这些**属性**当成 cookie 名，请求头就废了。
 * 只留 `k=v` 的对。
 */
export function cleanCookie(raw: string): string {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("=") && !COOKIE_ATTRS.test(part.split("=")[0].trim()))
    .join("; ");
}

/** 调一个网易云接口。cookie 自动带上；响应里带新 cookie 就落盘。 */
export async function callNcm(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  load();

  const wait = backoff.waitMs(method);
  if (wait > 0) {
    throw new Error(`网易云接口连续失败，${Math.ceil(wait / 1000)} 秒后自动恢复`);
  }

  const fn = ncmFn(method);
  if (!fn) {
    throw new Error(`网易云接口不存在：${method}`);
  }

  // 允许调用方显式指定 cookie（含空串 = 匿名请求）：
  // song_url 在部分网络下会被登录态触发 -460 风控，匿名反而能取到地址。
  const useCookie = Object.prototype.hasOwnProperty.call(params, "cookie") ? String(params.cookie ?? "") : cookie;
  const rest = { ...params };
  delete rest.cookie;

  let result: { status: number; body: Record<string, unknown> };
  try {
    result = await withTimeout(fn({ ...rest, cookie: useCookie, timestamp: Date.now() }), DEFAULT_TIMEOUT);
  } catch (err) {
    backoff.fail(method);
    if (method === "song_url" || method === "song_url_v1") {
      const body = (err as { body?: { code?: unknown; message?: unknown } })?.body;
      log(
        "warn",
        `[netease] ${method} 抛错 ${body ? `code=${String(body.code ?? "?")} msg=${String(body.message ?? "")}` : String((err as Error)?.message ?? err).slice(0, 120)}`,
      );
    }
    throw err;
  }
  backoff.ok(method);
  const body = result?.body ?? {};

  // 取流失败要留痕：风控（-460）与「真的没地址」在 UI 上是同一句话，日志里必须分得开
  if (method === "song_url" || method === "song_url_v1") {
    const data = body.data as { url?: string | null }[] | undefined;
    if (!data?.[0]?.url) {
      log("warn", `[netease] ${method} 无地址 code=${String(body.code ?? "?")} msg=${String(body.message ?? "")}`);
    }
  }

  const nextCookie = body.cookie;
  if (typeof nextCookie === "string" && nextCookie) {
    const cleaned = cleanCookie(nextCookie);
    // 只有带 MUSIC_U 的才算登录态，别把匿名 NMTID 当凭证存下来
    if (cleaned.includes("MUSIC_U")) persist(cleaned);
  }

  return body;
}

interface AccountNode {
  id?: number;
  /** 未登录时这个包会自动注册一个匿名账号，它**也有 id**，必须靠这个字段排除 */
  anonimousUser?: boolean;
  userName?: string;
}

/**
 * 当前是否已登录。
 *
 * **不能只看 account.id**：无 cookie 时这个包会自动注册匿名账号，
 * 返回的 account 里 `anonimousUser: true` 但 id 有值。
 * 早期版本就是被这一点骗过去了，界面上显示"已登录"其实根本没登。
 */
export async function isLoggedIn(): Promise<boolean> {
  try {
    const body = await callNcm("user_account");
    const account = body.account as AccountNode | null;
    return Boolean(account?.id) && account?.anonimousUser !== true;
  } catch {
    return false;
  }
}

/** 登录态摘要，给界面显示昵称。 */
export async function loginProfile(): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null; avatarUrl: string | null }> {
  try {
    const body = await callNcm("user_account");
    const account = body.account as AccountNode | null;
    const profile = body.profile as { nickname?: string; avatarUrl?: string } | null;

    const loggedIn = Boolean(account?.id) && account?.anonimousUser !== true;
    if (!loggedIn) return { loggedIn: false, nick: null, uid: null, avatarUrl: null };

    return {
      loggedIn: true,
      nick: profile?.nickname ?? account?.userName ?? null,
      uid: String(account?.id ?? ""),
      avatarUrl: profile?.avatarUrl ?? null,
    };
  } catch {
    return { loggedIn: false, nick: null, uid: null, avatarUrl: null };
  }
}

export async function clearLogin(): Promise<void> {
  try {
    await callNcm("logout");
  } catch {
    /* 退出失败也要清本地 */
  }
  persist("");
}
