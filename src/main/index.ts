import path from "node:path";
import { app, BrowserWindow } from "electron";
import { dataDir } from "./paths.js";
import { initLog, log } from "./log/index.js";

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
    win.loadFile(path.join(__dirname, "renderer", "index.html"));
    log("main", "window ready");
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
