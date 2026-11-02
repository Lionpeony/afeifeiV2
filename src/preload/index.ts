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
  qqLogin: (channel?: string): Promise<{ key: string; qrImage: string }> =>
    ipcRenderer.invoke("qq:login", channel),
  qqPoll: (key: string): Promise<{ code: number; loggedIn: boolean; message: string }> =>
    ipcRenderer.invoke("qq:poll", key),
  qqProfile: (): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }> =>
    ipcRenderer.invoke("qq:profile"),
  qqLogout: (): Promise<void> => ipcRenderer.invoke("qq:logout"),

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

  // 主题包（主进程只负责文件读写，不认识 token）
  exportTheme: (json: string): Promise<boolean> => ipcRenderer.invoke("theme:export", json),
  importTheme: (): Promise<unknown> => ipcRenderer.invoke("theme:import"),

  // 下载（M7）：系统调用面。队列/并发/配额在渲染层环 1
  downloadDir: (): Promise<string> => ipcRenderer.invoke("download:dir"),
  downloadUsage: (): Promise<number> => ipcRenderer.invoke("download:usage"),
  downloadFetch: (
    taskId: string,
    url: string,
    destPath: string,
  ): Promise<{ bytes: number; resumed: boolean }> =>
    ipcRenderer.invoke("download:fetch", taskId, url, destPath),
  downloadCancel: (taskId: string): Promise<void> => ipcRenderer.invoke("download:cancel", taskId),
  downloadRemove: (filePath: string): Promise<void> => ipcRenderer.invoke("download:remove", filePath),
  onDownloadProgress: (cb: (p: { taskId: string; received: number; total: number }) => void): void => {
    ipcRenderer.on("download:progress", (_e, p: unknown) => {
      if (
        p &&
        typeof p === "object" &&
        typeof (p as { taskId?: unknown }).taskId === "string" &&
        typeof (p as { received?: unknown }).received === "number"
      ) {
        cb(p as { taskId: string; received: number; total: number });
      }
    });
  },

  // 数据备份（恢复后需重启生效）
  exportBackup: (): Promise<string | null> => ipcRenderer.invoke("backup:export"),
  importBackup: (): Promise<{ restored: boolean } | null> => ipcRenderer.invoke("backup:import"),
  loadIndex: (): Promise<string | null> => ipcRenderer.invoke("library:loadIndex"),
  saveIndex: (json: string): Promise<void> => ipcRenderer.invoke("library:saveIndex", json),
  readIndexLog: (): Promise<string> => ipcRenderer.invoke("library:readLog"),
  appendIndexLog: (lines: string): Promise<void> => ipcRenderer.invoke("library:appendLog", lines),
  clearIndexLog: (): Promise<void> => ipcRenderer.invoke("library:clearLog"),
});
