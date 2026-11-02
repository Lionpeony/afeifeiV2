/**
 * QQ 音乐扫码登录（M6.1，Folia 同款体验：应用内二维码 + 轮询）。
 *
 * 手写 ptlogin 协议被 TLS 指纹风控拒（node 与 net.fetch 都 403，2026-11-03 实测，
 * 见 docs/04 附录）——**连 Chromium 的手写请求都拦**。所以反着来：
 * 载入 QQ 自己的 xlogin 登录页（隐藏窗口），协议、轮询、二维码刷新全由页面自己做
 * ——它就是真浏览器，风控无感。我们只做两件事：
 *   ① 从页面提取二维码给应用内显示（提取 <img> 的 src，渲染层 <img> 直接加载，
 *      session 自动带 qrsig cookie，CSP img-src https: 已放开）
 *   ② 轮询登录态（qm_keyst/uin cookie 出现即成功，00 §10.2：不落盘不进日志）
 * 页面的状态文案（"扫描成功…"）是 QQ 自己的中文人话，直接透传。
 */
import { BrowserWindow } from "electron";
import { session } from "electron";
import { log } from "../log/index.js";

const XLOGIN_URL =
  "https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=100497308&daid=38&style=11&hide_border=1&proxy_url=https%3A%2F%2Fy.qq.com%2Fportal%2Fproxy.html&s_url=https%3A%2F%2Fy.qq.com%2F";
const LOGIN_COOKIES = ["qm_keyst", "uin"];

let qrWin: BrowserWindow | null = null;

export async function qqProfile(): Promise<{
  loggedIn: boolean;
  nick: string | null;
  uid: string | null;
}> {
  const cookies = await session.defaultSession.cookies.get({ url: "https://y.qq.com/" });
  const names = new Set(cookies.map((c) => c.name));
  const loggedIn = LOGIN_COOKIES.every((n) => names.has(n));
  if (!loggedIn) return { loggedIn: false, nick: null, uid: null };
  const uin = cookies.find((c) => c.name === "uin")?.value ?? null;
  const uid = uin ? uin.replace(/^[A-Za-z]*/, "") : null;
  return { loggedIn: true, nick: uid, uid };
}

export async function qqLogout(): Promise<void> {
  const cookies = await session.defaultSession.cookies.get({ url: "https://y.qq.com/" });
  for (const c of cookies) {
    const domain = (c.domain ?? "").replace(/^\./, "");
    await session.defaultSession.cookies.remove(`https://${domain}${c.path}`, c.name);
  }
  log("info", "[qq] 已清除登录 cookie");
}

/** 从隐藏登录页里提取二维码与状态文字。页面结构变化时这里要做防御性查询。 */
async function extractPageState(): Promise<{ qrImage: string | null; message: string }> {
  if (!qrWin || qrWin.isDestroyed()) return { qrImage: null, message: "二维码会话已结束" };
  try {
    return await qrWin.webContents.executeJavaScript(
      `(() => {
        const img = document.querySelector("#qrlogin_pic img") || document.querySelector("img#qrlogin_pic") || document.querySelector(".qrlogin_img img, img[src*='ptqrshow']");
        const note = document.querySelector("#qrlogin_tips") || document.querySelector("#normal_tips") || document.querySelector(".qrlogin_tips") || document.querySelector("#error_tips");
        return { src: img ? img.src : null, note: note ? (note.textContent || "").trim() : "" };
      })()`,
      true,
    );
  } catch {
    return { qrImage: null, message: "" };
  }
}

/** 开隐藏登录窗，等二维码出现在页面上。 */
export function startQrLogin(): Promise<{ qrImage: string }> {
  return new Promise((resolve, reject) => {
    if (qrWin && !qrWin.isDestroyed()) qrWin.close();

    let settled = false;
    qrWin = new BrowserWindow({
      show: false, // 用户全程在应用内看二维码
      width: 420,
      height: 500,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    qrWin.on("closed", () => {
      qrWin = null;
    });

    qrWin
      .loadURL(XLOGIN_URL)
      .then(async () => {
        // 二维码是页面 JS 注入的，轮询等它出现（最多 10s）
        for (let i = 0; i < 20; i += 1) {
          await new Promise((r) => setTimeout(r, 500));
          const st = await extractPageState();
          if (st.qrImage) {
            settled = true;
            log("info", "[qq] 二维码已从登录页提取");
            resolve({ qrImage: st.qrImage });
            return;
          }
        }
        if (!settled) reject(new Error("QQ 登录页没有给出二维码，稍后再试"));
      })
      .catch((err: unknown) => reject(err instanceof Error ? err : new Error(String(err))));
  });
}

/** 轮询一次：登录态 + 页面状态文案 + 最新二维码（页面过期自动刷新后 src 会变）。 */
export async function pollQrLogin(): Promise<{
  loggedIn: boolean;
  message: string;
  qrImage: string | null;
}> {
  const profile = await qqProfile();
  if (profile.loggedIn) {
    if (qrWin && !qrWin.isDestroyed()) qrWin.close();
    log("info", "[qq] 登录成功（cookie 已入 session）");
    return { loggedIn: true, message: "登录成功", qrImage: null };
  }
  const st = await extractPageState();
  return {
    loggedIn: false,
    message: st.message || "请用 QQ 或微信扫一扫",
    qrImage: st.qrImage,
  };
}
