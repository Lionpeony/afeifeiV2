import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * 播放状态机矩阵（用户 2026-11-06："BUG 太多了，自己检查一遍"）。
 *
 * 单个功能的用例容易漏，这里只钉**跨动作的不变量**：
 *   I1 `playing / paused / loading` 必须有 trackId —— 否则界面说在播、引擎没东西可放
 *   I2 当前曲在队列里时，cursor 必须指向它 —— 否则「下一首」从别的格子起步
 *   I3 有 trackId 就不能是 idle —— 否则进度条与底栏打架
 * 每个动作之后都跑一遍，状态机哪里自相矛盾会立刻掉出来。
 */
const { dispatch, getState } = await import("../dist-test/kernel.mjs");

const P = () => getState().player;
const Q = () => getState().queue;

function inv(step) {
  const s = getState();
  const p = s.player;
  if (p.status === "playing" || p.status === "paused" || p.status === "loading") {
    assert.ok(p.trackId, `${step}: ${p.status} 但 trackId 为空（界面在播、引擎没东西放）`);
  }
  if (p.trackId && s.queue.items.includes(p.trackId)) {
    assert.equal(
      s.queue.cursor,
      s.queue.items.indexOf(p.trackId),
      `${step}: cursor=${s.queue.cursor}，当前曲在 ${s.queue.items.indexOf(p.trackId)}`,
    );
  }
  if (p.trackId && p.status === "idle") {
    assert.fail(`${step}: 有曲目却进了 idle`);
  }
}

/** 到达「队列 + 正在播第一首」 */
const reset = (items, startAt = 0) => {
  dispatch({ type: "queue/set", items, startAt });
  dispatch({ type: "player/play" });
};

test("矩阵 · 基础播放：play / pause / toggle 来回不越界", () => {
  reset(["a", "b", "c"]);
  assert.equal(P().status, "playing");
  inv("play");

  dispatch({ type: "player/pause" });
  assert.equal(P().status, "paused");
  inv("pause");

  dispatch({ type: "player/play" });
  assert.equal(P().status, "playing");
  inv("resume");

  dispatch({ type: "player/toggle" });
  assert.equal(P().status, "paused");
  inv("toggle→paused");

  dispatch({ type: "player/toggle" });
  assert.equal(P().status, "playing");
  inv("toggle→playing");
});

test("矩阵 · 空队列：任何「播」的动作都不许进 playing", () => {
  dispatch({ type: "queue/clear" });
  assert.equal(P().status, "idle");

  dispatch({ type: "player/play" });
  inv("空队列 play");

  dispatch({ type: "player/toggle" });
  inv("空队列 toggle");

  dispatch({ type: "queue/next" });
  inv("空队列 next");

  dispatch({ type: "queue/prev", atPositionMs: 0 });
  inv("空队列 prev");
});

test("矩阵 · 切歌：中间进下一首，队尾如实结束，再点不假装", () => {
  reset(["a", "b"]);
  dispatch({ type: "queue/next" });
  assert.equal(P().trackId, "b");
  assert.equal(P().status, "playing");
  inv("next→b");

  dispatch({ type: "queue/next" }); // 队尾，order 模式
  assert.equal(P().status, "ended");
  inv("队尾");

  dispatch({ type: "queue/next" }); // 再点一次
  assert.equal(P().status, "ended");
  inv("队尾再点");
});

test("矩阵 · 播完后点播放：必须真的播起来，不能停在空曲目上", () => {
  reset(["a", "b"], 0);
  dispatch({ type: "queue/mode", mode: "order" });
  dispatch({ type: "player/ended" }); // a 播完 → b
  assert.equal(P().trackId, "b");
  dispatch({ type: "player/ended" }); // b 播完 → 队尾
  assert.equal(P().status, "ended");
  inv("播完到队尾");

  dispatch({ type: "player/play" });
  inv("播完后点播放");
  assert.equal(P().status, "playing", "点播放就该响，哪怕从头重播也要有声音");
});

