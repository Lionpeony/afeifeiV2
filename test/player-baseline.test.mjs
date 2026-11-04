import { test } from "node:test";
import assert from "node:assert/strict";
import { dropTargetIndex } from "../dist-test/queue.mjs";
import { MAX_RETRY, MAX_SKIP_STREAK, decideFailure } from "../dist-test/failure.mjs";
import { dispatch, getState, sanitizeLyricOffsets } from "../dist-test/kernel.mjs";

/**
 * `docs/22` §四 出口判据 1 点名的收口文件：三处**最容易写成"看着对"的换算**各钉一组。
 * 各功能的细节判据仍在 queue / failure / store 的专测里，这里只保证基线不被悄悄改坏。
 */

/* ---------- P0-11 拖拽落点换算（往下拖必须 -1） ---------- */

test("P0-11 dropTargetIndex：往上拖落在缝上，往下拖要减一位", () => {
  assert.equal(dropTargetIndex(2, 0, 5), 0, "第 3 行拖到最前");
  assert.equal(dropTargetIndex(0, 4, 5), 3, "第 1 行拖到第 5 行前 → 落在 3（4-1）");
  assert.equal(dropTargetIndex(0, 5, 5), 4, "拖到队尾");
});

test("P0-11 dropTargetIndex：越界不越界，非法输入给 -1", () => {
  assert.equal(dropTargetIndex(0, 99, 5), 4, "缝超出长度夹到 len");
  assert.equal(dropTargetIndex(0, -3, 5), 0, "负缝夹到 0");
  assert.equal(dropTargetIndex(-1, 2, 5), -1);
  assert.equal(dropTargetIndex(0, 2, 0), -1, "空队列没有落点");
});

/* ---------- P0-14 熔断决策（顺序即语义） ---------- */

test("P0-14 decideFailure：先重试、后跳过、够数停机", () => {
  const base = { code: "network", retryCount: 0, skipStreak: 0, hasNext: true, autoSkip: true };
  assert.deepEqual(decideFailure(base), { action: "retry", retryCount: 1 });
  assert.deepEqual(decideFailure({ ...base, retryCount: MAX_RETRY }), {
    action: "skip",
    skipStreak: 1,
    delayMs: 500,
  });
  assert.deepEqual(decideFailure({ ...base, retryCount: MAX_RETRY, skipStreak: MAX_SKIP_STREAK - 1 }), {
    action: "stop",
    reason: "exhausted",
  });
});

test("P0-14 decideFailure：手动停 / 没下一首 / 用户切歌各有自己的理由", () => {
  const base = { code: "network", retryCount: MAX_RETRY, skipStreak: 0, hasNext: true, autoSkip: true };
  assert.deepEqual(decideFailure({ ...base, autoSkip: false }), { action: "stop", reason: "manual" });
  assert.deepEqual(decideFailure({ ...base, hasNext: false }), { action: "stop", reason: "no-next" });
  assert.deepEqual(decideFailure({ ...base, code: "aborted" }), { action: "ignore" });
  assert.deepEqual(decideFailure({ ...base, code: "decode-failed" }), {
    action: "skip",
    skipStreak: 1,
    delayMs: 500,
  }, "不可重试的码直接跳");
});

/* ---------- P0-18 歌词偏移换算（±10s、归零删键） ---------- */

test("P0-18 偏移换算：夹到 ±10s，0 与非数不入表", () => {
  assert.deepEqual(sanitizeLyricOffsets('{"a":99999,"b":-99999,"c":0,"d":"500"}'), { a: 10000, b: -10000 });
  assert.deepEqual(sanitizeLyricOffsets("not json"), {});
});

test("P0-18 偏移累加：连调相加，归零删键（新歌不受影响）", () => {
  dispatch({ type: "lyric/restoreOffsets", offsets: {} });
  dispatch({ type: "lyric/nudgeOffset", trackId: "bl-a", deltaMs: 500 });
  dispatch({ type: "lyric/nudgeOffset", trackId: "bl-a", deltaMs: 500 });
  assert.equal(getState().lyrics.offsets["bl-a"], 1000);
  dispatch({ type: "lyric/nudgeOffset", trackId: "bl-a", deltaMs: -1000 });
  assert.equal("bl-a" in getState().lyrics.offsets, false);
});
