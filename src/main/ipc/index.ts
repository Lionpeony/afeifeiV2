import { app, dialog, ipcMain, Notification } from "electron";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { log } from "../log/index.js";
import { loadState, saveState } from "../fs/state.js";
import { grant } from "../media/tokens.js";
import { readTags, scanDirs } from "../fs/readTags.js";
import { statFiles } from "../fs/statFiles.js";
import { readCover } from "../fs/cover.js";
import { readLocalLyric } from "../fs/readLyric.js";
import { readKey, writeKey } from "../fs/kv.js";
import { dropRoot, mergeRoot } from "../fs/roots.js";
import { exportBackup, importBackup } from "../fs/backup.js";
import { fetchJson } from "../net/fetchJson.js";
import { setSessionCookie } from "../net/cookie.js";
import { callNcm, clearLogin, loginProfile } from "../net/neteaseClient.js";
import { registerQqIpc } from "./qq.js";
import { callQq } from "../net/qqClient.js";
import { fetchQqQrc } from "../net/qqQrc.js";
import { callUserSource, installUserSource } from "../sandbox/index.js";
import { cancelFetch, dirUsage, fetchToFile } from "../fs/fetchToFile.js";
import { lastCrash, markCrashSeen } from "../crash.js";
import { shell } from "electron";
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
  "lyric_new",
  "login_qr_key",
  "login_qr_create",
  "login_qr_check",
  "captcha_sent",
  "login_cellphone",
  "user_account",
  "logout",
  // 榜单（A-14）与歌单下钻：provider 早就在调这三个，白名单漏登记 = 一调就抛
  // "不允许调用网易云接口"（歌单页与榜单页都会全红，且报错与网络失败长得一样）
  "toplist",
  "playlist_track_all",
  // 导入别人的歌单（M11）：要先拿到歌单名字与曲目数
  "playlist_detail",
  "login_status",
  "user_playlist",
  // 账号级数据（R1）：每日推荐 / 账号红心 / 收藏 / 听歌排行 / 个人 FM
  "recommend_songs",
  "likelist",
  "like",
  "user_record",
  "personal_fm",
  // 不喜欢 / 少推（B-11）：漫游 FM 走垃圾桶，日推走不感兴趣
  "fm_trash",
  "recommend_songs_dislike",
]);

/**
 * 全部 IPC 在这里登记，一个地方看得完（50 §11）。
 * 主进程对参数只做最小校验，业务判断一律留在渲染层的环 1。
 */

/** 曲库目录列表的 KV 键。只存路径，不存曲子。 */
const ROOTS_KEY = "library-roots";

/** 坏数据当空：一条烂 JSON 不能把用户的曲库目录全清掉（那样只能重新一个个加回来）。 */
async function readRoots(): Promise<string[]> {
  try {
    const raw = await readKey(ROOTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function writeRoots(roots: string[]): Promise<void> {
  await writeKey(ROOTS_KEY, JSON.stringify(roots));
}

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

  /* ---------- 系统通知（M9）：窗口在后台时，这是唯一能看见「切歌了 / 下完了」的地方 ---------- */
  ipcMain.handle("notify:show", (_e, payload: unknown) => {
    const p = (payload ?? {}) as { title?: unknown; body?: unknown };
    const title = typeof p.title === "string" ? p.title.slice(0, 120) : "";
    const body = typeof p.body === "string" ? p.body.slice(0, 240) : "";
    if (!title || !Notification.isSupported()) return false;
    new Notification({ title, body, silent: true }).show();
    return true;
  });

  /* ---------- 开机自启（M9）：状态只有系统知道，这里只做透传，不另存一份 ---------- */
  ipcMain.handle("app:autoLaunch", () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle("app:setAutoLaunch", (_e, on: unknown) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(on) });
    return app.getLoginItemSettings().openAtLogin;
  });

  /*
   * 曲库目录列表（M9）：以前每次扫描临时选一个目录，选完就忘——分在几个盘上的曲子
   * 根本没法管，重扫还得重新点。现在把目录持久化，扫描只是「按列表重扫一遍」。
   * 只存路径，不存曲子；路径失效（移动硬盘拔了）由扫描结果报 missing，不删条目。
   */
  ipcMain.handle("library:roots", async () => readRoots());

  ipcMain.handle("library:addRoot", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    const roots = mergeRoot(await readRoots(), r.filePaths[0]);
    await writeRoots(roots);
    return roots;
  });

  ipcMain.handle("library:removeRoot", async (_e, dir: unknown) => {
    if (typeof dir !== "string" || !dir) throw new Error("library:removeRoot 需要目录路径");
    const roots = dropRoot(await readRoots(), dir);
    await writeRoots(roots);
    return roots;
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

  // 本地曲目歌词（P0-20）：只取原文，解析与兜底在渲染层
  ipcMain.handle("library:localLyric", (_e, filePath: unknown) => {
    if (typeof filePath !== "string") return null;
    return readLocalLyric(filePath);
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

  /* ---------- QQ 音乐通道（见 main/ipc/qq.ts） ---------- */
  registerQqIpc();

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

  /* ---------- 崩溃记录与外链（M8） ---------- */

  ipcMain.handle("app:lastCrash", () => lastCrash());
  ipcMain.handle("app:markCrashSeen", (_e, file: unknown) => {
    if (typeof file === "string") markCrashSeen(file);
  });
  // 外链白名单（00 §11）：只放行我们的发布页域，其余一律拒绝
  ipcMain.handle("app:openExternal", (_e, url: unknown) => {
    if (typeof url !== "string" || !/^https:\/\/github\.com\//i.test(url)) {
      throw new Error("只允许打开 GitHub 上的发布页");
    }
    return shell.openExternal(url);
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
