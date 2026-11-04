import { ipcMain, type BrowserWindow } from "electron";

/**
 * 无框主窗口（titleBarStyle: "hidden"）的窗口层 IPC。
 *
 * 原生标题栏没了之后，右上角三键由系统绘制（titleBarOverlay），
 * 它的颜色必须跟全局主题走，否则夜间主题下右侧会挂一根白条。
 * 渲染层只传「现场从 DOM token 读出的 bg/fg」——色值的唯一来源仍是
 * tokens.css，主进程不存第二份。
 */
export function registerWindowIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle("win:overlayTheme", (_e, bg: unknown, fg: unknown) => {
    // 只接受 #rrggbb；别的形状不喂给 Electron API
    const hex = (v: unknown): v is string =>
      typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
    if (!hex(bg) || !hex(fg)) return false;
    const win = getWin();
    // macOS / Linux 没有这套 overlay 能力（方法不存在或抛错），静默降级
    if (!win || typeof win.setTitleBarOverlay !== "function") return false;
    try {
      win.setTitleBarOverlay({ color: bg, symbolColor: fg });
      return true;
    } catch {
      return false;
    }
  });
}
