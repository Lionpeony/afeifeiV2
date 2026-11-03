/**
 * 系统托盘（A-25）：**同一状态的第三视图**，和迷你窗一样只显示、不判断。
 *
 * 状态流：
 *   渲染层 store → 一行 {playing,title} → 主进程 → 托盘菜单
 *   托盘点击 → 命令名 → 渲染层命令注册表 → dispatch（唯一写者）
 * 主进程不认识"这首歌是不是已经播完"，只照抄那一行字。
 */
import { BrowserWindow, Menu, Tray, ipcMain, nativeImage, type MenuItemConstructorOptions } from "electron";
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
 * 图标：16×16 的朱砂圆片，中间留一个小孔（唱片感）。
 * 用代码画而不是塞一个 .ico —— 仓库里不放二进制资源，打包器也不用处理 asset。
 * Windows 的 createFromBitmap 是 BGRA，其他平台是 RGBA，所以红蓝两通道按平台换位。
 */
function trayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const bgra = process.platform === "win32";
  const [r, g, b] = [0xc0, 0x2f, 0x26];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d2 = (x - c) ** 2 + (y - c) ** 2;
      if (d2 > 49 || d2 < 2) continue; // 半径 7，中心 1.4 留孔
      const i = (y * size + x) * 4;
      buf[i] = bgra ? b : r;
      buf[i + 1] = g;
      buf[i + 2] = bgra ? r : b;
      buf[i + 3] = 0xff;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
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
