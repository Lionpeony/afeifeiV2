/**
 * 全应用唯一的 requestAnimationFrame（50 §9.1）。
 * lint 规则 4 只允许这个文件出现 rAF —— 五个循环抢主线程是掉帧的头号原因。
 */

type Frame = (nowMs: number) => void;

const listeners = new Set<Frame>();
let handle = 0;

function loop(now: number): void {
  // 复制一份再遍历：回调里可能订阅/退订
  for (const fn of [...listeners]) fn(now);
  handle = requestAnimationFrame(loop);
}

export function onFrame(fn: Frame): () => void {
  listeners.add(fn);
  if (!handle) handle = requestAnimationFrame(loop);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && handle) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
}
