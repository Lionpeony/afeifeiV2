/**
 * 全局快捷键注册（A-24 的可配置那半）。
 *
 * **抄 Twilight_Echo**（`src\main\integrations\shortcutsTray.ts` 的
 * `registerPlayerShortcuts`：逐项收集注册结果、失败原因回传渲染层），
 * 注册策略按 folia-major 的 `globalShortcuts.cjs` 改成**差分 apply**（P0-23），
 * 判定仍在渲染层规则层（`renderer/domain/shortcuts`），主进程只做**系统调用**：注册 + 转发。
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
  /** 当前生效的绑定，按 accelerator 索引（注销与差分注册都要用）。 */
  private current = new Map<string, ShortcutRequest>();

  /**
   * **差分注册**（抄 folia 的 `apply`）：只注销不在新列表里的、只注册新增的。
   *
   * 为什么不"先全注销再全注册"：注销到重新注册之间有个空窗，Windows 上这几十毫秒里
   * 别的程序可能正好抢走这个键（尤其 `Ctrl+Alt+←/→` 这种热门组合），用户看到的是
   * "改了个无关键位，seek 就失效了"。同一条键换了动作时才注销重注册。
   *
   * 注册失败不抛：把结果回报渲染层，设置页显示"被占用"；下次 apply 会再试一次。
   */
  apply(
    bindings: ShortcutRequest[],
    sendAction: (action: string) => void,
    window: () => BrowserWindow | null,
  ): ShortcutResult[] {
    // 形状过滤 + 同键只留第一条（渲染层已消重，这里防脏数据）
    const requested: ShortcutRequest[] = [];
    for (const b of bindings) {
      if (!b || typeof b.accelerator !== "string" || b.accelerator.length === 0) continue;
      if (requested.some((r) => r.accelerator === b.accelerator)) continue;
      requested.push({ action: b.action, accelerator: b.accelerator });
    }

    for (const acc of [...this.current.keys()]) {
      if (requested.some((r) => r.accelerator === acc)) continue;
      this.unregisterOne(acc);
    }

    const results: ShortcutResult[] = [];
    for (const b of requested) {
      const held = this.current.get(b.accelerator);
      if (held && held.action === b.action) {
        results.push({ action: b.action, accelerator: b.accelerator, registered: true });
        continue;
      }
      if (held) this.unregisterOne(b.accelerator); // 同键换动作

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
        this.current.set(b.accelerator, b);
        log("main", `[shortcut] 已注册 ${b.accelerator}（${b.action}）`);
      } else {
        log("warn", `[shortcut] ${b.accelerator}（${b.action}）未注册，可能被其他应用占用`);
      }
      results.push({ action: b.action, accelerator: b.accelerator, registered: ok });
    }
    return results;
  }

  private unregisterOne(accelerator: string): void {
    try {
      globalShortcut.unregister(accelerator);
    } catch (err) {
      log("warn", `[shortcut] 注销 ${accelerator} 抛错：${String(err)}`);
    }
    this.current.delete(accelerator);
  }

  dispose(): void {
    for (const acc of [...this.current.keys()]) this.unregisterOne(acc);
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
