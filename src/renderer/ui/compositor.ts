/**
 * 全应用唯一的 requestAnimationFrame（50 §9.1）。
 * lint 规则 4 只允许这个文件出现 rAF —— 五个循环抢主线程是掉帧的头号原因。
 *
 * 两个出口：
 *   - onFrame：原始帧回调（自己取数据）。
 *   - onTick：**每帧只取一次 clock.t，把同一个 t 分发给所有订阅者**（M4）。
 *     歌词、舞台、进度条都该用 onTick —— 一帧内所有消费者拿到的时间完全相同。
 */

import { clock } from "../kernel/clock.js";

type Frame = (nowMs: number) => void;

const listeners = new Set<Frame>();
const tickListeners = new Set<(t: number) => void>();
let handle = 0;

function loop(now: number): void {
  // 复制一份再遍历：回调里可能订阅/退订
  for (const fn of [...listeners]) fn(now);
  if (tickListeners.size > 0) {
    const t = clock.t(now);
    for (const fn of [...tickListeners]) fn(t);
  }
  handle = requestAnimationFrame(loop);
}

function ensureLoop(): void {
  if (!handle) handle = requestAnimationFrame(loop);
}

export function onFrame(fn: Frame): () => void {
  listeners.add(fn);
  ensureLoop();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && tickListeners.size === 0 && handle) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
}

/** 每帧一次，把同一份 clock.t 分发给所有订阅者。舞台/歌词/时间文本只从这里取时间。 */
export function onTick(fn: (t: number) => void): () => void {
  tickListeners.add(fn);
  ensureLoop();
  return () => {
    tickListeners.delete(fn);
    if (listeners.size === 0 && tickListeners.size === 0 && handle) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
}
