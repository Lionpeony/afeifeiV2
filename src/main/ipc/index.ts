import { dialog, ipcMain } from "electron";
import { loadState, saveState } from "../fs/state.js";
import { grant } from "../media/tokens.js";
import { readTags, scanDirs } from "../fs/readTags.js";
import { statFiles } from "../fs/statFiles.js";
import { readCover } from "../fs/cover.js";
import { readKey, writeKey } from "../fs/kv.js";
import {
  appendIndexLog,
  clearIndexLog,
  loadIndex,
  readIndexLog,
  saveIndex,
} from "../fs/indexFile.js";

const AUDIO_EXT = ["mp3", "flac", "m4a", "wav", "opus", "ogg", "aac"];

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
