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
import { readKey, writeKey } from "./fs/kv.js";

let mini: BrowserWindow | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function mainWindow(): BrowserWindow | null {
  /* 歌词窗必须排除（2026-11-10 修 BUG）：此前只排除了 mini 自己，
     桌面歌词开着时 getAllWindows 会先捡到它 —— `focus` 聚焦的是歌词窗，
     `mini:forward` 把播放意图发给歌词窗（那边没有 handler）**全部静默丢失**。
     两窗都是 app:// 协议，用 URL 区分最稳。 */
  return (
    BrowserWindow.getAllWindows().find(
      (w) => w !== mini && !w.isDestroyed() && !w.webContents.getURL().includes("/lyric.html"),
    ) ?? null
  );
}

/** 位置持久化（P0-27）：拖动过程别每帧写盘，500ms 合并一次。 */
const saveGeometry = (): void => {
  if (!mini || mini.isDestroyed()) return;
  const [x, y] = mini.getPosition();
  void writeKey("mini-geometry", JSON.stringify({ x, y })).catch(() => undefined);
};

export function registerMiniIpc(): void {
  ipcMain.handle("mini:open", async () => {
    if (mini && !mini.isDestroyed()) {
      mini.focus();
      return;
    }
    // 位置持久化（P0-27）：与歌词窗同一套，坏档当没有
    let x: number | undefined;
    let y: number | undefined;
    try {
      const geo = JSON.parse((await readKey("mini-geometry")) ?? "{}") as { x?: number; y?: number };
      if (typeof geo.x === "number") x = geo.x;
      if (typeof geo.y === "number") y = geo.y;
    } catch {
      /* 坏档当没有 */
    }
    mini = new BrowserWindow({
      width: 420,
      // 2026-11-10 重设计：封面 64 + 标题/歌词/进度三行 + 上下呼吸（112 会把进度条压到边上）
      height: 136,
      ...(x !== undefined && y !== undefined ? { x, y } : {}),
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
    mini.on("moved", () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveGeometry, 500);
    });
    mini.on("close", saveGeometry);
    mini.on("closed", () => {
      mini = null;
    });
    void mini.loadURL("app://afeifei/mini.html");
  });

  /* 迷你窗就绪（2026-11-10 修 BUG）：桥只在 store 变化 / 500ms 节流点推送，
     暂停状态下开窗会一直挂"未在播放"。迷你窗挂载完喊一声，主窗桥立刻补推一次。 */
  ipcMain.on("mini:ready", () => {
    mainWindow()?.webContents.send("mini:hello");
  });

  // 迷你窗的意图 → 转给主窗渲染层 dispatch。主进程不认识"播放"，只搬运。
  // 例外是 focus（P0-27 双击封面）：窗口归主进程管，它自己处理，不往渲染层转。
  ipcMain.on("mini:action", (_e, action: unknown) => {
    if (typeof action !== "string") return;
    if (action === "focus") {
      const win = mainWindow();
      if (win && !win.isDestroyed()) {
        if (!win.isVisible()) win.show();
        win.focus();
      }
      return;
    }
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
