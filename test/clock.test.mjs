import { test } from "node:test";
import assert from "node:assert/strict";
import { Clock, driftMs, interpolate, shouldResync } from "../dist-test/clock.mjs";

/* ---------- 纯函数 ---------- */

test("interpolate：锚点之后线性前进", () => {
  assert.equal(interpolate(1000, 5000, 5250), 1250);
});

test("interpolate：now 早于锚点时不倒退", () => {
  assert.equal(interpolate(1000, 5000, 4000), 1000, "时间只能向前，负增量要被吃掉");
});

test("driftMs 取绝对偏差", () => {
  assert.equal(driftMs(1000, 960), 40);
  assert.equal(driftMs(960, 1000), 40);
});

test("shouldResync：超过阈值要重锚", () => {
  assert.equal(shouldResync(1000, 1060), true);
});

test("shouldResync：阈值内不动", () => {
  assert.equal(shouldResync(1000, 1020), false);
});

test("shouldResync：恰好等于阈值不重锚（严格大于）", () => {
  assert.equal(shouldResync(1000, 1050), false);
});

/* ---------- Clock ---------- */

test("start 之后按插值走表", () => {
  const c = new Clock();
  c.start(0, 1000);
  assert.equal(c.t(1500), 500);
});

test("stop 之后位置冻结", () => {
  const c = new Clock();
  c.start(0, 1000);
  c.stop(1500);
  assert.equal(c.t(9000), 500, "停表后时间不许再走");
});

test("seek 直接改位置", () => {
  const c = new Clock();
  c.start(0, 1000);
  c.seek(30000, 1200);
  assert.equal(c.t(1200), 30000);
});

test("seek 到负数会被夹到 0", () => {
  const c = new Clock();
  c.start(0, 1000);
  c.seek(-500, 1000);
  assert.equal(c.t(1000), 0);
});

test("未 attach 时间源时只用插值，不报错", () => {
  const c = new Clock();
  c.start(2000, 0);
  assert.equal(c.t(300), 2300);
});

test("attach 后偏差超阈值：吸附到真实值并计数", () => {
  const c = new Clock();
  c.attach(() => 5000);
  c.start(0, 0);
  assert.equal(c.t(100), 5000, "推算 100ms、真实 5000ms，必须吸附");
  assert.equal(c.resyncs(), 1);
});

test("attach 后偏差在阈值内：保持插值", () => {
  const c = new Clock();
  c.attach(() => 110);
  c.start(0, 0);
  assert.equal(c.t(100), 100);
  assert.equal(c.resyncs(), 0);
});

test("时间源返回 null 时退回插值", () => {
  const c = new Clock();
  c.attach(() => null);
  c.start(0, 0);
  assert.equal(c.t(700), 700);
  assert.equal(c.resyncs(), 0);
});

test("长时间播放：靠吸附把累积漂移压回去", () => {
  const c = new Clock();
  let real = 0;
  c.attach(() => real);
  c.start(0, 0);

  // 模拟 60 秒音频、每 100ms 取一次，真实值每次比插值慢 1ms 累积
  let now = 0;
  for (let i = 1; i <= 600; i += 1) {
    now = i * 100;
    real = i * 100 - Math.min(i, 30); // 最多落后 30ms
    c.t(now);
  }
  const value = c.t(now);
  assert.ok(Math.abs(value - real) <= 50, `漂移必须压回阈值内，实际 ${value - real}ms`);
});
