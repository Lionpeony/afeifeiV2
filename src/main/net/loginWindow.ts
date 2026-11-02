import { BrowserWindow, session } from "electron";
import { log } from "../log/index.js";

/**
 * 开一个真实浏览器窗口让用户登录（扫码或密码都行）。
 *
 * 为什么不继续用 `/api/login/qrcode/*`：那个接口对请求频率很敏感，
 * 短时间内多申请几次 key 就会开始返回非标准码（实测 8821），而风控是按 IP 记的。
 * 打开网页让网易云自己的前端去处理登录，风控策略由它负责 —— 我们只等 cookie。
 *
 * 关键点：窗口用**同一个 session**（默认就是 defaultSession），
 * 所以网页里登录成功后 `Set-Cookie` 直接落到我们后续请求会用的 cookie 里，不需要搬运。
 */

const COOKIE_DOMAIN = "music.163.com";
/** 登录态的标志 cookie。网易云网页版登录成功后一定会写它。 */
const AUTH_COOKIE = "MUSIC_U";

export interface LoginWindowOptions {
  url: string;
  title?: string;
  /** 超时后自动关窗并按失败返回 */
  timeoutMs?: number;
  /** 轮询间隔 */
  intervalMs?: number;
}

export async function openLoginWindow(options: LoginWindowOptions): Promise<boolean> {
  const { url, title = "登录", timeoutMs = 5 * 60 * 1000, intervalMs = 1500 } = options;

  return new Promise<boolean>((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      title,
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    let settled = false;
    let poller: ReturnType<typeof setInterval> | undefined;

    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      if (poller) clearInterval(poller);
      clearTimeout(guard);
      if (!win.isDestroyed()) win.close();
      log("info", `[login] window done, ok=${ok}`);
      resolve(ok);
    };

    const guard = setTimeout(() => finish(false), timeoutMs);

    poller = setInterval(() => {
      void session.defaultSession.cookies
        .get({ domain: COOKIE_DOMAIN })
        .then((cookies) => {
          if (cookies.some((c) => c.name === AUTH_COOKIE && c.value)) finish(true);
        })
        .catch(() => {
          /* 读 cookie 失败就下一轮再试 */
        });
    }, intervalMs);

    win.on("closed", () => finish(false));
    void win.loadURL(url);
  });
}
