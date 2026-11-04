import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDislike,
  clearDislikes,
  getDislikes,
  hasDislike,
  parseDislikes,
  remoteDislikeKey,
  removeDislike,
  subscribe,
} from "../dist-test/dislikes.mjs";

/* ---- 不喜欢名单（B-11）：本地过滤是承诺，上报是尽力而为 ---- */

const reset = () => clearDislikes();

test("remoteDislikeKey：源 + 曲目 id，不会和本地 trackId 撞", () => {
  assert.equal(remoteDislikeKey("netease", "123"), "netease:123");
});

test("addDislike：去重、去空格、超长截断、空串拒绝", () => {
  reset();
  assert.equal(addDislike("  a  "), true);
  assert.equal(addDislike("a"), false);
  assert.equal(getDislikes().size, 1);
  assert.equal(addDislike(""), false);
  addDislike("x".repeat(300));
  assert.equal([...getDislikes()].some((k) => k.length === 200), true);
});

test("addDislike 触发一次订阅；已在名单里不触发", () => {
  reset();
  let calls = 0;
  const stop = subscribe(() => {
    calls += 1;
  });
  addDislike("a");
  addDislike("a");
  assert.equal(calls, 1);
  stop();
});

test("removeDislike / clearDislikes：空操作也幂等", () => {
  reset();
  assert.equal(removeDislike("nope"), false);
  addDislike("a");
  assert.equal(removeDislike("a"), true);
  assert.equal(hasDislike("a"), false);
  addDislike("b");
  clearDislikes();
  clearDislikes();
  assert.equal(getDislikes().size, 0);
});

test("超过 500 条丢最旧的（名单不是无限账本）", () => {
  reset();
  for (let i = 0; i < 510; i += 1) addDislike(`k${i}`);
  assert.equal(getDislikes().size, 500);
  assert.equal(hasDislike("k0"), false);
  assert.equal(hasDislike("k509"), true);
  reset();
});

test("parseDislikes：坏 JSON / 非数组 / 坏条目一律丢", () => {
  assert.deepEqual(parseDislikes(null), []);
  assert.deepEqual(parseDislikes("{坏"), []);
  assert.deepEqual(parseDislikes("{}"), []);
  assert.deepEqual(parseDislikes('["a", 1, "  ", "b"]'), ["a", "b"]);
});
