import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "../paths.js";
import { log } from "../log/index.js";

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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ncm = require("NeteaseCloudMusicApi") as Record<string, NcmFn>;

export const currentDeviceId = (): string => DEVICE_ID;

const cookieFile = (): string => path.join(dataDir(), "netease-cookie.txt");

let cookie = "";
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = fs.readFileSync(cookieFile(), "utf8").trim();
    // 只认带 MUSIC_U 的：早期版本把匿名 NMTID 也存下来了，那是脏凭证
    cookie = raw.includes("MUSIC_U") ? raw : "";
  } catch {
    cookie = "";
  }
}

function persist(next: string): void {
  cookie = next;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(cookieFile(), next, "utf8");
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

  const fn = ncm[method];
  if (typeof fn !== "function") {
    throw new Error(`网易云接口不存在：${method}`);
  }

  // 允许调用方显式指定 cookie（含空串 = 匿名请求）：
  // song_url 在部分网络下会被登录态触发 -460 风控，匿名反而能取到地址。
  const useCookie = Object.prototype.hasOwnProperty.call(params, "cookie") ? String(params.cookie ?? "") : cookie;
  const rest = { ...params };
  delete rest.cookie;

  let result: { status: number; body: Record<string, unknown> };
  try {
    result = await fn({ ...rest, cookie: useCookie, timestamp: Date.now() });
  } catch (err) {
    if (method === "song_url" || method === "song_url_v1") {
      const body = (err as { body?: { code?: unknown; message?: unknown } })?.body;
      log(
        "warn",
        `[netease] ${method} 抛错 ${body ? `code=${String(body.code ?? "?")} msg=${String(body.message ?? "")}` : String((err as Error)?.message ?? err).slice(0, 120)}`,
      );
    }
    throw err;
  }
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
