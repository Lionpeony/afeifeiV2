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

/* ---------- A-17 静音 ---------- */

test("静音是独立字段：不改 volume，取消后回到原音量", () => {
  dispatch({ type: "player/setVolume", volume: 0.42 });
  dispatch({ type: "player/setMuted", muted: true });
  assert.equal(getState().player.muted, true);
  assert.equal(getState().player.volume, 0.42, "静音不许把音量清零");
  dispatch({ type: "player/setMuted", muted: false });
  assert.equal(getState().player.volume, 0.42);
});

test("重复静音不发通知（同值 reducer 返回同一对象）", () => {
  dispatch({ type: "player/setMuted", muted: true });
  let calls = 0;
  const off = subscribe(() => {
    calls += 1;
  });
  dispatch({ type: "player/setMuted", muted: true });
  assert.equal(calls, 0);
  off();
  dispatch({ type: "player/setMuted", muted: false });
});

/* ---------- A-20 队列增删排序 ---------- */

/** 队列入栈并让 startAt 那首真的在播（queue/set 只装载，不播）。 */
function reset(items = ["a", "b", "c", "d"], startAt = 1) {
  dispatch({ type: "queue/set", items, startAt });
  dispatch({ type: "player/play", trackId: items[startAt] });
}

/* ---------- 「添加到队列」：追加不打断 ---------- */

test("queue/add：追加到队尾，光标与当前播放都不动", () => {
  reset(["a", "b"], 0);
  dispatch({ type: "queue/add", items: ["x", "y"] });
  const s = getState();
  assert.deepEqual(s.queue.items, ["a", "b", "x", "y"]);
  assert.equal(s.queue.cursor, 0);
  assert.equal(s.player.trackId, "a");
});

test("queue/add：空数组与空串不产生新状态", () => {
  reset(["a"], 0);
  const before = getState();
  dispatch({ type: "queue/add", items: [] });
  dispatch({ type: "queue/add", items: [""] });
  assert.equal(getState(), before);
});

test("单曲循环下用户点下一首仍切歌（自然结束才重播本曲）", () => {
  // 抄 lx 的 isAutoToggle 双路径：手动切歌按列表走，单曲循环只约束 ended
  reset(["a", "b", "c"], 0);
  dispatch({ type: "queue/mode", mode: "repeat-one" });
  dispatch({ type: "queue/next" });
  const s = getState();
  assert.equal(s.queue.cursor, 1);
  assert.equal(s.player.trackId, "b");
});

/* ---------- 倍速（A-15 的一半，抄 lx 的 usePlaybackRate） ---------- */

test("倍速限幅在 0.5–2（抄 lx 的限幅）", () => {
  dispatch({ type: "player/setPlaybackRate", rate: 3 });
  assert.equal(getState().player.playbackRate, 2);
  dispatch({ type: "player/setPlaybackRate", rate: 0.1 });
  assert.equal(getState().player.playbackRate, 0.5);
  dispatch({ type: "player/setPlaybackRate", rate: 1.25 });
  assert.equal(getState().player.playbackRate, 1.25);
});

test("音调补偿是独立开关", () => {
  dispatch({ type: "player/setPreservesPitch", on: false });
  assert.equal(getState().player.preservesPitch, false);
  dispatch({ type: "player/setPreservesPitch", on: true });
  assert.equal(getState().player.preservesPitch, true);
});

test("删当前之前的：光标减一，播放曲目不变", () => {
  reset();
  dispatch({ type: "queue/remove", index: 0 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["b", "c", "d"]);
  assert.equal(s.queue.cursor, 0);
  assert.equal(s.player.trackId, "b");
  assert.equal(s.player.status, "playing");
});

test("删当前之后的：光标不动", () => {
  reset();
  dispatch({ type: "queue/remove", index: 3 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["a", "b", "c"]);
  assert.equal(s.queue.cursor, 1);
  assert.equal(s.player.trackId, "b");
});

test("删正在播的：接到下一条并保持播放，不重播已删的", () => {
  reset();
  dispatch({ type: "queue/remove", index: 1 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["a", "c", "d"]);
  assert.equal(s.player.trackId, "c");
  assert.equal(s.queue.cursor, 1);
  assert.equal(s.player.status, "playing", "一边播一边删，别把播放停掉");
  assert.equal(s.player.positionMs, 0);
});

test("删正在播的且它是最后一条：队列空了就结束，不假装还有歌", () => {
  reset(["a"], 0);
  dispatch({ type: "queue/remove", index: 0 });
  const s = getState();
  assert.deepEqual(s.queue.items, []);
  assert.equal(s.queue.cursor, -1);
  assert.equal(s.player.trackId, null);
  assert.equal(s.player.status, "ended");
});

test("越界的删除/移动不产生新状态", () => {
  reset();
  const before = getState();
  dispatch({ type: "queue/remove", index: 99 });
  dispatch({ type: "queue/move", from: -1, to: 2 });
  assert.equal(getState(), before);
});

test("移动队列：不换歌，光标跟着正在播的那首走", () => {
  reset();
  dispatch({ type: "queue/move", from: 3, to: 0 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["d", "a", "b", "c"]);
  assert.equal(s.player.trackId, "b", "排序不许换歌");
  assert.equal(s.queue.cursor, 2, "光标要跟着 b 走");
  assert.equal(s.player.status, "playing");
});

/* ---------- A-23 睡眠定时 ---------- */

test("睡眠定时：到点只暂停，不退出、不清队列", () => {
  reset();
  dispatch({ type: "sleep/set", endsAt: Date.now() + 1_800_000 });
  assert.equal(typeof getState().sleep.endsAt, "number");

  dispatch({ type: "sleep/expire" });
  const s = getState();
  assert.equal(s.sleep.endsAt, null, "到点后必须清掉定时，否则下一秒又触发一次");
  assert.equal(s.player.status, "paused");
  assert.equal(s.player.trackId, "b", "只暂停，不许退出或换歌");
  assert.equal(s.queue.items.length, 4);
  assert.equal(s.queue.cursor, 1);
});

test("睡眠定时：暂停态到点只是清定时，不改状态位", () => {
  reset(["x", "y"], 0);
  dispatch({ type: "player/pause" });
  dispatch({ type: "sleep/clear" }); // 没设置时也合法（幂等）
  dispatch({ type: "sleep/set", endsAt: 42 });
  dispatch({ type: "sleep/expire" });
  assert.equal(getState().sleep.endsAt, null);
  assert.equal(getState().player.status, "paused");
});

test("睡眠定时：没设定时收到 expire 不产生新状态（迟到的计时器）", () => {
  const before = getState();
  dispatch({ type: "sleep/expire" });
  assert.equal(getState(), before);
});

test("睡眠定时：非法 endsAt 被忽略", () => {
  dispatch({ type: "sleep/clear" });
  const before = getState();
  dispatch({ type: "sleep/set", endsAt: Number.NaN });
  assert.equal(getState(), before);
});

test("移动当前这一格到下一位：光标跟着，播放序不乱", () => {
  reset();
  dispatch({ type: "queue/move", from: 1, to: 2 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["a", "c", "b", "d"]);
  assert.equal(s.queue.cursor, 2);
  assert.equal(s.player.trackId, "b");
  assert.equal(s.queue.items[s.queue.cursor], "b", "cursor 与正在播的必须指向同一项");
});
