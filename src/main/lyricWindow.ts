/**
 * 桌面歌词窗（M9-1）：迷你窗同款模式——**同一状态的第二视图，不是第二份状态**。
 *
 * 状态流单向：主窗 store → 歌词桥（文本变了才推）→ 主进程转手 → 歌词窗（只渲染）。
 * 主进程不认识歌词，只管窗：置顶、透明、两种鼠标态（interactive / pass）与位置持久化。
 * 穿透态（pass）不挡任何桌面操作；解锁走底栏「桌面歌词」按钮或全局快捷键。
 * 歌词窗的播控意图（上一首/暂停/下一首/喜欢）转给主窗 dispatch，主进程不认播放语义。
 */
import path from "node:path";
import { BrowserWindow, ipcMain, Menu, screen, type MenuItemConstructorOptions } from "electron";
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
const SNAP = 12;

/** 主窗（排除歌词窗与迷你窗）：播控意图最后都回到它那里 dispatch。 */
function mainWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((w) => {
      if (w === lyric || w.isDestroyed()) return false;
      const url = w.webContents.getURL();
      return !url.includes("/lyric.html") && !url.includes("/mini.html");
    }) ?? null
  );
}

function focusMain(): void {
  const win = mainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

function forwardAction(action: string): void {
  mainWindow()?.webContents.send("lyric:forward", action);
}

function sendPref(cmd: string): void {
  if (!lyric || lyric.isDestroyed()) return;
  lyric.webContents.send("lyric:pref", cmd);
}

/** 右键 / 工具条「⋯」共用的原生菜单：不受歌词窗高度限制，也不会被裁。 */
function showMenu(): void {
  if (!lyric || lyric.isDestroyed()) return;
  const template: MenuItemConstructorOptions[] = [
    { label: "上一首", click: () => forwardAction("prev") },
    { label: "播放 / 暂停", click: () => forwardAction("toggle") },
    { label: "下一首", click: () => forwardAction("next") },
    { label: "喜欢", click: () => forwardAction("like") },
    { type: "separator" },
    { label: "字号放大", click: () => sendPref("font+") },
    { label: "字号缩小", click: () => sendPref("font-") },
    {
      label: "底色",
      submenu: [
        { label: "纸签", click: () => sendPref("paper:paper") },
        { label: "半透", click: () => sendPref("paper:glass") },
        { label: "纯文字", click: () => sendPref("paper:text") },
        { label: "夜纸", click: () => sendPref("paper:night") },
      ],
    },
    { type: "separator" },
    { label: "锁定（鼠标穿透）", click: () => setMode("pass") },
    { label: "回到主窗", click: () => focusMain() },
    { label: "关闭歌词窗", click: () => lyric?.close() },
  ];
  Menu.buildFromTemplate(template).popup({ window: lyric });
}

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

const clampAxis = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max));
const snapAxis = (v: number, start: number, end: number): number => {
  if (Math.abs(v - start) <= SNAP) return start;
  if (Math.abs(end - v) <= SNAP) return end;
  return v;
};

/** 把窗口夹进最近的可见屏（换显示器 / 拔副屏后不丢），可选靠边吸附。 */
function placeVisible(doSnap: boolean): void {
  if (!lyric || lyric.isDestroyed()) return;
  const [x, y] = lyric.getPosition();
  const [w, h] = lyric.getSize();
  const area = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
  const right = area.x + area.width - w;
  const bottom = area.y + area.height - h;
  let nx = clampAxis(x, area.x, right);
  let ny = clampAxis(y, area.y, bottom);
  if (doSnap) {
    nx = snapAxis(nx, area.x, right);
    ny = snapAxis(ny, area.y, bottom);
  }
  if (Math.round(nx) !== x || Math.round(ny) !== y) {
    lyric.setPosition(Math.round(nx), Math.round(ny));
  }
}

const saveAndSnap = (): void => {
  placeVisible(true);
  saveGeometry();
};

/** 桌面歌词窗开关（底栏按钮 / 全局快捷键）：开着就关，没开就开。
 *  例外（2026-11-18 修 BUG）：穿透态收不到鼠标，如果这里直接 close，
 *  用户锁上之后就再也解不开、也关不掉。所以第一次点只解锁，再点才关。 */
export type LyricToggleResult = "opened" | "closed" | "unlocked";

export function toggleLyricWindow(): LyricToggleResult {
  if (lyric && !lyric.isDestroyed()) {
    if (mode === "pass") {
      setMode("interactive");
      return "unlocked";
    }
    lyric.close();
    return "closed";
  }
  void openLyricWindow();
  return "opened";
}

export function registerLyricIpc(): void {
  // 桌面歌词窗开关（状态只有主进程知道）：返回值告诉渲染层刚才做了什么，
  // "unlocked" 时底栏按钮要提示用户已经解锁（否则看起来像点了个寂寞）
  ipcMain.handle("lyric:toggle", () => toggleLyricWindow());

  ipcMain.handle("lyric:open", () => openLyricWindow());

  // 歌词窗意图：锁定 / 菜单由主进程处理，播控与喜欢转给主窗。
  ipcMain.on("lyric:action", (_e, action: unknown) => {
    if (typeof action !== "string") return;
    if (action === "lock") setMode("pass");
    else if (action === "menu") showMenu();
    else if (action === "focus") focusMain();
    else if (action === "prev" || action === "toggle" || action === "next" || action === "like") {
      forwardAction(action);
    }
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
     高度从上沿向下长（y 不动），宽度不变；夹紧在 96–420，再确保不出屏。 */
  ipcMain.on("lyric:resize", (_e, h: unknown) => {
    if (typeof h !== "number" || !Number.isFinite(h)) return;
    if (!lyric || lyric.isDestroyed()) return;
    const next = Math.min(LYRIC_MAX_H, Math.max(LYRIC_MIN_H, Math.round(h)));
    const [w] = lyric.getSize();
    if (lyric.getBounds().height !== next) {
      lyric.setSize(w, next);
      placeVisible(false);
    }
  });

  ipcMain.on("lyric:close", () => {
    lyric?.close();
  });

  // 换显示器 / 拔副屏 / 改分辨率：把歌词窗拉回可见屏，别让它"消失"在屏幕外。
  screen.on("display-removed", () => placeVisible(false));
  screen.on("display-metrics-changed", () => placeVisible(false));
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
  placeVisible(false); // 坏位置 / 换过屏的存档：先夹回可见区域
  lyric.on("moved", () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAndSnap, 500); // 拖动过程别每帧写盘；松手后靠边吸附
  });
  lyric.on("close", saveGeometry);
  lyric.on("closed", () => {
    lyric = null;
  });
  // 右键菜单（拖动区可能吞掉右键，工具条上的「⋯」是等价入口）
  lyric.webContents.on("context-menu", () => showMenu());
  mode = (await readKey("lyric-mode")) === "pass" ? "pass" : "interactive";
  if (mode === "pass") lyric.setIgnoreMouseEvents(true, { forward: true });
  void lyric.loadURL("app://afeifei/lyric.html").then(forward);
}
