/* 弹窗焦点环（a11y P0）：开窗把焦点送进去、Tab 不出框、关窗还给触发它的那个元素。
   多个弹窗会叠（播放页 → 分享卡 / 快捷键），用栈保证只有最上层接管 Tab。 */
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const visible = (el: HTMLElement): boolean =>
  el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

/** 栈里只认最上层：被盖住的弹窗既不改焦也不抢 Tab */
const stack: symbol[] = [];

/* 弹窗打开时锁住背后列表滚动（P1-4）。用计数不用布尔：
   播放页里再开分享卡，关掉分享卡不能顺手给播放页解锁。 */
let locks = 0;
function lockScroll(on: boolean): void {
  locks = Math.max(0, locks + (on ? 1 : -1));
  document.documentElement.classList.toggle("modal-open", locks > 0);
}

/* 记住「进弹窗之前最后摸过的元素」：表单弹窗挂载时 autoFocus 会先抢焦点，
   单看 activeElement 到不了真正的触发按钮，关窗时就还错了地方 */
let lastOutside: HTMLElement | null = null;
document.addEventListener(
  "focusin",
  (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && !el.closest("[aria-modal='true']")) lastOutside = el;
  },
  true,
);

export function useDialogFocus(open: boolean, panel: RefObject<HTMLElement | null>): void {
  const id = useRef(Symbol("dialog"));
  useEffect(() => {
    if (!open) return;
    const me = id.current;
    const el = panel.current;
    /* 归还目标：表单 autoFocus 已经把焦点放进框里时，用它之前记下的框外元素 */
    const active = document.activeElement;
    const inside = el != null && active instanceof HTMLElement && el.contains(active);
    const prev = inside ? lastOutside : (active instanceof HTMLElement ? active : lastOutside);
    stack.push(me);
    lockScroll(true);

    // 落点：已经有焦点在框里（autoFocus）就不抢；否则先进面板或第一个可操作元素
    if (el && !inside) {
      const hasTabIndex = el.hasAttribute("tabindex");
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      if (hasTabIndex) el.focus({ preventScroll: true });
      else (first ?? el).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Tab" || stack[stack.length - 1] !== me) return;
      const box = panel.current;
      if (!box) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
      if (items.length === 0) {
        e.preventDefault();
        box.focus({ preventScroll: true });
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !box.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && (active === first || active === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = stack.lastIndexOf(me);
      if (i >= 0) stack.splice(i, 1);
      lockScroll(false);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [open, panel]);
}