test("矩阵 · 暂停时切歌：切了就要播（用户要的是换一首听）", () => {
  reset(["a", "b", "c"]);
  dispatch({ type: "player/pause" });
  dispatch({ type: "queue/next" });
  assert.equal(P().trackId, "b");
  assert.equal(P().status, "playing");
  inv("暂停时 next");
});

test("矩阵 · 删当前曲：接下一首，状态跟着原来走", () => {
  reset(["a", "b", "c"], 1);
  assert.equal(P().trackId, "b");

  dispatch({ type: "queue/remove", index: 1 });
  assert.equal(P().trackId, "c");
  assert.equal(P().status, "playing");
  inv("在播时删当前");

  dispatch({ type: "player/pause" });
  reset(["x", "y"], 0);
  dispatch({ type: "player/pause" });
  dispatch({ type: "queue/remove", index: 0 });
  assert.equal(P().trackId, "y");
  assert.equal(P().status, "paused", "暂停中删歌不该自己响");
  inv("暂停时删当前");
});

test("矩阵 · 删到空：进空态，之后点播放不许假装在播", () => {
  reset(["a"]);
  dispatch({ type: "queue/remove", index: 0 });
  assert.equal(P().trackId, null);
  assert.equal(P().status, "ended");
  inv("删到空");

  dispatch({ type: "player/toggle" });
  inv("删空后 toggle");
  assert.notEqual(P().status, "playing", "队列空了，toggle 不该把界面按成在播");
});

test("矩阵 · 重启恢复：cue 停暂停，点播放才响", () => {
  dispatch({ type: "queue/set", items: ["a", "b"], startAt: 1 });
  dispatch({ type: "player/cue", trackId: "b", positionMs: 0 });
  assert.equal(P().status, "loading");
  inv("cue");

  dispatch({ type: "player/ready" });
  assert.equal(P().status, "paused", "恢复后要停在暂停（等用户按播放）");
  inv("cue+ready");

  dispatch({ type: "player/play" });
  assert.equal(P().status, "playing");
  inv("cue+play");
});

test("矩阵 · 播放中收到 ready（切歌后元数据迟到）：不许按成暂停", () => {
  reset(["a", "b"]);
  dispatch({ type: "player/ready" });
  assert.equal(P().status, "playing");
  inv("ready 迟到");
});

test("矩阵 · 播一首不在队列里的歌：能播，但不许把 cursor 带跑偏", () => {
  reset(["a", "b"], 0);
  dispatch({ type: "player/play", trackId: "zzz", trackTitle: "外部一首" });
  assert.equal(P().trackId, "zzz");
  assert.equal(P().status, "playing");
  assert.equal(Q().cursor, 0, "不在队列里的歌不该改 cursor");

  // 之后点下一首：从当前队列位置继续，不是从 zzz 乱推
  dispatch({ type: "queue/next" });
  assert.equal(P().trackId, "a", "队列外的歌播完/下一首应回到队列起点");
  inv("外部曲后 next");
});

test("矩阵 · 单曲循环播完：重播本曲，不切下一首", () => {
  reset(["a", "b"], 0);
  dispatch({ type: "queue/mode", mode: "repeat-one" });
  dispatch({ type: "player/ended" });
  assert.equal(P().trackId, "a");
  assert.equal(P().status, "playing");
  assert.equal(P().positionMs, 0);
  inv("repeat-one ended");
});

test("矩阵 · 随机模式走到底：允许结束，但不许播不存在的曲目", () => {
  dispatch({ type: "queue/clear" });
  dispatch({ type: "queue/set", items: ["a", "b", "c"], startAt: 0 });
  dispatch({ type: "player/play" });
  dispatch({ type: "queue/mode", mode: "shuffle" });
  for (let i = 0; i < 6; i += 1) {
    dispatch({ type: "queue/next" });
    inv(`shuffle next #${i}`);
  }
});

test("矩阵 · 清空队列后 cue 旧曲：不许留着孤儿状态", () => {
  reset(["a"], 0);
  dispatch({ type: "queue/clear" });
  dispatch({ type: "player/cue", trackId: "a", positionMs: 0 });
  inv("clear 后 cue");
});
