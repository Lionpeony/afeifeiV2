import path from "node:path";
import { app, BrowserWindow, protocol } from "electron";
import { dataDir } from "./paths.js";
import { initLog, log, error } from "./log/index.js";
import { registerIpc } from "./ipc/index.js";
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
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  initLog(dataDir());

  app.whenReady().then(() => {
    registerAppProtocol(path.join(__dirname, "renderer"));
    registerMediaProtocol();
    registerIpc();

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
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
