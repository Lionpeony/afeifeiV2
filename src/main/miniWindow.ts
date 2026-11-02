/**
 * 迷你窗（M5）：**同一状态的第二视图，不是第二份状态**（50 §16）。
 *
 * 状态流是单向的：
 *   主窗 store → 投影快照 → 主进程 → 迷你窗（只渲染）
 *   迷你窗按钮 → 主进程 → 主窗 dispatch（唯一写者）→ 再广播回来
 * 所以"迷你窗里暂停，主窗同步暂停"是**同一次 dispatch** —— 迷你窗自己不写状态。
 */
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";

let mini: BrowserWindow | null = null;

function mainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((w) => w !== mini && !w.isDestroyed()) ?? null;
}

export function registerMiniIpc(): void {
  ipcMain.handle("mini:open", () => {
    if (mini && !mini.isDestroyed()) {
      mini.focus();
      return;
    }
    mini = new BrowserWindow({
      width: 420,
      height: 96,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, "mini-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mini.setAlwaysOnTop(true, "screen-saver");
    mini.on("closed", () => {
      mini = null;
    });
    void mini.loadURL("app://afeifei/mini.html");
  });

  // 迷你窗的意图 → 转给主窗渲染层 dispatch。主进程不认识"播放"，只搬运。
  ipcMain.on("mini:action", (_e, action: unknown) => {
    if (typeof action !== "string") return;
    mainWindow()?.webContents.send("mini:forward", action);
  });

  // 主窗的投影快照 → 广播给迷你窗。主进程不存状态（转发后即弃）。
  ipcMain.on("mini:state", (_e, json: unknown) => {
    if (typeof json !== "string") return;
    if (mini && !mini.isDestroyed()) mini.webContents.send("mini:state", json);
  });

  ipcMain.on("mini:close", () => {
    mini?.close();
  });
}
