import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * 漫游牌面的来源优先级（用户 2026-11-06 报："收下播放后，上面信息不变"）。
 * 顺序错了会出两种病：点「换一首」看不到新牌；播到第 N 首卡片还停在第 1 抽。
 */
const { cardSource } = await import("../dist-test/roam-card.mjs");

test("刚抽到、还没收下 → 显示抽牌（点「换一首」必须立刻看到新牌）", () => {
  assert.equal(cardSource({ kept: false }, null), "pending");
  // 即使在播，未收下的新牌也要压过播放
  assert.equal(cardSource({ kept: false }, { songId: "1" }), "pending");
});

test("收下以后在播 → 跟播放走（播到第几首显示第几首）", () => {
  assert.equal(cardSource({ kept: true }, { songId: "2" }), "playing");
});

test("收下过但当前不在播 → 仍显示最后抽到的那张", () => {
  assert.equal(cardSource({ kept: true }, null), "drawn");
});

test("一张都没抽过但有 FM 在播 → 显示播放中的那首", () => {
  assert.equal(cardSource(undefined, { songId: "3" }), "playing");
  assert.equal(cardSource(undefined, null), "drawn");
});
