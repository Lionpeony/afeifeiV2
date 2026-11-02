import { dialog, ipcMain } from "electron";
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
import { qrDataUrl } from "../util/qrcode.js";
import {
  appendIndexLog,
  clearIndexLog,
  loadIndex,
  readIndexLog,
  saveIndex,
} from "../fs/indexFile.js";

const AUDIO_EXT = ["mp3", "flac", "m4a", "wav", "opus", "ogg", "aac"];

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
  "captcha_verify",
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

  ipcMain.handle("netease:call", (_e, method: unknown, params: unknown) => {
    if (typeof method !== "string") throw new Error("netease:call 需要方法名");
    // 收敛接口面：渲染层只能调这几个，不给它整包 380 个接口
    if (!NETEASE_ALLOWED.has(method)) throw new Error(`不允许调用网易云接口：${method}`);
    return callNcm(method, (params ?? {}) as Record<string, unknown>);
  });

  ipcMain.handle("netease:profile", () => loginProfile());
  ipcMain.handle("netease:logout", () => clearLogin());

  ipcMain.handle("util:qrcode", (_e, text: unknown) => {
    if (typeof text !== "string") throw new Error("util:qrcode 需要文本");
    return qrDataUrl(text);
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
