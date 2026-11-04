/**
 * 全局快捷键的渲染层接线：读档 → 注册到主进程 → 按键回来执行动作。
 *
 * 抄 Twilight_Echo 的结构（设置页改绑定 → 主进程重注册 → 结果回报），
 * 规则判定全在 `domain/shortcuts`（纯函数），这里只做**接线**。
 *
 * 播放语义不在这里：动作名 → 命令注册表（`ui/input/commands.ts`）→ dispatch。
 */
import {
  DEFAULT_BINDINGS,
  findConflict,
  labelOf,
  normalizeBindings,
  type ShortcutAction,
  type ShortcutBinding,
} from "../domain/shortcuts/index.js";
import { createTriggerGate } from "../domain/shortcuts/trigger-gate.js";

export interface ShortcutStatus {
  action: ShortcutAction;
  registered: boolean;
}

/** 存键位的档（用通用小文件，不混进播放状态快照）。 */
const STORE_KEY = "global-shortcuts";

export interface ShortcutsApi {
  readStore(key: string): Promise<string | null>;
  writeStore(key: string, json: string): Promise<void>;
  setGlobalShortcuts(bindings: { action: string; accelerator: string }[]): void;
  onGlobalShortcut(cb: (action: string) => void): void;
  onGlobalShortcutStatus(cb: (results: { action: string; accelerator: string; registered: boolean }[]) => void): void;
}

export interface ShortcutsController {
  /** 读档并注册到主进程。返回当前生效的绑定。 */
  init(): Promise<ShortcutBinding[]>;
  /** 改一条绑定：先查冲突，再保存 + 重新注册。返回失败原因（成功为 null）。 */
  setBinding(action: ShortcutAction, accelerator: string): Promise<string | null>;
  /** 全部恢复默认。 */
  resetDefaults(): Promise<void>;
  /** 当前生效的绑定（设置页显示用）。 */
  bindings(): ShortcutBinding[];
  /** 最近的注册结果（设置页显示"被占用"）。 */
  status(): ShortcutStatus[];
  /** 订阅注册结果变化。 */
  onStatus(cb: (status: ShortcutStatus[]) => void): () => void;
}

export function createShortcuts(api: ShortcutsApi, onAction: (action: ShortcutAction) => void): ShortcutsController {
  let bindings: ShortcutBinding[] = DEFAULT_BINDINGS.map((b) => ({ ...b }));
  let status: ShortcutStatus[] = [];
  const listeners = new Set<(s: ShortcutStatus[]) => void>();

  /**
   * 长按不重复（P0-23）：系统级注册没有 keyup，按住方向键会被 key repeat 反复回调，
   * 5 秒一步的 seek 直接飙到底。同一条动作 250ms 内只放行一次。
   */
  const gate = createTriggerGate();

  const publish = (): void => {
    for (const cb of listeners) cb(status);
  };

  const pushToMain = (): void => {
    api.setGlobalShortcuts(bindings.map((b) => ({ action: b.action, accelerator: b.accelerator })));
  };

  api.onGlobalShortcut((action) => {
    if (!gate(action)) return; // 长按产生的重复回调
    onAction(action as ShortcutAction);
  });

  api.onGlobalShortcutStatus((results) => {
    status = results.map((r) => ({ action: r.action as ShortcutAction, registered: r.registered }));
    publish();
  });

  return {
    async init(): Promise<ShortcutBinding[]> {
      try {
        const raw = await api.readStore(STORE_KEY);
        if (raw) bindings = normalizeBindings(JSON.parse(raw));
        else bindings = normalizeBindings(DEFAULT_BINDINGS);
      } catch (err) {
        console.error("[shortcuts] 读档失败，用默认键位", err);
        bindings = normalizeBindings(DEFAULT_BINDINGS);
      }
      pushToMain();
      return bindings;
    },

    async setBinding(action: ShortcutAction, accelerator: string): Promise<string | null> {
      const clash = findConflict(bindings, action, accelerator);
      if (clash) return `与「${labelOf(clash)}」重复`;
      const next = bindings.map((b) => (b.action === action ? { ...b, accelerator } : b));
      const normalized = normalizeBindings(next);
      bindings = normalized;
      try {
        await api.writeStore(STORE_KEY, JSON.stringify(normalized));
      } catch (err) {
        console.error("[shortcuts] 写档失败", err);
        return "保存失败";
      }
      pushToMain();
      return null;
    },

    async resetDefaults(): Promise<void> {
      bindings = normalizeBindings(DEFAULT_BINDINGS);
      try {
        await api.writeStore(STORE_KEY, JSON.stringify(bindings));
      } catch (err) {
        console.error("[shortcuts] 写档失败（恢复默认）", err);
      }
      pushToMain();
    },

    bindings(): ShortcutBinding[] {
      return bindings.map((b) => ({ ...b }));
    },

    status(): ShortcutStatus[] {
      return status;
    },

    onStatus(cb: (s: ShortcutStatus[]) => void): () => void {
      listeners.add(cb);
      cb(status);
      return () => listeners.delete(cb);
    },
  };
}
