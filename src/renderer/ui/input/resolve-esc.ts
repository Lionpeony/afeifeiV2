/**
 * Esc 的唯一裁决（00 §9.5）：优先序写死，能穷举单测。
 * 散在各组件里判断必然互相抢——加一种新面板只改 context，不改逻辑。
 */

export interface EscContext {
  fullscreen: boolean;
  /** 模态栈：后开的在末尾（最上层）。 */
  modals: string[];
  /** 面板栈（菜单/抽屉/浮层）：后开的在末尾。 */
  panels: string[];
}

export type EscAction =
  | { type: "exitFullscreen" }
  | { type: "closeModal"; id: string }
  | { type: "closePanel"; id: string }
  | { type: "ignore" };

export function resolveEsc(ctx: EscContext): EscAction {
  if (ctx.fullscreen) return { type: "exitFullscreen" };
  if (ctx.modals.length > 0) return { type: "closeModal", id: ctx.modals[ctx.modals.length - 1] };
  if (ctx.panels.length > 0) return { type: "closePanel", id: ctx.panels[ctx.panels.length - 1] };
  return { type: "ignore" };
}

/** 文本输入类元素：快捷键在这里必须静默（00 §9.5 输入中守卫）。 */
export function isTextTarget(el: EventTarget | null): boolean {
  // 鸭子判定而非 instanceof：纯函数层要能在 node（无 DOM 类）下跑（00 §13）
  if (!el || typeof (el as HTMLElement).tagName !== "string") return false;
  const e = el as HTMLElement;
  if (e.tagName === "TEXTAREA") return true;
  if (e.tagName === "INPUT") {
    const type = (e as HTMLInputElement).type;
    return type !== "range" && type !== "checkbox" && type !== "radio" && type !== "button";
  }
  return e.isContentEditable === true;
}

/** 焦点在滑杆上：←/→ 属于滑杆自己，快捷键不许抢。 */
export function isRangeTarget(el: EventTarget | null): boolean {
  if (!el || (el as HTMLElement).tagName !== "INPUT") return false;
  return (el as HTMLInputElement).type === "range";
}

/** 焦点在 <select>：方向键/空格属于下拉展开，应用快捷键静默（00 §9.5「滑杆或 select」）。 */
export function isListTarget(el: EventTarget | null): boolean {
  if (!el || (el as HTMLElement).tagName !== "SELECT") return false;
  return true;
}
