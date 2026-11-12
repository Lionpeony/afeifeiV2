/**
 * 轻量 toast 总线（docs/09 B2）：发布/订阅，不进 store——
 * toast 是瞬态 UI 事件（2–4s 自清），写进全局状态反而要管清理。
 * 消费方只有 Toaster 组件。
 *
 * 三档语气（2026-11-12 重做）：以前所有反馈共用顶部那条常驻 notice，
 * 「已加入喜欢」和「出了点问题」都挂在那儿且**永不消失**——用户截图实锤。
 * 现在瞬态反馈一律走这里：成功短、提示中、失败长，且都能点掉。
 */
export type ToastKind = "ok" | "info" | "bad";

export interface ToastItem {
  /** 递增序号：同一条文案连点两次也要重播动画（只比文案会去重成没反应） */
  id: number;
  text: string;
  kind: ToastKind;
}

const listeners = new Set<(item: ToastItem) => void>();
let seq = 0;

export function toast(text: string, kind: ToastKind = "info"): void {
  const item: ToastItem = { id: ++seq, text, kind };
  for (const fn of listeners) fn(item);
}

export function subscribeToast(fn: (item: ToastItem) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
