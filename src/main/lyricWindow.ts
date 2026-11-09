/**
 * 桌面歌词窗（M9-1）：迷你窗同款模式——**同一状态的第二视图，不是第二份状态**。
 *
 * 状态流单向：主窗 store → 歌词桥（文本变了才推）→ 主进程转手 → 歌词窗（只渲染）。
 * 主进程不认识歌词，只管窗：置顶、透明、两种鼠标态（interactive / pass）与位置持久化。
 * 穿透态（pass）不挡任何桌面操作；解锁只能从主窗「桌面歌词」按钮回去（穿透态收不到鼠标）。
 */
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import { readKey, writeKey } from "./fs/kv.js";

type MouseMode = "interactive" | "pass";

let lyric: BrowserWindow | null = null;
let mode: MouseMode = "interactive";
/** 歌词窗当前投影（模式切换时重发一次，让工具条跟着显隐；不另开频道）。
    解析一次存对象（2026-11-10）：此前每次 forward 都 JSON.parse 一遍，逐字歌词高频推送时是主进程小热点。 */
let lastObj: Record<string, unknown> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const LYRIC_MIN_H = 96;
const LYRIC_MAX_H = 420;

const saveGeometry = (): void => {
  if (!lyric || lyric.isDestroyed()) return;
  const [x, y] = lyric.getPosition();
  void writeKey("lyric-geometry", JSON.stringify({ x, y })).catch(() => undefined);
};

function setMode(next: MouseMode): void {
  mode = next;
  // pass：整窗穿透但保留 mousemove（forward:true），歌词浮在桌面上不挡任何操作
  lyric?.setIgnoreMouseEvents(mode === "pass", { forward: true });
  void writeKey("lyric-mode", mode).catch(() => undefined);
  forward();
}

function forward(): void {
  if (!lyric || lyric.isDestroyed()) return;
  const obj = lastObj ? { ...lastObj, mode } : { mode };
  lyric.webContents.send("lyric:state", JSON.stringify(obj));
}

/** 桌面歌词窗开关（全局快捷键用）：开着就关，没开就开。 */
export function toggleLyricWindow(): void {
  if (lyric && !lyric.isDestroyed()) {
    lyric.close();
    return;
  }
  void openLyricWindow();
}

export function registerLyricIpc(): void {
  // 桌面歌词窗开关（全局快捷键用）：状态只有主进程知道（渲染层看不到别的窗口）。
  ipcMain.handle("lyric:toggle", () => {
    toggleLyricWindow();
    return true;
  });

  ipcMain.handle("lyric:open", () => openLyricWindow());

  // 歌词窗意图：目前只有"锁定"（切穿透）。主进程只搬运。
  ipcMain.on("lyric:action", (_e, action: unknown) => {
    if (action === "lock") setMode("pass");
  });

  ipcMain.handle("lyric:unlock", () => {
    if (lyric && !lyric.isDestroyed() && mode === "pass") setMode("interactive");
  });

  // 主窗歌词桥 → 歌词窗。主进程不存状态（lastObj 只为模式切换重发）。
  ipcMain.on("lyric:state", (_e, json: unknown) => {
    if (typeof json !== "string") return;
    try {
      lastObj = JSON.parse(json) as Record<string, unknown>;
    } catch {
      lastObj = null;
    }
    forward();
  });

  /* 歌词窗申请改高（2026-11-10 修 BUG）：窗高原写死 132px，字号放大到 64px 时
     两行歌词被 overflow:hidden 裁掉，渲染层没有任何 resize 通道。
     高度从上沿向下长（y 不动），宽度不变；夹紧在 96–420。 */
  ipcMain.on("lyric:resize", (_e, h: unknown) => {
    if (typeof h !== "number" || !Number.isFinite(h)) return;
    if (!lyric || lyric.isDestroyed()) return;
    const next = Math.min(LYRIC_MAX_H, Math.max(LYRIC_MIN_H, Math.round(h)));
    const [w] = lyric.getSize();
    if (lyric.getBounds().height !== next) lyric.setSize(w, next);
  });

  ipcMain.on("lyric:close", () => {
    lyric?.close();
  });
}

/** 开桌面歌词窗（已开着则解锁 / 聚焦）。open 与 toggle 共用这一份。 */
async function openLyricWindow(): Promise<void> {
  if (lyric && !lyric.isDestroyed()) {
    // 已开着：穿透态就解锁，否则聚焦。这个按钮兼任"解锁"入口（穿透态窗口收不到鼠标）
    if (mode === "pass") setMode("interactive");
    else lyric.focus();
    return;
  }
    let x: number | undefined;
    let y: number | undefined;
    try {
      const geo = JSON.parse((await readKey("lyric-geometry")) ?? "{}") as { x?: number; y?: number };
      if (typeof geo.x === "number") x = geo.x;
      if (typeof geo.y === "number") y = geo.y;
    } catch {
      /* 坏档当没有 */
    }

    lyric = new BrowserWindow({
      width: 720,
      // 两行（主句 + 译文）+ 底部进度线；110 只够一行，翻译会被裁掉
      height: 132,
      ...(x !== undefined && y !== undefined ? { x, y } : {}),
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, "lyric-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    lyric.setAlwaysOnTop(true, "screen-saver");
    lyric.on("moved", () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveGeometry, 500); // 拖动过程别每帧写盘
    });
    lyric.on("close", saveGeometry);
    lyric.on("closed", () => {
      lyric = null;
    });
    mode = (await readKey("lyric-mode")) === "pass" ? "pass" : "interactive";
    if (mode === "pass") lyric.setIgnoreMouseEvents(true, { forward: true });
    void lyric.loadURL("app://afeifei/lyric.html").then(forward);
}
