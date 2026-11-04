import path from "node:path";
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { dataDir } from "./paths.js";
import { initLog, log, error } from "./log/index.js";
import { registerIpc } from "./ipc/index.js";
import { startQqBackend } from "./net/qqBackend.js";
import { registerMiniIpc } from "./miniWindow.js";
import { registerLyricIpc } from "./lyricWindow.js";
import { MEDIA_SCHEME, STREAM_SCHEME, registerMediaProtocol, registerStreamProtocol } from "./media/protocol.js";
import { APP_SCHEME, registerAppProtocol } from "./host/index.js";
import { installCrashGuard } from "./crash.js";
import { startUpdateCheck } from "./update/checker.js";
import { registerMediaKeys, unregisterMediaKeys, type PlaybackCommand } from "./mediaKeys.js";
import { GlobalShortcutController } from "./globalShortcuts.js";
import { createTray, destroyTray } from "./tray.js";

// 必须一次性注册全部 scheme，且要在 app ready 之前 —— privileges 只在此时生效，
// 分多次调用会互相覆盖（见 host/index.ts）。
protocol.registerSchemesAsPrivileged([APP_SCHEME, MEDIA_SCHEME, STREAM_SCHEME]);

// userData 统一到打包名（appData/Afeifei 阿飞飞）：dev 模式 electron CLI 不读项目
// productName，会落进默认的 appData/Electron —— 登录态/设置与打包后互不相通
// （2026-11-03 实测踩过：dev 扫码拿到的 cookie 存在 Electron 目录里）。
// 必须在 ready 之前、单实例锁之前设置。
app.setName("Afeifei 阿飞飞");

// 崩溃兜底（M8）越早装越好：未捕获异常 / 渲染进程退出 → crash-*.log
installCrashGuard();

/** 主窗口（托盘/媒体键都要把它找回来；关窗只隐藏，不销毁）。 */
let mainWin: BrowserWindow | null = null;
/** 用户真的要退出（托盘「退出」/ 系统注销）：此时关窗才允许销毁。 */
let quitting = false;
/** 媒体键兜底通道的命令出口（createWindow 里赋值）。 */
let sendPlaybackCommand: ((cmd: PlaybackCommand) => void) | null = null;
/**
 * 媒体键归谁管：**等渲染层上报**。
 * 渲染层有 Chromium MediaSession（Windows 上 = SMTC 系统媒体面板）→ 由它接管，
 * 主进程把 globalShortcut 媒体键注销，避免同一次按键被两边各处理一遍（切两首）。
 * 渲染层报告不支持 → 才注册 globalShortcut 兜底。
 */
ipcMain.on("media-session:capability", (_e, supported: unknown) => {
  if (supported === true) {
    unregisterMediaKeys();
    log("main", "media session: Chromium MediaSession 可用，媒体键交给系统媒体面板");
    return;
  }
  if (sendPlaybackCommand) registerMediaKeys(sendPlaybackCommand);
  log("main", "media session: 不可用，媒体键退回 globalShortcut");
});

/**
 * 全局快捷键（A-24 可配置那半）：渲染层给绑定 → 这里注册 → 结果回报渲染层。
 * 主进程只做系统调用，播放语义仍在渲染层命令注册表里。
 */
