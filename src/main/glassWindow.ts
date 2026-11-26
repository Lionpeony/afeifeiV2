/**
 * 玻璃明暗开关彩蛋窗：自包含 WebGL2 页面（app://afeifei/glass.html），
 * 独立 BrowserWindow，主流程零 WebGL 开销。无 preload —— 页面不写任何主进程状态。
 */
import { BrowserWindow, ipcMain } from "electron";

const SIZE = { width: 560, height: 400 };

let glass: BrowserWindow | null = null;

export function registerGlassIpc(): void {
  const open = (): void => {
    if (glass && !glass.isDestroyed()) {
      glass.focus();
      return;
    }
    glass = new BrowserWindow({
      ...SIZE,
      frame: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      // 深色底：shader 首帧渲染前的极短窗口不闪白
      backgroundColor: "#0E1017",
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    glass.once("ready-to-show", () => glass?.show());
    glass.on("closed", () => {
      glass = null;
    });
    void glass.loadURL("app://afeifei/glass.html");
  };

  ipcMain.handle("glass:open", () => open());
}
