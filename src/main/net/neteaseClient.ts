import fs from "node:fs";
import path from "node:path";
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ncm = require("NeteaseCloudMusicApi") as Record<string, NcmFn>;

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
    log("warn", `[netease] 存 cookie 失败：${(err as Error).message}`);
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

  const result = await fn({ ...params, cookie, timestamp: Date.now() });
  const body = result?.body ?? {};

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
export async function loginProfile(): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }> {
  try {
    const body = await callNcm("user_account");
    const account = body.account as AccountNode | null;
    const profile = body.profile as { nickname?: string } | null;

    const loggedIn = Boolean(account?.id) && account?.anonimousUser !== true;
    if (!loggedIn) return { loggedIn: false, nick: null, uid: null };

    return {
      loggedIn: true,
      nick: profile?.nickname ?? account?.userName ?? null,
      uid: String(account?.id ?? ""),
    };
  } catch {
    return { loggedIn: false, nick: null, uid: null };
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
