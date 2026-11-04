import type { PlayMode, TrackId } from "../../contracts/index.js";

/**
 * 队列的纯函数部分（50 §4）。全部无副作用、可穷举测试。
 *
 * 核心约定：**shuffle 是投影，不是变异**。
 * `items` 永远是用户给的原顺序；播放顺序由 `orderOf` 现算。
 * 这样关掉 shuffle 时顺序自然回来，不需要"恢复备份"。
 */

/** 确定性 PRNG（mulberry32）。同 seed 同序列，测试可复现。 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 返回"按下标访问 items"的顺序表。order / repeat-all / repeat-one 是恒等投影。 */
export function orderOf(items: TrackId[], mode: PlayMode, seed: number): number[] {
  const base = items.map((_, i) => i);
  if (mode !== "shuffle") return base;

  const rand = rng(seed);
  const out = base.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 下一个 shuffle 种子（LCG 递进，纯函数）。
 *
 * 为什么不用 Math.random：kernel 不碰不确定性来源（Date.now / Math.random 都不该进来，
 * 见 sleep/set 的约定）。递进式同样是"每次不同"，而且给定起点可复现。
 *
 * 为什么需要它：切到随机模式时必须换种子 —— 种子不变 = 每次进随机都是同一个排列，
 * 用户看到的就是"随机没生效"（而且某些队列长度下排列可能与原序完全一样）。
 */
export function nextShuffleSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1103515245) + 12345) >>> 0;
}

/** order 里 cursor 处于第几个位置（-1 表示不在队列里）。 */
export function positionOf(order: number[], cursor: number): number {
  return order.indexOf(cursor);
}

/**
 * 前进一格。
 * 返回 -1 表示"队列到头且不循环"，调用方据此停播（不要自作聪明回头）。
 *
 * `byUser` 区分两条路径（抄 lx-music-desktop `src\renderer\core\player\action.ts`
 * 的 `isAutoToggle` 双路径：手动切歌时强制按 listLoop 语义）：
 * - false = 自然播放结束（ended）：单曲循环 → 重播本曲；
 * - true  = 用户主动点「下一首」：单曲循环也照常切下一首（Spotify / Apple Music 的通行行为）。
 */
export function stepForward(
  order: number[],
  cursor: number,
  mode: PlayMode,
  byUser = false,
): number {
  if (order.length === 0) return -1;
  const pos = positionOf(order, cursor);
  if (pos < 0) return order[0];
  if (mode === "repeat-one" && !byUser) return cursor;
  if (pos === order.length - 1) return mode === "repeat-all" ? order[0] : -1;
  return order[pos + 1];
}

/**
 * 后退一格。队列头后退：order 模式停在原地，repeat-all 绕到末尾。
 * `byUser` 语义同 stepForward：用户主动点「上一首」时，单曲循环也照常切上一首。
 */
export function stepBackward(
  order: number[],
  cursor: number,
  mode: PlayMode,
  byUser = false,
): number {
  if (order.length === 0) return -1;
  const pos = positionOf(order, cursor);
  if (pos < 0) return order[0];
  if (mode === "repeat-one" && !byUser) return cursor;
  if (pos === 0) return mode === "repeat-all" ? order[order.length - 1] : cursor;
  return order[pos - 1];
}

/**
 * 拖拽落点换算（P0-11，抄 SPlayer `useDragSort.calculateTargetIndex` 的最后一段）。
 *
 * `gap` 是**插入缝**（0..len，缝在"第 gap 行之前"），`from` 是拖动行当前下标，
 * 返回值是移动后该行落在的最终下标。**往下拖要 -1** —— 少这一行，往下拖会永远差一位。
 * 单独抽成纯函数是因为这条换算只能靠断言钉住，界面上看起来只是"顺序不太对"。
 */
export function dropTargetIndex(from: number, gap: number, len: number): number {
  if (from < 0 || len <= 0) return -1;
  const g = Math.min(Math.max(gap, 0), len);
  const to = from < g ? g - 1 : g;
  return Math.max(0, Math.min(to, len - 1));
}

/** 把越界的 cursor 夹到合法范围；空队列返回 -1。 */
export function clampCursor(items: TrackId[], cursor: number): number {
  if (items.length === 0) return -1;
  if (cursor < 0) return 0;
  if (cursor >= items.length) return items.length - 1;
  return cursor;
}

/**
 * 上一首按钮的语义（50 §16 M1 的"3s 规则"）：
 * 播过 3 秒就重播当前，不足 3 秒才真的回上一首。
 */
export function prevAction(positionMs: number, thresholdMs = 3000): "restart" | "prev" {
  return positionMs > thresholdMs ? "restart" : "prev";
}

/** 历史只留最近 N 条，避免长时间播放把内存撑起来。 */
export function pushHistory(history: TrackId[], trackId: TrackId, keep = 200): TrackId[] {
  const next = history.concat(trackId);
  return next.length > keep ? next.slice(next.length - keep) : next;
}
