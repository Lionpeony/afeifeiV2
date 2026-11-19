/**
 * 系统托盘（A-25）：**同一状态的第三视图**，和迷你窗一样只显示、不判断。
 *
 * 状态流：
 *   渲染层 store → 一行 {playing,title} → 主进程 → 托盘菜单
 *   托盘点击 → 命令名 → 渲染层命令注册表 → dispatch（唯一写者）
 * 主进程不认识"这首歌是不是已经播完"，只照抄那一行字。
 */
import { BrowserWindow, Menu, Tray, ipcMain, nativeImage, type MenuItemConstructorOptions } from "electron";
import path from "node:path";
import { trayItems, trayTitle, type TrayState } from "./trayMenu.js";
import type { PlaybackCommand } from "./mediaKeys.js";

export interface TrayDeps {
  /** 把命令名交给渲染层（媒体键共用同一条） */
  send(cmd: PlaybackCommand): void;
  /** 主窗口；可能还没建好或被销毁 */
  window(): BrowserWindow | null;
  /** 真正退出应用（关窗只是隐藏） */
  quit(): void;
}

let tray: Tray | null = null;
let deps: TrayDeps | null = null;
let state: TrayState = { playing: false, title: null };

/**
 * 图标：与应用图标同一套拨片视觉（build/icon.svg 由 scripts/render-icon.mjs 渲染出的
 * tray-pick@1x/@2x.png，已随 renderer 资源进 dist）。16/32 双档按 DPI 装载，
 * 托盘小图只留拨片剪影（无投影，投影在小尺寸是糊的）。
 */
function trayIcon() {
  const img = nativeImage.createEmpty();
  const rep = (scaleFactor: number): Electron.NativeImage => {
    const file = path.join(__dirname, "..", "renderer", "assets", scaleFactor === 1 ? "tray-pick@1x.png" : "tray-pick@2x.png");
    return nativeImage.createFromPath(file);
  };
  for (const sf of [1, 2]) {
    const src = rep(sf);
    if (!src.isEmpty()) img.addRepresentation({ scaleFactor: sf, buffer: src.toPNG() });
  }
  return img;
}

function showWindow(): void {
  const win = deps?.window();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function run(id: string): void {
  if (!deps) return;
  if (id === "toggle" || id === "prev" || id === "next") {
    deps.send(id);
    return;
  }
  if (id === "show") showWindow();
  if (id === "quit") deps.quit();
}

function rebuild(): void {
  if (!tray) return;
  const template: MenuItemConstructorOptions[] = trayItems(state).map((it) => {
    if (it.id === "sep") return { type: "separator" };
    if (it.id === "head") return { label: it.label, enabled: false };
    return { label: it.label, enabled: it.enabled, click: () => run(it.id) };
  });
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(trayTitle(state));
}

export function createTray(d: TrayDeps): void {
  if (tray) return;
  deps = d;
  tray = new Tray(trayIcon());
  // 左键单击/双击都回到主窗口：托盘的常见期待，不需要用户猜
  tray.on("click", showWindow);
  tray.on("double-click", showWindow);

  ipcMain.on("tray:state", (_e, next: unknown) => {
    if (!next || typeof next !== "object") return;
    const n = next as { playing?: unknown; title?: unknown };
    const title = typeof n.title === "string" && n.title ? n.title : null;
    const playing = n.playing === true;
    if (playing === state.playing && title === state.title) return; // 没变化不重建菜单
    state = { playing, title };
    rebuild();
  });

  rebuild();
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
  deps = null;
}
