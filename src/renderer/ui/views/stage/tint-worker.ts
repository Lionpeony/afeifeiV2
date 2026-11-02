import { stageTint } from "./tint.js";

/**
 * 取色 Worker（M9-2）：主线程不解码也不做量化，这里只收 8×8 的 RGB 扁平数组，
 * 跑纯函数 `stageTint`，把 `oklch()` 字符串发回去。构建产物是独立 iife（build.mjs）。
 */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (m: unknown) => void;
};

ctx.onmessage = (e: MessageEvent) => {
  const { id, rgb } = e.data as { id: number; rgb: number[] };
  ctx.postMessage({ id, tint: stageTint(rgb) });
};
