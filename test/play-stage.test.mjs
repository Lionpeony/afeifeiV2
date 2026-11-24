import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentOf, stageOf } from "../dist-test/play-stage.mjs";

/**
 * 演出状态机（docs/30 §41）的边界测试。
 * 这类「按进度折算段落 / 按末曲判定散场」的逻辑最容易在改进度条时顺手改坏，
 * 而界面只会表现为「灯不对」，所以把 30% / 70% / 最后一秒钉住。
 */

const base = {
  queueLength: 10,
  index: 3,
  playing: true,
  started: true,
  pos: 30,
  dur: 100,
};

test("段落按 0–30 / 30–70 / 70–100 切，边界归后一段", () => {
  assert.equal(segmentOf(0, 100), "intro");
  assert.equal(segmentOf(29.9, 100), "intro");
  assert.equal(segmentOf(30, 100), "chorus");
  assert.equal(segmentOf(69.9, 100), "chorus");
  assert.equal(segmentOf(70, 100), "outro");
  assert.equal(segmentOf(100, 100), "outro");
});

test("时长未知/为 0 时按主歌处理，不产生 NaN 段落", () => {
  assert.equal(segmentOf(12, 0), "intro");
  assert.equal(segmentOf(12, Number.NaN), "intro");
  assert.equal(segmentOf(-5, 100), "intro");
});

test("空队列与未开演都是候场", () => {
  assert.equal(stageOf({ ...base, queueLength: 0 }), "idle");
  assert.equal(stageOf({ ...base, started: false, playing: false }), "idle");
  assert.equal(stageOf({ ...base, started: false }), "idle");
});

test("中途是正场；末两首进安可", () => {
  assert.equal(stageOf(base), "playing");
  assert.equal(stageOf({ ...base, index: 7 }), "playing");
  assert.equal(stageOf({ ...base, index: 8 }), "encore");
  assert.equal(stageOf({ ...base, index: 9 }), "encore");
});

test("暂停不吞掉安可状态", () => {
  assert.equal(stageOf({ ...base, playing: false }), "paused");
  assert.equal(stageOf({ ...base, playing: false, index: 9, pos: 12 }), "paused");
});

test("末曲播到最后一秒且已停 → 散场；中场窗口优先于其他节点", () => {
  assert.equal(stageOf({ ...base, index: 9, playing: false, pos: 99.5 }), "curtain");
  assert.equal(stageOf({ ...base, index: 9, playing: false, pos: 40 }), "paused");
  assert.equal(stageOf({ ...base, index: 4, intermission: true }), "intermission");
  assert.equal(stageOf({ ...base, queueLength: 0, intermission: true }), "idle");
});

test("演出彩蛋概率按包分流，换场 btr 断弦 / mygo 水痕", async () => {
  const { pickStageEgg } = await import("../dist-test/play-stage.mjs");
  const roll = (v) => () => v;
  assert.equal(pickStageEgg("btr", 1, "chorus", roll(0.04)), "spot-slip");
  assert.equal(pickStageEgg("btr", 1, "chorus", roll(0.06)), null);
  assert.equal(pickStageEgg("gbc", 1, "chorus", roll(0.03)), "signal-tear");
  assert.equal(pickStageEgg("gbc", 1, "chorus", roll(0.05)), "passerby");
  assert.equal(pickStageEgg("gbc", 1, "chorus", roll(0.09)), "danmaku");
  assert.equal(pickStageEgg("gbc", 1, "chorus", roll(0.2)), null);
  assert.equal(pickStageEgg("mygo", 3, "chorus", roll(0.99)), "rain-up");
  assert.equal(pickStageEgg("mygo", 4, "chorus", roll(0)), null);
  assert.equal(pickStageEgg("default", 3, "chorus", roll(0)), null);
  assert.equal(pickStageEgg("btr", 1, "change", roll(0.005)), "string-snap");
  assert.equal(pickStageEgg("btr", 1, "change", roll(0.02)), null);
  assert.equal(pickStageEgg("mygo", 1, "change", roll(0.05)), "glass-streak");
  assert.equal(pickStageEgg("mygo", 1, "change", roll(0.09)), null);
  assert.equal(pickStageEgg("gbc", 1, "change", roll(0)), null);
});
