import path from "node:path";
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { dataDir } from "./paths.js";
import { initLog, log, error } from "./log/index.js";
import { registerIpc } from "./ipc/index.js";
import { startQqBackend } from "./net/qqBackend.js";
import { registerMiniIpc } from "./miniWindow.js";
import { MEDIA_SCHEME, registerMediaProtocol } from "./media/protocol.js";
import { APP_SCHEME, registerAppProtocol } from "./host/index.js";

// 必须一次性注册全部 scheme，且要在 app ready 之前 —— privileges 只在此时生效，
// 分多次调用会互相覆盖（见 host/index.ts）。
protocol.registerSchemesAsPrivileged([APP_SCHEME, MEDIA_SCHEME]);

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
    registerIpc();
    registerMiniIpc();
    startQqBackend(); // M6.1 P1：本地拉起 QQ 音乐 API 服务（失败只降级 QQ 功能，不阻塞窗口）

    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      backgroundColor: "#0b0b0c",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.webContents.on("render-process-gone", (_e, details) => {
      error("main", "renderer gone:", details.reason);
    });

    win.loadURL("app://afeifei/index.html");
    log("main", "window ready");

    // 冷启动：argv 里带协议 URL（第二次实例走 second-instance，这里管第一次）
    const coldUrl = schemeFromArgv(process.argv);
    if (coldUrl) dispatchSchemeUrl(coldUrl);
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
