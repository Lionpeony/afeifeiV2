/**
 * 全局快捷键注册（A-24 的可配置那半）。
 *
 * **抄 Twilight_Echo**（`src\main\integrations\shortcutsTray.ts` 的
 * `registerPlayerShortcuts`：先全量注销再全量注册、逐项收集注册结果、
 * 失败原因回传渲染层），按 folia-major 的做法把判定放在渲染层规则层
 * （`renderer/domain/shortcuts`），主进程只做**系统调用**：注册 + 转发。
 *
 * 语义：命令名（`play-pause` / `next` …）→ 渲染层命令注册表，本进程不认识播放语义。
 */
import { BrowserWindow, globalShortcut } from "electron";
import { log } from "./log/index.js";
import { toggleLyricWindow } from "./lyricWindow.js";

export interface ShortcutRequest {
  action: string;
  accelerator: string;
}

export interface ShortcutResult {
  action: string;
  accelerator: string;
  /** 注册成功与否（失败通常是被别的软件抢了）。 */
  registered: boolean;
}

/** 只有这几个动作由主进程自己处理（要操作窗口本身），其余转给渲染层。 */
const WINDOW_ACTIONS = new Set(["toggle-window", "toggle-lyric"]);

export class GlobalShortcutController {
  /** 当前生效的绑定（注销时要用）。 */
  private current: ShortcutRequest[] = [];

  /**
   * 全量重注册：先注销旧的，再注册新的。
   * 注册失败不抛 —— 只把结果回报给渲染层，由设置页显示"被占用"。
   */
  apply(
    bindings: ShortcutRequest[],
    sendAction: (action: string) => void,
    window: () => BrowserWindow | null,
  ): ShortcutResult[] {
    for (const b of this.current) {
      try {
        globalShortcut.unregister(b.accelerator);
      } catch (err) {
        log("warn", `[shortcut] 注销 ${b.accelerator} 抛错：${String(err)}`);
      }
    }
    this.current = [];

    const results: ShortcutResult[] = [];
    for (const b of bindings) {
      if (!b || typeof b.accelerator !== "string" || b.accelerator.length === 0) continue;
      let ok = false;
      try {
        ok = globalShortcut.register(b.accelerator, () => {
          if (b.action === "toggle-window") {
            toggleWindow(window());
            return;
          }
          if (b.action === "toggle-lyric") {
            toggleLyricWindow();
            return;
          }
          sendAction(b.action);
        });
      } catch (err) {
        log("warn", `[shortcut] 注册 ${b.accelerator} 抛错：${String(err)}`);
      }
      if (ok) {
        this.current.push(b);
        log("main", `[shortcut] 已注册 ${b.accelerator}（${b.action}）`);
      } else {
        log("warn", `[shortcut] ${b.accelerator}（${b.action}）未注册，可能被其他应用占用`);
      }
      results.push({ action: b.action, accelerator: b.accelerator, registered: ok });
    }
    return results;
  }

  dispose(): void {
    for (const b of this.current) {
      try {
        globalShortcut.unregister(b.accelerator);
      } catch (err) {
        log("warn", `[shortcut] 注销 ${b.accelerator} 抛错：${String(err)}`);
      }
    }
    this.current = [];
  }
}

/** 显示 / 隐藏主窗（托盘模式下的标准动作）。 */
function toggleWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && win.isFocused()) {
    win.hide();
    return;
  }
  if (win.isVisible()) {
    win.focus();
    return;
  }
  win.show();
  win.focus();
}
