import { test } from "node:test";
import assert from "node:assert/strict";
import { FailureBackoff } from "../dist-test/net-backoff.mjs";

test("前两次失败不熔断", () => {
  const b = new FailureBackoff();
  b.fail("song_url", 1_000);
  b.fail("song_url", 1_000);
  assert.equal(b.waitMs("song_url", 1_000), 0);
});

test("第三次失败开始冷却，到点自动恢复", () => {
  const b = new FailureBackoff();
  b.fail("song_url", 1_000);
  b.fail("song_url", 1_000);
  b.fail("song_url", 1_000);
  assert.equal(b.waitMs("song_url", 1_000), 2_000);
  assert.equal(b.waitMs("song_url", 2_999), 1);
  assert.equal(b.waitMs("song_url", 3_000), 0);
});

test("连续失败按阶梯升级，超过步数后取最后一级", () => {
  const b = new FailureBackoff();
  for (let i = 0; i < 3; i += 1) b.fail("lyric", 0);
  assert.equal(b.waitMs("lyric", 0), 2_000);
  b.fail("lyric", 0);
  assert.equal(b.waitMs("lyric", 0), 5_000);
  for (let i = 0; i < 10; i += 1) b.fail("lyric", 0);
  assert.equal(b.waitMs("lyric", 0), 60_000);
});

test("成功一次即清零", () => {
  const b = new FailureBackoff();
  for (let i = 0; i < 3; i += 1) b.fail("search", 0);
  b.ok("search");
  assert.equal(b.waitMs("search", 0), 0);
  b.fail("search", 0);
  b.fail("search", 0);
  assert.equal(b.waitMs("search", 0), 0, "清零后重新从阈值前开始");
});

test("不同 key 互不影响", () => {
  const b = new FailureBackoff();
  for (let i = 0; i < 3; i += 1) b.fail("url", 0);
  assert.ok(b.waitMs("url", 0) > 0);
  assert.equal(b.waitMs("search", 0), 0);
});

test("threshold 可配置为 1", () => {
  const b = new FailureBackoff({ threshold: 1 });
  b.fail("daily", 0);
  assert.equal(b.waitMs("daily", 0), 2_000);
});
