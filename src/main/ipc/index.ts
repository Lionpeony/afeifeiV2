import { dialog, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { log } from "../log/index.js";
import { loadState, saveState } from "../fs/state.js";
import { grant } from "../media/tokens.js";
import { readTags, scanDirs } from "../fs/readTags.js";
import { statFiles } from "../fs/statFiles.js";
import { readCover } from "../fs/cover.js";
import { readKey, writeKey } from "../fs/kv.js";
import { fetchJson } from "../net/fetchJson.js";
import { setSessionCookie } from "../net/cookie.js";
import { callNcm, clearLogin, loginProfile } from "../net/neteaseClient.js";
import { callQq } from "../net/qqClient.js";
import { callUserSource, installUserSource } from "../sandbox/index.js";
import { qrDataUrl } from "../util/qrcode.js";
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

  ipcMain.handle("util:qrcode", (_e, text: unknown) => {
    if (typeof text !== "string") throw new Error("util:qrcode 需要文本");
    return qrDataUrl(text);
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
