import { contextBridge, ipcRenderer } from "electron";

// sandbox: true 下 preload 只能 require electron 本身，不能碰业务模块 —— 这正是设计要的：
// 桥是窄的、具名的，业务一律留在渲染进程的环 0–4。
contextBridge.exposeInMainWorld("api", {
  ping: (): string => "pong",
  loadState: (): Promise<string | null> => ipcRenderer.invoke("app-state:load"),
  saveState: (json: string): Promise<void> => ipcRenderer.invoke("app-state:save", json),
  pickFiles: (): Promise<string[]> => ipcRenderer.invoke("media:pick"),
  grant: (filePath: string): Promise<string | null> => ipcRenderer.invoke("media:grant", filePath),
});
