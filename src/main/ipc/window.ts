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
  ipcMain.handle("win:minimize", () => {
    getWin()?.minimize();
  });
  ipcMain.handle("win:toggleMax", () => {
    const win = getWin();
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle("win:close", () => {
    getWin()?.close();
  });
  ipcMain.handle("win:isMaximized", () => getWin()?.isMaximized() ?? false);
  // 全屏播放模式：setFullScreen(true/false)；不传参=翻转
  ipcMain.handle("win:fullscreen", (_e, on?: boolean) => {
    const win = getWin();
    if (!win) return false;
    win.setFullScreen(typeof on === "boolean" ? on : !win.isFullScreen());
    return win.isFullScreen();
  });
  ipcMain.handle("win:isFullscreen", () => getWin()?.isFullScreen() ?? false);

  // 自绘三键后不再启用 titleBarOverlay。保留通道让旧渲染层调用时安静返回 false，
  // 避免 setTitleBarOverlay 把系统原生按钮重新挂回来。
  ipcMain.handle("win:overlayTheme", () => false);
}
