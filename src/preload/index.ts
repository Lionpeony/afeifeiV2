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

  // 音源本地通道（主进程内嵌 SDK，加密与 cookie 都在那一侧）
  ncmCall: (method: string, params?: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke("netease:call", method, params),
  ncmProfile: (): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }> =>
    ipcRenderer.invoke("netease:profile"),
  ncmLogout: (): Promise<void> => ipcRenderer.invoke("netease:logout"),
  qqCall: (method: string, params?: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke("qq:call", method, params),

  // 用户源沙箱（主进程独立进程，崩溃不波及主窗）
  importUserSource: (): Promise<{ name: string; code: string } | null> =>
    ipcRenderer.invoke("user:import"),
  installUserSource: (sourceId: string, code: string): Promise<unknown> =>
    ipcRenderer.invoke("user:install", sourceId, code),
  callUserSource: (sourceId: string, method: string, params?: unknown): Promise<unknown> =>
    ipcRenderer.invoke("user:call", sourceId, method, params),

  // 迷你窗：主窗只管推投影、收意图转发
  openMini: (): Promise<void> => ipcRenderer.invoke("mini:open"),
  pushMiniState: (json: string): void => ipcRenderer.send("mini:state", json),
  onMiniAction: (cb: (action: string) => void): void => {
    ipcRenderer.on("mini:forward", (_e, action: unknown) => {
      if (typeof action === "string") cb(action);
    });
  },

  // afeifei:// 冷/热启动：主进程解析后的结构化 intent（渲染层不碰原始 URL）
  onSchemeUrl: (cb: (intent: { action: string; id: string; source?: string }) => void): void => {
    ipcRenderer.on("scheme:url", (_e, intent: unknown) => {
      if (
        intent &&
        typeof intent === "object" &&
        typeof (intent as { action?: unknown }).action === "string" &&
        typeof (intent as { id?: unknown }).id === "string"
      ) {
        cb(intent as { action: string; id: string; source?: string });
      }
    });
  },
  /** 启动兜底：send 可能早于订阅，渲染层就绪后主动拉一次 pending。 */
  schemePoll: (): Promise<{ action: string; id: string; source?: string } | null> =>
    ipcRenderer.invoke("scheme:poll"),
  loadIndex: (): Promise<string | null> => ipcRenderer.invoke("library:loadIndex"),
  saveIndex: (json: string): Promise<void> => ipcRenderer.invoke("library:saveIndex", json),
  readIndexLog: (): Promise<string> => ipcRenderer.invoke("library:readLog"),
  appendIndexLog: (lines: string): Promise<void> => ipcRenderer.invoke("library:appendLog", lines),
  clearIndexLog: (): Promise<void> => ipcRenderer.invoke("library:clearLog"),
});
