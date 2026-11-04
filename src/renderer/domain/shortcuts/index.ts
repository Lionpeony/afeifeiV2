/**
 * 全局快捷键规则层（纯函数，无副作用）。
 *
 * **抄 Twilight_Echo**（`src\core\settings\normalization.ts` 的
 * `DEFAULT_GLOBAL_SHORTCUT_BINDINGS` + `src\renderer\src\components\settings-page\
 * ShortcutsSettingsSection.vue` 的录键/冲突提示），并按 folia-major 的做法把判定
 * 抽成独立规则层（`src\components\command-palette\globalShortcuts\globalShortcutRules.ts`）：
 * **设置页与注册流程共用同一份规则**，避免 UI 说"没冲突"而注册时失败。
 *
 * 键位字符串用 Electron 的 accelerator 格式（`CommandOrControl+Alt+Left`）。
 */

export type ShortcutAction =
  | "play-pause"
  | "next"
  | "prev"
  | "volume-up"
  | "volume-down"
  | "toggle-lyric"
  | "toggle-window";

export interface ShortcutBinding {
  action: ShortcutAction;
  accelerator: string;
}

/** 动作清单（抄 Twilight_Echo 的 7 项，再加一个「显示/隐藏主窗」——Windows 播放器必备）。 */
export const SHORTCUT_ACTIONS: { action: ShortcutAction; label: string; hint: string }[] = [
  { action: "play-pause", label: "播放 / 暂停", hint: "播放或暂停当前曲目" },
  { action: "next", label: "下一首", hint: "跳到队列里的下一首" },
  { action: "prev", label: "上一首", hint: "回到上一首（3 秒规则照旧）" },
  { action: "volume-up", label: "音量 +", hint: "调高音量" },
  { action: "volume-down", label: "音量 −", hint: "调低音量" },
  { action: "toggle-lyric", label: "显示 / 隐藏桌面歌词", hint: "独立歌词窗开关" },
  { action: "toggle-window", label: "显示 / 隐藏主窗", hint: "主窗最小化到托盘后也能唤回" },
];

/**
 * 默认键位（抄 Twilight_Echo 的 Ctrl+Alt 系列；Windows 上这组不与系统键冲突）。
 * 播放/暂停用 Ctrl+Alt+P 而不是 Ctrl+Alt+Space —— 空格在别的软件里太容易误触。
 */
export const DEFAULT_BINDINGS: ShortcutBinding[] = [
  { action: "play-pause", accelerator: "CommandOrControl+Alt+P" },
  { action: "next", accelerator: "CommandOrControl+Alt+Right" },
  { action: "prev", accelerator: "CommandOrControl+Alt+Left" },
  { action: "volume-up", accelerator: "CommandOrControl+Alt+Up" },
  { action: "volume-down", accelerator: "CommandOrControl+Alt+Down" },
  { action: "toggle-lyric", accelerator: "CommandOrControl+Alt+D" },
  { action: "toggle-window", accelerator: "CommandOrControl+Alt+W" },
];

const ACTION_SET = new Set<string>(SHORTCUT_ACTIONS.map((a) => a.action));

/** 读回来的键位要过白名单：认不出的动作 / 形状不对的 accelerator 一律回落到默认。 */
export function normalizeBindings(raw: unknown): ShortcutBinding[] {
  const defaults = DEFAULT_BINDINGS.map((b) => ({ ...b }));
  if (!Array.isArray(raw)) return defaults;
  const seen = new Set<string>();
  const out: ShortcutBinding[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const action = (item as { action?: unknown }).action;
    const accelerator = (item as { accelerator?: unknown }).accelerator;
    if (typeof action !== "string" || !ACTION_SET.has(action)) continue;
    if (typeof accelerator !== "string" || !isValidAccelerator(accelerator)) continue;
    if (seen.has(action)) continue;
    seen.add(action);
    out.push({ action: action as ShortcutAction, accelerator });
  }
  // 缺的动作补默认（新增动作时老配置不会少一项）
  for (const d of defaults) {
    if (!seen.has(d.action)) out.push(d);
  }
  return out;
}

/** accelerator 形状检查：有主键、长度不过分。真正的占用检查要问系统（注册失败才算）。 */
export function isValidAccelerator(accelerator: string): boolean {
  if (!accelerator || accelerator.length > 64) return false;
  const parts = accelerator.split("+");
  const main = parts[parts.length - 1];
  return main.length > 0 && main !== "Control" && main !== "Alt" && main !== "Shift";
}

/** 冲突检测：返回与这条键位重复的动作（设置页与注册前都用它）。 */
export function findConflict(
  bindings: ShortcutBinding[],
  action: ShortcutAction,
  accelerator: string,
): ShortcutAction | null {
  for (const b of bindings) {
    if (b.action === action) continue;
    if (sameAccelerator(b.accelerator, accelerator)) return b.action;
  }
  return null;
}

/** 比较时忽略大小写与修饰键顺序（Ctrl+Alt+K 与 Alt+Ctrl+K 是同一个键）。 */
export function sameAccelerator(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s
      .split("+")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => (p === "CommandOrControl" ? "Ctrl" : p === "CmdOrCtrl" ? "Ctrl" : p))
      .map((p) => (p.length === 1 ? p.toUpperCase() : p.toLowerCase()))
      .sort()
      .join("+");
  return norm(a) === norm(b);
}

/** 显示用：Ctrl+Alt+P（把 Electron 的长名字翻成人看的样子）。 */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((p) => {
      if (p === "CommandOrControl" || p === "CmdOrCtrl") return "Ctrl";
      if (p === "Alt") return "Alt";
      if (p === "Shift") return "Shift";
      if (p === "Control") return "Ctrl";
      if (p === "Space") return "Space";
      if (p.length === 1) return p.toUpperCase();
      return p;
    })
    .join("+");
}

export function labelOf(action: ShortcutAction): string {
  return SHORTCUT_ACTIONS.find((a) => a.action === action)?.label ?? action;
}
