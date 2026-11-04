/**
 * 键位表（`docs/22` §三末，2026-11-04 一次定死）：keydown → 语义动作。
 *
 * 抽成纯函数的理由：**每条键都要有判据**，而 `KeyboardEvent` 在 node 里造不干净。
 * 这里只认 `{key, ctrlKey, metaKey, altKey, shiftKey}` 五个字段，测试直接喂对象。
 *
 * 焦点纪律（输入框 / 滑杆 / select / 模态）**不在这里** —— 那是 `keyboard.ts` 的前置闸门，
 * 本函数只回答"这个键是什么意思"，不回答"现在该不该管它"。
 */

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export type KeyAction =
  | { type: "palette" }
  | { type: "focusSearch" }
  | { type: "togglePlay" }
  | { type: "seekBy"; deltaMs: number }
  | { type: "seekPercent"; percent: number }
  | { type: "prev" }
  | { type: "next" }
  | { type: "volumeBy"; delta: number }
  | { type: "mute" }
  | { type: "like" };

/** 步长一次定死（键位表）：±5 秒 / ±5%。改这里就是改键位表，必须同步 `docs/22`。 */
export const SEEK_STEP_MS = 5000;
export const VOLUME_STEP = 0.05;

export function resolveKey(e: KeyLike, page: string): KeyAction | null {
  // Ctrl/Cmd 组合只认这两个；其余带修饰键的一律不接（避免和系统/输入法抢）
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === "k") return { type: "palette" };
    if (k === "f") return { type: "focusSearch" };
    return null;
  }
  if (e.altKey) return null;

  switch (e.key) {
    case " ":
      return { type: "togglePlay" };
    case "ArrowLeft":
      // Shift 是"换一首"，不按 Shift 才是"在同一首里挪"
      return e.shiftKey ? { type: "prev" } : { type: "seekBy", deltaMs: -SEEK_STEP_MS };
    case "ArrowRight":
      return e.shiftKey ? { type: "next" } : { type: "seekBy", deltaMs: SEEK_STEP_MS };
    case "ArrowUp":
      return { type: "volumeBy", delta: VOLUME_STEP };
    case "ArrowDown":
      return { type: "volumeBy", delta: -VOLUME_STEP };
    default:
      break;
  }

  const lower = e.key.toLowerCase();
  if (lower === "m") return { type: "mute" };
  if (lower === "l") return { type: "like" };

  // 0–9 只在播放页：别的页面上数字是给搜索框、列表跳转留的
  if (page === "stage" && /^[0-9]$/.test(e.key)) {
    return { type: "seekPercent", percent: Number(e.key) * 10 };
  }
  return null;
}
