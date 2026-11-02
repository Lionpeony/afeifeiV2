import { dialog, ipcMain } from "electron";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { log } from "../log/index.js";
import { loadState, saveState } from "../fs/state.js";
import { grant } from "../media/tokens.js";
import { readTags, scanDirs } from "../fs/readTags.js";
import { statFiles } from "../fs/statFiles.js";
import { readCover } from "../fs/cover.js";
import { readKey, writeKey } from "../fs/kv.js";
import { exportBackup, importBackup } from "../fs/backup.js";
import { fetchJson } from "../net/fetchJson.js";
import { setSessionCookie } from "../net/cookie.js";
import { callNcm, clearLogin, loginProfile } from "../net/neteaseClient.js";
import { callQq } from "../net/qqClient.js";
import { callUserSource, installUserSource } from "../sandbox/index.js";
import { cancelFetch, dirUsage, fetchToFile } from "../fs/fetchToFile.js";
import { dataDir } from "../paths.js";
import {
  appendIndexLog,
  clearIndexLog,
  loadIndex,
  readIndexLog,
  saveIndex,
} from "../fs/indexFile.js";

const AUDIO_EXT = ["mp3", "flac", "m4a", "wav", "opus", "ogg", "aac"];

/**
 * 把任意异常压成一句可读文本。
 * 不这么做的话，跨 IPC 后渲染层只会看到 `[object Object]` —— 等于没有错误信息。
 */
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

/** 允许渲染层调用的网易云接口白名单。加接口要在这里登记。 */
const NETEASE_ALLOWED = new Set([
  "cloudsearch",
  "song_url_v1",
  "song_detail",
  "lyric",
  "login_qr_key",
  "login_qr_create",
  "login_qr_check",
  "captcha_sent",
  "login_cellphone",
  "user_account",
  "logout",
]);

/**
 * 全部 IPC 在这里登记，一个地方看得完（50 §11）。
 * 主进程对参数只做最小校验，业务判断一律留在渲染层的环 1。
 */
