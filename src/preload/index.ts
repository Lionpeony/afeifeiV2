import { contextBridge, ipcRenderer } from "electron";

// sandbox: true 下 preload 只能 require electron 本身，不能碰业务模块 —— 这正是设计要的：
// 桥是窄的、具名的，业务一律留在渲染进程的环 0–4。
contextBridge.exposeInMainWorld("api", {
  ping: (): string => "pong",

  // 播放状态
  loadState: (): Promise<string | null> => ipcRenderer.invoke("app-state:load"),
  saveState: (json: string): Promise<void> => ipcRenderer.invoke("app-state:save", json),

  // 音频
  pickFiles: (): Promise<string[]> => ipcRenderer.invoke("media:pick"),
  grant: (filePath: string): Promise<string | null> => ipcRenderer.invoke("media:grant", filePath),

  // 曲库
  pickDir: (): Promise<string | null> => ipcRenderer.invoke("library:pickDir"),
  scan: (dirs: string[]): Promise<string[]> => ipcRenderer.invoke("library:scan", dirs),
  readTags: (filePaths: string[]): Promise<unknown[]> => ipcRenderer.invoke("library:readTags", filePaths),
  statFiles: (filePaths: string[]): Promise<{ path: string; size: number; mtimeMs: number }[]> =>
    ipcRenderer.invoke("library:statFiles", filePaths),
  cover: (filePath: string): Promise<string | null> => ipcRenderer.invoke("library:cover", filePath),

  // 通用小文件（收藏 / 歌单 / 历史）
  readStore: (key: string): Promise<string | null> => ipcRenderer.invoke("store:read", key),
  writeStore: (key: string, json: string): Promise<void> => ipcRenderer.invoke("store:write", key, json),
  loadIndex: (): Promise<string | null> => ipcRenderer.invoke("library:loadIndex"),
  saveIndex: (json: string): Promise<void> => ipcRenderer.invoke("library:saveIndex", json),
  readIndexLog: (): Promise<string> => ipcRenderer.invoke("library:readLog"),
  appendIndexLog: (lines: string): Promise<void> => ipcRenderer.invoke("library:appendLog", lines),
  clearIndexLog: (): Promise<void> => ipcRenderer.invoke("library:clearLog"),
});
