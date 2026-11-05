/**
 * QQ 音乐的 IPC handler（从 ipc/index.ts 拆出：单一职责 + 400 行上限）。
 * 数据面全走 main/net/qqClient.ts（本地 yakult 服务）与 main/net/qqQrc.ts（直连逐字）。
 */
import { ipcMain } from "electron";
import { callQq } from "../net/qqClient.js";
import { fetchQqQrc } from "../net/qqQrc.js";

/** 上游错误压成一句可读文本（与 ipc/index.ts 的 readableError 同一职责，本地副本避免交叉依赖）。 */
function readableError(err: unknown): string {
  if (!err) return "未知错误";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || err.name;
  try {
    const obj = err as { message?: unknown; msg?: unknown; code?: unknown };
    const text = obj.message ?? obj.msg;
    if (typeof text === "string" && text) return obj.code !== undefined ? `${text}（code=${String(obj.code)}）` : text;
    return JSON.stringify(err).slice(0, 200);
  } catch {
    return String(err);
  }
}

/**
 * 登录态与昵称。字段映射照抄 Folia normalizeQqUser（qqNormalize.ts）：
 * 登录时回 { data: { profile } }，凭据兜底的顶层 nick 常为空，
 * **真实昵称在 profile.info（GetLoginUserInfo）下**；账号 id 优先 str_musicid（微信凭据的 musicid 是占位 0）。
 *
 * 两个入口共用：`qq:profile`（预加载层的直连口）与 `qq:call("profile")`
 * —— 源侧 provider 走的是后者，qqClient 白名单没有这条，之前一调就炸
 * 「不允许调用 QQ 接口：profile」，getUrl 里靠它区分「没登录/没版权」的逻辑全部失效。
 */
async function qqProfileInfo(): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null; avatarUrl: string | null }> {
  const s = (await callQq("status", {})) as { data?: { profile?: Record<string, unknown> } };
  const nested = s?.data?.profile;
  const profile: Record<string, unknown> =
    nested && typeof nested === "object" ? nested : (s?.data ?? {});
  const info = (profile.info && typeof profile.info === "object" ? profile.info : {}) as Record<string, unknown>;
  const loggedIn = Object.keys(profile).length > 0;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const nick = [
    str(profile.nickname), str(profile.nick), str(profile.name), str(profile.userName),
    str(info.nickname), str(info.nick), str(info.name), str(info.userName),
  ].find(Boolean);
  const uid =
    str(profile.str_musicid) ??
    (profile.musicid != null ? String(profile.musicid) : undefined) ??
    (profile.uin != null ? String(profile.uin) : undefined) ??
    str(info.str_musicid) ??
    (info.musicid != null ? String(info.musicid) : undefined) ??
    null;
  const avatarUrl =
    str(profile.headurl) ?? str(profile.headUrl) ?? str(profile.avatar) ??
    str(info.headurl) ?? str(info.headUrl) ?? str(info.avatar) ?? null;
  return { loggedIn, nick: loggedIn ? (nick ?? uid ?? null) : null, uid, avatarUrl: loggedIn ? avatarUrl : null };
}

export function registerQqIpc(): void {
  /* ---------- QQ 音乐通道（匿名接口，见 main/net/qqClient.ts 的实测记录） ---------- */

  ipcMain.handle("qq:call", async (_e, method: unknown, params: unknown) => {
    if (typeof method !== "string") throw new Error("qq:call 需要方法名");
    try {
      // QRC 逐字不走本地 yakult 服务（包里没有这条路由），主进程直连 musicu.fcg + 解密
      if (method === "qrc") {
        if (typeof params !== "object" || params === null || typeof (params as { songmid?: unknown }).songmid !== "string") {
          throw new Error("qq:qrc 需要 songmid");
        }
        return fetchQqQrc((params as { songmid: string }).songmid);
      }
      if (method === "profile") return qqProfileInfo();
      return await callQq(method, (params ?? {}) as Record<string, unknown>);
    } catch (err) {
      // 同 netease:call —— 上游错误压成可读字符串，别让渲染层收到 [object Object]
      throw new Error(readableError(err));
    }
  });

  /* ---------- QQ 扫码登录（本地 qqBackend 服务承载，见 main/net/qqBackend.ts） ---------- */

  ipcMain.handle("qq:login", async (_e, channel: unknown) => {
    // channel 可选（"qq" | "qqmusic" | "wechat"，白名单在 qqClient 里校验）
    const r = (await callQq("qrStart", typeof channel === "string" ? { channel } : {})) as {
      key?: string;
      qrImage?: string;
    };
    return { key: r.key ?? "", qrImage: r.qrImage ?? "" };
  });
  ipcMain.handle("qq:poll", async (_e, key: unknown) => {
    if (typeof key !== "string" || !key) throw new Error("qq:poll 需要 key");
    const check = (await callQq("qrPoll", { key })) as {
      code?: number;
      message?: string;
      failureReason?: string;
      failureHint?: { key?: string; message?: string };
    };
    // 会话建立失败时包带 failureHint（英文预置文案），按 key 换成人话；没有映射的透出原文
    const HINTS: Record<string, string> = {
      "login.wrong-scan-app": "扫码用的 App 不对：请用「手机 QQ」App 扫码重试（不是 QQ 音乐 App）",
      "login.device-limit": "登录设备数已达上限，请在 QQ 音乐 App 里移除一台旧设备再试",
      "login.rate-limited": "登录太频繁，稍等一会再试",
      "login.account-restricted": "账号受限，暂时无法登录",
      "login.account-banned": "账号已被封禁",
      "login.account-binding": "账号绑定异常，请在 QQ 音乐 App 里检查",
      "login.rejected": "QQ 音乐拒绝了这次登录，请重试",
    };
    // 800（会话终止）按包内的 failureReason 分成因：自然过期 / 手机取消 / 手机拒绝，
    // 上游拒绝的会带 failureHint，优先级最高
    const TERMINAL: Record<string, string> = {
      "qr-timeout": "二维码已过期（有效期约 3 分钟），请点「刷新」重新扫码",
      "user-canceled": "扫码已在手机上取消，请重新扫码",
      "login-rejected": "手机端拒绝了这次登录，请重新扫码",
    };
    const hint =
      check.failureHint?.key
        ? HINTS[check.failureHint.key]
        : check.code === 800
          ? (TERMINAL[check.failureReason ?? ""] ?? "二维码已失效，请点「刷新」重新扫码")
          : undefined;
    // 包的 check 语义与网易云对齐（801=未扫 / 802=已扫待确认 / 803=成功，成功时包会把会话写进响应 cookie）
    const status = (await callQq("status", {})) as { data?: Record<string, unknown> };
    const loggedIn = !!status.data && Object.keys(status.data).length > 0;
    return { code: check.code ?? 801, loggedIn, message: hint ?? check.message ?? "" };
  });
  ipcMain.handle("qq:profile", () => qqProfileInfo());
  ipcMain.handle("qq:logout", async () => {
    await callQq("logout", {});
  });
}
