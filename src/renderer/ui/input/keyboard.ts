/**
 * 全应用**唯一**的 keydown 监听（M6 键盘纪律，00 §9.5）。
 *
 * 组件不许再挂全局 keydown——快捷键互相抢的根源就是多个监听器。
 * 处理顺序写死：
 *   ① IME 组字 → 静默
 *   ② Esc → resolveEsc（全屏 > 模态 > 面板 > 忽略）
 *   ③ 焦点在文本输入 → 静默
 *   ④ 焦点在滑杆 → 静默（←/→ 归滑杆）
 *   ⑤ 有模态打开 → 静默
 *   ⑥ 查键位表（`keymap.ts`）→ 交给装配层执行
 */
import { resolveEsc, isTextTarget, isRangeTarget, isListTarget } from "./resolve-esc.js";
import { resolveKey } from "./keymap.js";
import { idsOf, closeTop } from "./panels.js";

export interface KeyboardActions {
  togglePalette(): void;
  togglePlay(): void;
  focusSearch(): void;
  /** 当前页 id：0–9 只在播放页生效，所以键位表需要知道在哪儿。 */
  page(): string;
  seekBy(deltaMs: number): void;
  /** 0–9：跳到整曲的百分之几 */
  seekPercent(percent: number): void;
  prev(): void;
  next(): void;
  volumeBy(delta: number): void;
  mute(): void;
  like(): void;
}

export function installKeyboard(actions: KeyboardActions): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.isComposing) return;

    if (e.key === "Escape") {
      const action = resolveEsc({
        fullscreen: document.fullscreenElement !== null,
        modals: idsOf("modal"),
        panels: idsOf("panel"),
      });
      if (action.type === "closePanel" || action.type === "closeModal") closeTop();
      if (action.type === "exitFullscreen") void document.exitFullscreen();
      if (action.type !== "ignore") e.preventDefault();
      return;
    }

    // 文本输入与滑杆/下拉：键属于元素，不属于应用（00 §9.5「焦点在滑杆或 select」）
    if (isTextTarget(e.target) || isRangeTarget(e.target) || isListTarget(e.target)) return;

    // 模态打开：快捷键整体静默
    if (idsOf("modal").length > 0) return;

    const action = resolveKey(e, actions.page());
    if (!action) return;
    e.preventDefault();

    switch (action.type) {
      case "palette":
        actions.togglePalette();
        break;
      case "focusSearch":
        actions.focusSearch();
        break;
      case "togglePlay":
        actions.togglePlay();
        break;
      case "seekBy":
        actions.seekBy(action.deltaMs);
        break;
      case "seekPercent":
        actions.seekPercent(action.percent);
        break;
      case "prev":
        actions.prev();
        break;
      case "next":
        actions.next();
        break;
      case "volumeBy":
        actions.volumeBy(action.delta);
        break;
      case "mute":
        actions.mute();
        break;
      case "like":
        actions.like();
        break;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
