import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, getState, subscribe } from "../dist-test/kernel.mjs";

test("play 写入状态", () => {
  dispatch({ type: "player/play", trackId: "t1" });
  assert.equal(getState().player.status, "playing");
  assert.equal(getState().player.trackId, "t1");
});

test("pause 只改状态不动 trackId", () => {
  dispatch({ type: "player/pause" });
  assert.equal(getState().player.status, "paused");
  assert.equal(getState().player.trackId, "t1");
});

test("seek / volume 会被 clamp 到合法区间", () => {
  dispatch({ type: "player/seek", positionMs: -5 });
  assert.equal(getState().player.positionMs, 0);
  dispatch({ type: "player/setVolume", volume: 3 });
  assert.equal(getState().player.volume, 1);
});

test("subscribe 收到通知，取消后不再收到", () => {
  let calls = 0;
  const off = subscribe(() => {
    calls += 1;
  });
  dispatch({ type: "player/pause" });
  assert.equal(calls, 0, "pause 之前已是 paused，reduce 返回同一对象，不该通知");
  dispatch({ type: "player/seek", positionMs: 1000 });
  assert.equal(calls, 1);
  off();
  dispatch({ type: "player/seek", positionMs: 2000 });
  assert.equal(calls, 1);
});

test("未知 intent 不改状态", () => {
  const before = getState();
  dispatch({ type: "不存在的意图" });
  assert.equal(getState(), before);
});
