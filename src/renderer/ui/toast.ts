/**
 * 轻量 toast 总线（docs/09 B2）：发布/订阅，不进 store——
 * toast 是瞬态 UI 事件（2.5s 自清），写进全局状态反而要管清理。
 * 消费方只有 Toaster 组件。
 */
const listeners = new Set<(msg: string) => void>();

export function toast(msg: string): void {
  for (const fn of listeners) fn(msg);
}

export function subscribeToast(fn: (msg: string) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