export function registerIpc(): void {
  /* ---------- 播放状态 ---------- */
  ipcMain.handle("app-state:load", () => loadState());
  ipcMain.handle("app-state:save", (_e, json: unknown) => {
    if (typeof json !== "string") throw new Error("app-state:save 只接受字符串");
    return saveState(json);
  });

  /* ---------- 音频令牌 ---------- */
  ipcMain.handle("media:pick", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "音频", extensions: AUDIO_EXT }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("media:grant", (_e, filePath: unknown) => {
    if (typeof filePath !== "string") return null;
    return grant(filePath);
  });

  /* ---------- 曲库 ---------- */
  ipcMain.handle("library:pickDir", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("library:scan", (_e, dirs: unknown) => {
    if (!Array.isArray(dirs) || dirs.some((d) => typeof d !== "string")) {
      throw new Error("library:scan 只接受字符串数组");
    }
    return scanDirs(dirs as string[]);
  });

  ipcMain.handle("library:readTags", (_e, filePaths: unknown) => {
    if (!Array.isArray(filePaths) || filePaths.some((p) => typeof p !== "string")) {
      throw new Error("library:readTags 只接受字符串数组");
    }
    return readTags(filePaths as string[]);
  });

  ipcMain.handle("library:cover", (_e, filePath: unknown) => {
    if (typeof filePath !== "string") return null;
    return readCover(filePath);
  });

  ipcMain.handle("library:statFiles", (_e, filePaths: unknown) => {
    if (!Array.isArray(filePaths) || filePaths.some((p) => typeof p !== "string")) {
      throw new Error("library:statFiles 只接受字符串数组");
    }
    return statFiles(filePaths as string[]);
  });

  /* ---------- 出站网络 ---------- */
  ipcMain.handle("net:fetchJson", (_e, url: unknown, options: unknown) => {
    if (typeof url !== "string") throw new Error("net:fetchJson 需要一个 URL 字符串");
    return fetchJson(url, (options ?? {}) as Record<string, never>);
  });

  ipcMain.handle("net:setCookie", (_e, target: unknown, name: unknown, value: unknown) => {
    if (typeof target !== "string" || typeof name !== "string" || typeof value !== "string") {
      throw new Error("net:setCookie 需要 (url, name, value)");
    }
    return setSessionCookie(target, name, value);
  });

  /* ---------- 网易云通道（主进程内嵌 NeteaseCloudMusicApi） ---------- */

  ipcMain.handle("netease:call", async (_e, method: unknown, params: unknown) => {
    if (typeof method !== "string") throw new Error("netease:call 需要方法名");
    // 收敛接口面：渲染层只能调这几个，不给它整包 380 个接口
    if (!NETEASE_ALLOWED.has(method)) throw new Error(`不允许调用网易云接口：${method}`);
    try {
      return await callNcm(method, (params ?? {}) as Record<string, unknown>);
    } catch (err) {
      // 上游抛的常常不是 Error（是 { code, message } 之类），
      // 直接往上抛会让渲染层收到 "[object Object]"。这里统一压成可读字符串。
      throw new Error(readableError(err));
    }
  });

  ipcMain.handle("netease:profile", () => loginProfile());
  ipcMain.handle("netease:logout", () => clearLogin());

  /* ---------- QQ 音乐通道（匿名接口，见 main/net/qqClient.ts 的实测记录） ---------- */

  ipcMain.handle("qq:call", async (_e, method: unknown, params: unknown) => {
    if (typeof method !== "string") throw new Error("qq:call 需要方法名");
    try {
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
  ipcMain.handle("qq:profile", async () => {
    // 包实测（2026-11-03）：/login/status 的 data = profile 对象，昵称在 nick/nickname，
    // 账号 id 在 musicid——**没有 uin 字段**（包注释明说 GetLoginUserInfo 回包里没有它）
    const s = (await callQq("status", {})) as {
      data?: { nick?: unknown; nickname?: unknown; musicid?: unknown; uin?: unknown };
    };
    const data = s.data && typeof s.data === "object" ? s.data : {};
    const loggedIn = Object.keys(data).length > 0;
    const nick = [data.nick, data.nickname].find((v) => typeof v === "string" && v) as string | undefined;
    const uid =
      data.musicid != null ? String(data.musicid) : data.uin != null ? String(data.uin) : null;
    return { loggedIn, nick: loggedIn ? (nick ?? uid ?? null) : null, uid };
  });
  ipcMain.handle("qq:logout", async () => {
    await callQq("logout", {});
  });

  /* ---------- 用户源沙箱（见 main/sandbox/；崩溃与超时都不波及主窗） ---------- */

  ipcMain.handle("user:install", (_e, sourceId: unknown, code: unknown) => {
    if (typeof sourceId !== "string" || typeof code !== "string") {
      throw new Error("user:install 需要 (string, string)");
    }
    if (code.length > 200_000) throw new Error("源代码过大（>200KB）");
    return installUserSource(sourceId, code);
  });

  ipcMain.handle("user:call", (_e, sourceId: unknown, method: unknown, params: unknown) => {
    if (typeof sourceId !== "string" || typeof method !== "string") {
      throw new Error("user:call 需要 (string, string)");
    }
    return callUserSource(sourceId, method, params);
  });

  ipcMain.handle("user:import", async () => {
    const r = await dialog.showOpenDialog({
      filters: [{ name: "JS 音源", extensions: ["js"] }],
      properties: ["openFile"],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    const p = r.filePaths[0];
    if (!/\.js$/i.test(p)) throw new Error("只接受 .js 文件");
    const code = await readFile(p, "utf8");
    if (code.length > 200_000) throw new Error("源文件过大（>200KB）");
    return { name: path.basename(p), code };
  });

  /* ---------- 主题包（M5）：JSON 单文件，内容只是场景层 token —— 主进程不认识 token 的含义 ---------- */

  ipcMain.handle("theme:export", async (_e, json: unknown) => {
    if (typeof json !== "string") throw new Error("theme:export 需要 JSON 字符串");
    const r = await dialog.showSaveDialog({
      defaultPath: "afeifei-theme.json",
      filters: [{ name: "Afeifei 主题", extensions: ["json"] }],
    });
    if (r.canceled || !r.filePath) return false;
    await writeFile(r.filePath, json, "utf8");
    return true;
  });

  ipcMain.handle("theme:import", async () => {
    const r = await dialog.showOpenDialog({
      filters: [{ name: "Afeifei 主题", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    const text = await readFile(r.filePaths[0], "utf8");
    if (text.length > 100_000) throw new Error("主题文件过大");
    return JSON.parse(text) as unknown;
  });

  /* ---------- 数据备份（M6.6，见 main/fs/backup.ts） ---------- */

  ipcMain.handle("backup:export", () => exportBackup());
  ipcMain.handle("backup:import", () => importBackup());

  /* ---------- 下载（M7，系统调用面；队列/并发/配额是环 1 的业务） ---------- */

  let downloadDirOverride: string | null | undefined;
  /** 下载根目录：用户在「下载」页自定义过就走 KV，否则 dataDir/downloads。 */
  const downloadsDir = (): string => {
    if (downloadDirOverride === undefined) {
      const raw = readKey("download-dir");
      downloadDirOverride = typeof raw === "string" && raw ? raw : null;
    }
    return downloadDirOverride ?? path.join(dataDir(), "downloads");
  };
  /** 防穿越：dest/remove 只准落在 downloads 目录内。 */
  const insideDownloads = (p: string): boolean => {
    const rel = path.relative(downloadsDir(), path.resolve(p));
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };

  ipcMain.handle("download:dir", async () => {
    const dir = downloadsDir();
    await mkdir(dir, { recursive: true });
    return dir;
  });
  /** 自定义下载目录：选目录 → 存 KV → 生效（已有文件不搬）。取消返回 null。 */
  ipcMain.handle("download:setDir", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    const dir = r.filePaths[0];
    await mkdir(dir, { recursive: true });
    await writeKey("download-dir", dir);
    downloadDirOverride = dir;
    return dir;
  });
  ipcMain.handle("download:usage", () => dirUsage(downloadsDir()));
  ipcMain.handle(
    "download:fetch",
    (e, taskId: unknown, url: unknown, destPath: unknown) => {
      if (typeof taskId !== "string" || !taskId) throw new Error("download:fetch 需要 taskId");
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("download:fetch 需要合法 URL");
      if (typeof destPath !== "string" || !insideDownloads(destPath)) {
        throw new Error("download:fetch 的目标路径必须在下载目录内");
      }
      return fetchToFile(taskId, url, destPath, (received, total) => {
        if (!e.sender.isDestroyed()) e.sender.send("download:progress", { taskId, received, total });
      });
    },
  );
  ipcMain.handle("download:cancel", (_e, taskId: unknown) => {
    if (typeof taskId === "string") cancelFetch(taskId);
  });
  ipcMain.handle("download:remove", async (_e, filePath: unknown) => {
    if (typeof filePath !== "string" || !insideDownloads(filePath)) {
      throw new Error("download:remove 只能删下载目录内的文件");
    }
    await rm(filePath, { force: true });
    await rm(`${filePath}.part`, { force: true });
  });

  /* ---------- 通用小文件（收藏 / 歌单 / 历史） ---------- */
  ipcMain.handle("store:read", (_e, key: unknown) => {
    if (typeof key !== "string") return null;
    return readKey(key);
  });

  ipcMain.handle("store:write", (_e, key: unknown, json: unknown) => {
    if (typeof key !== "string" || typeof json !== "string") {
      throw new Error("store:write 需要 (string, string)");
    }
    return writeKey(key, json);
  });

  ipcMain.handle("library:loadIndex", () => loadIndex());
  ipcMain.handle("library:saveIndex", (_e, json: unknown) => {
    if (typeof json !== "string") throw new Error("library:saveIndex 只接受字符串");
    return saveIndex(json);
  });
  ipcMain.handle("library:readLog", () => readIndexLog());
  ipcMain.handle("library:appendLog", (_e, lines: unknown) => {
    if (typeof lines !== "string") throw new Error("library:appendLog 只接受字符串");
    return appendIndexLog(lines);
  });
  ipcMain.handle("library:clearLog", () => clearIndexLog());
}
