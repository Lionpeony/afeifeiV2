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
  scan: (dirs: string[]): Promise<string[]> => ipcRenderer.invoke("library:scan", dirs),
  // 曲库目录列表（M9）：持久化在 KV，扫描按列表重扫
  libraryRoots: (): Promise<string[]> => ipcRenderer.invoke("library:roots"),
  addLibraryRoot: (): Promise<string[] | null> => ipcRenderer.invoke("library:addRoot"),
  removeLibraryRoot: (dir: string): Promise<string[]> => ipcRenderer.invoke("library:removeRoot", dir),
  // 系统通知 + 开机自启（M9）
  notify: (payload: { title: string; body: string }): Promise<boolean> =>
    ipcRenderer.invoke("notify:show", payload),
  autoLaunch: (): Promise<boolean> => ipcRenderer.invoke("app:autoLaunch"),
  setAutoLaunch: (on: boolean): Promise<boolean> => ipcRenderer.invoke("app:setAutoLaunch", on),
  readTags: (filePaths: string[]): Promise<unknown[]> => ipcRenderer.invoke("library:readTags", filePaths),
  statFiles: (filePaths: string[]): Promise<{ path: string; size: number; mtimeMs: number }[]> =>
    ipcRenderer.invoke("library:statFiles", filePaths),
  cover: (filePath: string): Promise<string | null> => ipcRenderer.invoke("library:cover", filePath),
  /** 本地词原文（同名 .lrc → 内嵌标签）；解析与 LRCLIB 兜底在渲染层 */
  localLyric: (filePath: string): Promise<{ text: string; source: "local" | "embedded" } | null> =>
    ipcRenderer.invoke("library:localLyric", filePath),
  /** 出站 HTTP：让主进程发，绕开渲染层的 CSP 与 CORS（只给 LRCLIB 兜底用） */
  fetchJson: (
    url: string,
    options?: Record<string, unknown>,
  ): Promise<{ status: number; json: unknown; setCookie: string[] }> =>
    ipcRenderer.invoke("net:fetchJson", url, options),

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

  // 桌面歌词窗（M9-1）：同迷你窗，只推投影；解锁在主进程（穿透态窗口收不到鼠标）
  openLyric: (): Promise<void> => ipcRenderer.invoke("lyric:open"),
  unlockLyric: (): Promise<void> => ipcRenderer.invoke("lyric:unlock"),
  pushLyricState: (json: string): void => ipcRenderer.send("lyric:state", json),

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

  // 媒体键 / 托盘（A-24 A-25）：主进程只发命令名，播放语义在渲染层命令注册表里
  onPlaybackCommand: (cb: (cmd: string) => void): void => {
    ipcRenderer.on("player:command", (_e, cmd: unknown) => {
      if (typeof cmd === "string") cb(cmd);
    });
  },
  /**
   * 上报「Chromium MediaSession 能不能用」：能 → 媒体键交给系统媒体面板（Windows SMTC），
   * 不能 → 主进程注册 globalShortcut 媒体键兜底。两边同时在会双触发（按一次切两首）。
   */
  setMediaSessionSupported: (supported: boolean): void => {
    ipcRenderer.send("media-session:capability", supported);
  },
  /** 全局快捷键（A-24 可配置那半）：渲染层给绑定，主进程注册并回报结果。 */
  setGlobalShortcuts: (bindings: { action: string; accelerator: string }[]): void => {
    ipcRenderer.send("shortcuts:set", bindings);
  },
  onGlobalShortcut: (cb: (action: string) => void): void => {
    ipcRenderer.on("shortcut:action", (_e, action: unknown) => {
      if (typeof action === "string") cb(action);
    });
  },
  onGlobalShortcutStatus: (cb: (results: { action: string; accelerator: string; registered: boolean }[]) => void): void => {
    ipcRenderer.on("shortcuts:status", (_e, results: unknown) => {
      if (Array.isArray(results)) cb(results as { action: string; accelerator: string; registered: boolean }[]);
    });
  },
  /** 托盘只显示，不判断：这一行就是它需要的全部信息 */
  pushTrayState: (state: { playing: boolean; title: string | null }): void => {
    ipcRenderer.send("tray:state", {
      playing: state.playing === true,
      title: typeof state.title === "string" && state.title ? state.title : null,
    });
  },

  // 主题包（主进程只负责文件读写，不认识 token）
  exportTheme: (json: string): Promise<boolean> => ipcRenderer.invoke("theme:export", json),
  importTheme: (): Promise<unknown> => ipcRenderer.invoke("theme:import"),

  // 下载（M7）：系统调用面。队列/并发/配额在渲染层环 1
  downloadDir: (): Promise<string> => ipcRenderer.invoke("download:dir"),
  downloadSetDir: (): Promise<string | null> => ipcRenderer.invoke("download:setDir"),
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

  // 更新检查（M8）：主进程启动 30s 查一次，有新版本才推
  onUpdateAvailable: (cb: (v: { version: string; url: string }) => void): void => {
    ipcRenderer.on("update:available", (_e, v: unknown) => {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as { version?: unknown }).version === "string" &&
        typeof (v as { url?: unknown }).url === "string"
      ) {
        cb(v as { version: string; url: string });
      }
    });
  },
  lastCrash: (): Promise<{ at: string; kind: string; file: string } | null> =>
    ipcRenderer.invoke("app:lastCrash"),
  markCrashSeen: (file: string): Promise<void> => ipcRenderer.invoke("app:markCrashSeen", file),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("app:openExternal", url),

  // 数据备份（恢复后需重启生效）
  exportBackup: (): Promise<string | null> => ipcRenderer.invoke("backup:export"),
  importBackup: (): Promise<{ restored: boolean } | null> => ipcRenderer.invoke("backup:import"),
  loadIndex: (): Promise<string | null> => ipcRenderer.invoke("library:loadIndex"),
  saveIndex: (json: string): Promise<void> => ipcRenderer.invoke("library:saveIndex", json),
  readIndexLog: (): Promise<string> => ipcRenderer.invoke("library:readLog"),
  appendIndexLog: (lines: string): Promise<void> => ipcRenderer.invoke("library:appendLog", lines),
  clearIndexLog: (): Promise<void> => ipcRenderer.invoke("library:clearLog"),
});
