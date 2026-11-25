/**
 * Windows 任务栏集成（P1 系统集成）：AppUserModelId + 缩略图按钮 + 任务栏进度。
 *
 * 纪律和托盘一致：主进程不认识播放语义，只照抄渲染层上报的一行状态
 * （playing / title），按钮只发命令名（`PlaybackCommand`），播放语义仍只在渲染层
 * 命令注册表里有一份。
 *
 * 进度条只在渲染层有确定进度时显示（扫描 / 批量下载），结束必须回 null，
 * 否则任务栏会一直挂着一根绿条。
 */
import { app, ipcMain, nativeImage, type BrowserWindow } from "electron";
import path from "node:path";
import { log } from "./log/index.js";

const AUMID = "com.afeifei.player";

/**
 * 任务栏分组与通知归属都靠它（未打包的 electron.exe 上尤其明显：
 * 不设的话窗口不认自己的图标/通知）。必须在 app ready 之前调用。
 */
export function setAppId(): void {
  if (process.platform !== "win32") return;
  try {
    app.setAppUserModelId(AUMID);
  } catch (err) {
    log("warn", `[taskbar] setAppUserModelId 失败：${String(err)}`);
  }
}

type IconName = "prev" | "play" | "pause" | "next";

/** 32px 白字透明图（scripts/make-thumbar.mjs 生成，build.mjs 拷进 dist/renderer/assets）。 */
const iconCache = new Map<IconName, Electron.NativeImage>();
function icon(name: IconName): Electron.NativeImage {
  const hit = iconCache.get(name);
  if (hit) return hit;
  const file = path.join(__dirname, "renderer", "assets", `thumb-${name}.png`);
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) log("warn", `[taskbar] 缩略图按钮图标缺失：${file}`);
  iconCache.set(name, img);
  return img;
}

interface TaskbarState {
  playing: boolean;
  title: string | null;
}

export interface TaskbarDeps {
  /** 主窗口；可能还没建好或被销毁 */
  win(): BrowserWindow | null;
  /** 把命令名交给渲染层（与托盘/媒体键共用一条通道） */
  send(cmd: "toggle" | "next" | "prev"): void;
}

let deps: TaskbarDeps | null = null;
let state: TaskbarState = { playing: false, title: null };
let progress: number | null = null;

/** 缩略图按钮 + 进度条都是 Windows 才有；其他平台调用是 no-op（Electron 自己会忽略）。 */
export function refreshTaskbar(): void {
  const win = deps?.win();
  if (!win || win.isDestroyed()) return;
  if (process.platform !== "win32") return;
  const d = deps!;
  try {
    win.setThumbarButtons([
      { tooltip: "上一首", icon: icon("prev"), click: () => d.send("prev") },
      {
        tooltip: state.playing ? "暂停" : "播放",
        icon: icon(state.playing ? "pause" : "play"),
        click: () => d.send("toggle"),
      },
      { tooltip: "下一首", icon: icon("next"), click: () => d.send("next") },
    ]);
  } catch (err) {
    log("warn", `[taskbar] setThumbarButtons 失败：${String(err)}`);
  }
  win.setProgressBar(progress ?? -1);
}

export function installTaskbar(d: TaskbarDeps): void {
  deps = d;
  ipcMain.on("taskbar:state", (_e, next: unknown) => {
    if (!next || typeof next !== "object") return;
    const n = next as { playing?: unknown; title?: unknown };
    const playing = n.playing === true;
    const title = typeof n.title === "string" && n.title ? n.title : null;
    if (playing === state.playing && title === state.title) return;
    state = { playing, title };
    try {
      const win = deps?.win();
      if (win && !win.isDestroyed()) win.setThumbnailToolTip(title ? `阿飞飞 · ${title}` : "阿飞飞");
    } catch {
      /* 窗口正在销毁：下一次 refresh 会补 */
    }
    refreshTaskbar();
  });
  ipcMain.on("taskbar:progress", (_e, next: unknown) => {
    const v = next && typeof next === "object" ? (next as { value?: unknown }).value : undefined;
    const value = typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
    if (value === progress) return;
    progress = value;
    const win = deps?.win();
    if (win && !win.isDestroyed()) win.setProgressBar(value ?? -1);
  });
  refreshTaskbar();
}
