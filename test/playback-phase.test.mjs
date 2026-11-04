import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseLabel, phaseOf } from "../dist-test/playback-phase.mjs";

/**
 * P0-26 判据：**缓冲中与解码中可区分**。
 * 判据不是"有没有转圈"，而是"这两个状态给出的是两个不同的词" ——
 * 用户能做的事不同（等一会儿 / 换网络或音质）。
 */

test("playing + buffering = 缓冲中，不是解码中", () => {
  const buffering = phaseOf("playing", true);
  assert.equal(buffering, "buffering");
  const label = phaseLabel(buffering, false);
  assert.equal(label, "缓冲中…");
  assert.notEqual(label, phaseLabel("loading", false), "两个词必须不同，否则等于没区分");
});

test("loading（取源 / 解码中）与 playing 分得开", () => {
  assert.equal(phaseOf("loading", false), "loading");
  assert.equal(phaseLabel("loading", false), "解码中…");
  assert.equal(phaseOf("playing", false), "playing");
});

test("迟到的 buffering 不会污染非播放态", () => {
  // 暂停后元素可能还发一次 waiting；phaseOf 只看 status，不该变成缓冲
  assert.equal(phaseOf("paused", true), "paused");
  assert.equal(phaseOf("loading", true), "loading");
});

test("其余阶段各有各的文案（空态不是空白）", () => {
  assert.equal(phaseLabel("idle", false), "从曲库选一首开始");
  assert.equal(phaseLabel("playing", true), "在线音源");
  assert.equal(phaseLabel("playing", false), "本地曲库");
  assert.equal(phaseLabel("paused", false), "已暂停");
  assert.equal(phaseLabel("ended", false), "播完了");
  assert.equal(phaseLabel("error", false), "这首歌播不了");
});
