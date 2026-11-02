/**
 * QQ 音乐登录（M6.1）：**真实浏览器窗口**方案。
 *
 * node 直连 ptlogin 被 TLS 指纹风控拒（2026-11-03 实测，见 docs/04 附录），
 * 复刻跳转链也不划算——让用户在真实 y.qq.com 页面里登录，
 * Chromium session 自动收下 `uin` / `qm_keyst` cookie，之后
 * `main/net/fetchJson`（net.fetch）发出的请求天然带登录态。
 *
 * cookie 即登录态：不落盘、不进日志（00 §10.2），退出 = 删 cookie。
 */
import { BrowserWindow, session, type Cookie } from "electron";
import { log } from "../log/index.js";

const QQ_URL = "https://y.qq.com/";

/** 登录判定只认这两个 cookie（QQ 音乐网页版的会话凭证）。 */
const LOGIN_COOKIES = ["qm_keyst", "uin"];

let loginWin: BrowserWindow | null = null;

function qqCookies(): Promise<Cookie[]> {
  return session.defaultSession.cookies.get({ url: QQ_URL });
}

export async function qqProfile(): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }> {
  const cookies = await qqCookies();
  const names = new Set(cookies.map((c) => c.name));
  const loggedIn = LOGIN_COOKIES.every((n) => names.has(n));
  if (!loggedIn) return { loggedIn: false, nick: null, uid: null };
  const uin = cookies.find((c) => c.name === "uin")?.value ?? null;
  // uin 形如 "o12345678"，剥掉前缀字母才是可读号码
  const uid = uin ? uin.replace(/^[A-Za-z]*/, "") : null;
  return { loggedIn: true, nick: uid, uid };
}

export async function qqLogout(): Promise<void> {
  const cookies = await qqCookies();
  for (const c of cookies) {
    const domain = (c.domain ?? "").replace(/^\./, "");
    await session.defaultSession.cookies.remove(`https://${domain}${c.path}`, c.name);
  }
  log("info", "[qq] 已清除登录 cookie");
}

/**
 * 打开登录窗并等待登录完成。窗口被用户直接关掉 = 放弃登录，resolve false。
 * 监听 cookie 写入而不是轮询：登录完成的那一刻立即收手。
 */
export function openQqLogin(): Promise<{ loggedIn: boolean }> {
  return new Promise((resolve) => {
    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.focus();
      return; // 已有登录窗在开着；外层用 profile 自行判断状态
    }

    let settled = false;
    const finish = (loggedIn: boolean): void => {
      if (settled) return;
      settled = true;
      session.defaultSession.cookies.removeListener("changed", onCookieChanged);
      if (loginWin && !loginWin.isDestroyed()) loginWin.close();
      loginWin = null;
      resolve({ loggedIn });
    };

    const onCookieChanged = async (_e: unknown, cookie: Cookie, cause: string): Promise<void> => {
      if (cause !== "explicit" && cause !== "overwrite") return;
      if (!LOGIN_COOKIES.includes(cookie.name)) return;
      const p = await qqProfile();
      if (p.loggedIn) {
        log("info", "[qq] 登录成功（cookie 已入 session）");
        finish(true);
      }
    };

    session.defaultSession.cookies.on("changed", onCookieChanged);

    loginWin = new BrowserWindow({
      width: 1100,
      height: 760,
      title: "登录 QQ 音乐",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    loginWin.on("closed", () => {
      loginWin = null;
      finish(false); // 用户放弃
    });
    void loginWin.loadURL(QQ_URL);
  });
}
