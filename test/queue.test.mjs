import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampCursor,
  dropTargetIndex,
  nextShuffleSeed,
  orderOf,
  positionOf,
  prevAction,
  pushHistory,
  stepBackward,
  stepForward,
} from "../dist-test/queue.mjs";

const ITEMS = ["a", "b", "c", "d"];

/* ---------- orderOf：shuffle 是投影，不是变异 ---------- */

test("order / repeat-all / repeat-one 都是恒等投影", () => {
  for (const mode of ["order", "repeat-all", "repeat-one"]) {
    assert.deepEqual(orderOf(ITEMS, mode, 42), [0, 1, 2, 3], mode);
  }
});

test("shuffle 返回原下标的排列，长度不变", () => {
  const order = orderOf(ITEMS, "shuffle", 7);
  assert.equal(order.length, ITEMS.length);
  assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
});

test("shuffle 不改动 items", () => {
  const items = ITEMS.slice();
  orderOf(items, "shuffle", 7);
  assert.deepEqual(items, ITEMS, "items 必须原样，否则关掉 shuffle 顺序回不去");
});

test("同 seed 同顺序，可复现", () => {
  assert.deepEqual(orderOf(ITEMS, "shuffle", 99), orderOf(ITEMS, "shuffle", 99));
});

test("不同 seed 通常给出不同顺序", () => {
  const a = orderOf(ITEMS, "shuffle", 1);
  const b = orderOf(ITEMS, "shuffle", 2);
  assert.notDeepEqual(a, b);
});

test("空队列与单元素队列的投影", () => {
  assert.deepEqual(orderOf([], "shuffle", 1), []);
  assert.deepEqual(orderOf(["x"], "shuffle", 1), [0]);
});

/* ---------- nextShuffleSeed：切到随机要换种子 ---------- */

test("nextShuffleSeed：每次都不一样（不然随机没生效）", () => {
  const s1 = nextShuffleSeed(1);
  const s2 = nextShuffleSeed(s1);
  assert.notEqual(s1, 1);
  assert.notEqual(s2, s1);
});

test("nextShuffleSeed：同起点可复现（纯函数，不是随机数）", () => {
  assert.equal(nextShuffleSeed(7), nextShuffleSeed(7));
});

/* ---------- positionOf ---------- */
test("positionOf 找到下标位置", () => {
  assert.equal(positionOf([2, 0, 3, 1], 3), 2);
});

test("positionOf 找不到返回 -1", () => {
  assert.equal(positionOf([2, 0], 9), -1);
});

/* ---------- stepForward ---------- */

test("前进：中间位置正常 +1", () => {
  assert.equal(stepForward([0, 1, 2, 3], 1, "order"), 2);
});

test("前进：order 模式到末尾返回 -1（队列到头）", () => {
  assert.equal(stepForward([0, 1, 2, 3], 3, "order"), -1);
});

test("前进：repeat-all 到末尾绕回第一个", () => {
  assert.equal(stepForward([0, 1, 2, 3], 3, "repeat-all"), 0);
});

test("前进：repeat-one 原地不动", () => {
  assert.equal(stepForward([0, 1, 2, 3], 2, "repeat-one"), 2);
});

test("前进：repeat-one 下用户手动点下一首要切歌（byUser=true）", () => {
  // 单曲循环只约束「自然结束」；手动切歌照常切（抄 lx 的 isAutoToggle 双路径：
  // src\renderer\core\player\action.ts 的 playNext，手动时强制按 listLoop 语义）
  assert.equal(stepForward([0, 1, 2, 3], 2, "repeat-one", true), 3);
});

test("前进：repeat-one 下用户手动切到队尾后按 order 停（不回绕）", () => {
  assert.equal(stepForward([0, 1, 2, 3], 3, "repeat-one", true), -1);
});

test("前进：空队列返回 -1", () => {
  assert.equal(stepForward([], 0, "order"), -1);
});

test("前进：cursor 不在顺序表里时回到第一个", () => {
  assert.equal(stepForward([0, 1, 2, 3], 99, "order"), 0);
});

test("前进：shuffle 顺序按投影走，不是按 items 下标", () => {
  const order = orderOf(ITEMS, "shuffle", 5);
  const first = order[0];
  assert.equal(stepForward(order, first, "shuffle"), order[1]);
});

/* ---------- stepBackward ---------- */

test("后退：中间位置正常 -1", () => {
  assert.equal(stepBackward([0, 1, 2, 3], 2, "order"), 1);
});

test("后退：order 模式在头部停在原地", () => {
  assert.equal(stepBackward([0, 1, 2, 3], 0, "order"), 0);
});

test("后退：repeat-all 在头部绕到末尾", () => {
  assert.equal(stepBackward([0, 1, 2, 3], 0, "repeat-all"), 3);
});

test("后退：repeat-one 原地不动", () => {
  assert.equal(stepBackward([0, 1, 2, 3], 2, "repeat-one"), 2);
});

test("后退：repeat-one 下用户手动点上一首要切歌（byUser=true）", () => {
  assert.equal(stepBackward([0, 1, 2, 3], 2, "repeat-one", true), 1);
});

test("后退：空队列返回 -1", () => {
  assert.equal(stepBackward([], 0, "order"), -1);
});

/* ---------- clampCursor ---------- */

test("clampCursor：负数夹到 0", () => {
  assert.equal(clampCursor(ITEMS, -5), 0);
});

test("clampCursor：超界夹到末位", () => {
  assert.equal(clampCursor(ITEMS, 99), 3);
});

test("clampCursor：空队列返回 -1", () => {
  assert.equal(clampCursor([], 0), -1);
});

/* ---------- 3 秒规则 ---------- */

test("播过 3 秒：上一首变重播当前", () => {
  assert.equal(prevAction(5000), "restart");
});

test("不足 3 秒：真的回上一首", () => {
  assert.equal(prevAction(1200), "prev");
});

test("恰好 3 秒：算不足（边界属于 prev）", () => {
  assert.equal(prevAction(3000), "prev");
});

/* ---------- 历史 ---------- */

test("pushHistory 追加到末尾", () => {
  assert.deepEqual(pushHistory(["a"], "b"), ["a", "b"]);
});

test("pushHistory 超过上限时丢最旧的", () => {
  assert.deepEqual(pushHistory(["a", "b", "c"], "d", 3), ["b", "c", "d"]);
});

/* ---------- 拖拽落点换算（P0-11） ---------- */

test("往下拖要 -1：把第 1 首拖到第 3 首之前 → 最终落在下标 1", () => {
  // items=[a,b,c,d]，from=0，指针落在"第 3 行之前"（gap=2）
  assert.equal(dropTargetIndex(0, 2, 4), 1);
  // 拖到队尾（gap=4）→ 落在最后一格
  assert.equal(dropTargetIndex(0, 4, 4), 3);
});

test("往上拖不减一：把第 4 首拖到第 2 首之前 → 落在下标 1", () => {
  assert.equal(dropTargetIndex(3, 1, 4), 1);
  assert.equal(dropTargetIndex(3, 0, 4), 0);
});

test("原地放下不变（缝在自身上/下沿都算没动）", () => {
  assert.equal(dropTargetIndex(2, 2, 4), 2);
  assert.equal(dropTargetIndex(2, 3, 4), 2);
});

test("越界钳制：空队列 -1，缝超范围夹到两端", () => {
  assert.equal(dropTargetIndex(0, 0, 0), -1);
  assert.equal(dropTargetIndex(-1, 0, 4), -1);
  assert.equal(dropTargetIndex(0, 99, 4), 3);
  assert.equal(dropTargetIndex(3, -5, 4), 0);
});