const globalShortcuts = new GlobalShortcutController();
ipcMain.on("shortcuts:set", (_e, bindings: unknown) => {
  if (!Array.isArray(bindings)) return;
  const list = bindings.filter(
    (b): b is { action: string; accelerator: string } =>
      !!b && typeof (b as { action?: unknown }).action === "string" && typeof (b as { accelerator?: unknown }).accelerator === "string",
  );
  const results = globalShortcuts.apply(list, (action) => {
    if (!mainWin || mainWin.isDestroyed()) return;
    mainWin.webContents.send("shortcut:action", action);
  }, () => mainWin);
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("shortcuts:status", results);
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => {
  unregisterMediaKeys();
  globalShortcuts.dispose();
  destroyTray();
});

// 单实例锁放 M0（51 §1.7）：M5 的 afeifei:// 依赖它，双开会抢同一份队列与日志。
const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
} else {
  // afeifei:// 协议（M5）。**解析只在主进程**，渲染层只收结构化 intent（50 §9.5）。
  // Windows dev 下必须显式带 execPath 注册，打包后 exe 自动关联。
  if (process.platform === "win32" && !app.isPackaged) {
    app.setAsDefaultProtocolClient("afeifei", process.execPath, [path.resolve(process.argv[1] ?? ".")]);
  } else {
    app.setAsDefaultProtocolClient("afeifei");
  }

  /** 白名单：只有 play 一个 action，参数只收 id（+可选 source）。目录穿越没有入口——id 永远不拼路径。 */
  function parseSchemeUrl(raw: string): { action: "play"; id: string; source?: string } | null {
    try {
      const u = new URL(raw);
      if (u.protocol !== "afeifei:" || u.hostname !== "play") return null;
      const id = u.searchParams.get("id");
      if (!id || id.length === 0 || id.length > 1024) return null;
      const source = u.searchParams.get("source") ?? undefined;
      if (source && !/^[a-z][a-z0-9-]{0,31}$/.test(source)) return null;
      return { action: "play", id, source };
    } catch {
      return null;
    }
  }

  // 冷启动时渲染层还没挂订阅，send 会丢 —— 所以同时存 pending，渲染层就绪后主动拉一次
  let pendingScheme: { action: "play"; id: string; source?: string } | null = null;

  function dispatchSchemeUrl(raw: string): void {
    const parsed = parseSchemeUrl(raw);
    if (!parsed) {
      log("warn", `[scheme] 非白名单调用已拒绝：${raw.slice(0, 80)}`);
      return;
    }
    pendingScheme = parsed;
    BrowserWindow.getAllWindows()[0]?.webContents.send("scheme:url", parsed);
  }

  ipcMain.handle("scheme:poll", () => {
    const p = pendingScheme;
    pendingScheme = null;
    return p;
  });

  /** 从 argv 里找协议 URL（Windows 把 URL 追加在 argv 末尾）。 */
  const schemeFromArgv = (argv: string[]): string | null =>
    argv.find((a) => a.startsWith("afeifei://")) ?? null;

  app.on("second-instance", (_e, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    // 收进托盘后再启动一次 = 用户想把窗口叫回来（A-25），不能只 focus 一个隐藏窗口
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
    const url = schemeFromArgv(argv);
    if (url) dispatchSchemeUrl(url); // 热启动
  });

  app.on("open-url", (e, url) => {
    e.preventDefault();
    dispatchSchemeUrl(url); // macOS
  });

  initLog(dataDir());

  app.whenReady().then(() => {
    registerAppProtocol(path.join(__dirname, "renderer"));
    registerMediaProtocol();
    registerStreamProtocol(); // M6.1：远端音频代理（跨源直连进 EQ 图会被消成静音）
    registerIpc();
    registerMiniIpc();
    registerLyricIpc();
    startQqBackend(); // M6.1 P1：本地拉起 QQ 音乐 API 服务（失败只降级 QQ 功能，不阻塞窗口）

    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      // 布局下限：rail 5×44 + tail 4×34 ≈ 388，加顶栏与 console 后 620 才不裁「设置」入口；
      // 宽度给到 960 是因为页头（标题 + 统计 + 5 个排序 chip + 扫描按钮）再窄就把按钮压成竖排
      minWidth: 960,
      minHeight: 620,
      backgroundColor: "#0b0b0c",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    mainWin = win;

    // A-25：点 × 只是收进托盘（正在播的歌不该被误停）；真正退出走托盘「退出」或系统注销
    win.on("close", (e) => {
      if (quitting) return;
      e.preventDefault();
      win.hide();
    });
    win.on("closed", () => {
      if (mainWin === win) mainWin = null;
    });

    win.webContents.on("render-process-gone", (_e, details) => {
      error("main", "renderer gone:", details.reason);
    });

    win.loadURL("app://afeifei/index.html");
    log("main", "window ready");
    startUpdateCheck(win.webContents); // M8：启动 30s 后查一次新版本（非静默安装，只提示）

    // A-24 + A-25：媒体键与托盘共用同一条「命令名」通道，播放语义只在渲染层有一份
    const send = (cmd: PlaybackCommand): void => {
      if (!mainWin || mainWin.isDestroyed()) return;
      mainWin.webContents.send("player:command", cmd);
    };
    sendPlaybackCommand = send;
    // 媒体键**不在这里注册**：等渲染层上报 MediaSession 能力后再定（见文件顶部）
    createTray({ send, window: () => mainWin, quit: () => app.quit() });

    // 冷启动：argv 里带协议 URL（第二次实例走 second-instance，这里管第一次）
    const coldUrl = schemeFromArgv(process.argv);
    if (coldUrl) dispatchSchemeUrl(coldUrl);
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
