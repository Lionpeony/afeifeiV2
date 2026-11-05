import test from "node:test";
import assert from "node:assert/strict";
import {
  getActiveSource,
  initActiveSource,
  setActiveSource,
  subscribeActiveSource,
} from "../dist-test/active-source.mjs";

test("当前音源：设置后全局可见，重复设置不通知", () => {
  const seen = [];
  const off = subscribeActiveSource(() => seen.push(getActiveSource()));
  initActiveSource("netease");
  assert.equal(getActiveSource(), "netease");
  setActiveSource("netease");
  assert.deepEqual(seen, ["netease"], "同一个值不该再通知");
  setActiveSource("qq");
  assert.equal(getActiveSource(), "qq");
  assert.deepEqual(seen, ["netease", "qq"]);
  off();
  setActiveSource("netease");
  assert.deepEqual(seen, ["netease", "qq"], "取消订阅后不再收到");
});

test("initActiveSource：只在为空时设初值，不覆盖用户已选的源", () => {
  setActiveSource("qq");
  initActiveSource("netease");
  assert.equal(getActiveSource(), "qq");
});
