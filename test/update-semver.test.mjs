import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewer } from "../dist-test/update-semver.mjs";

test("isNewer：逐段数值比较", () => {
  assert.equal(isNewer("0.2.0", "0.1.0"), true);
  assert.equal(isNewer("0.1.1", "0.1.0"), true);
  assert.equal(isNewer("1.0.0", "0.9.9"), true);
  assert.equal(isNewer("0.1.0", "0.2.0"), false);
  assert.equal(isNewer("0.1.0", "0.1.0"), false, "相等不算新");
  assert.equal(isNewer("0.1.0", "0.1.1"), false);
});

test("isNewer：兼容 v 前缀", () => {
  assert.equal(isNewer("v0.2.0", "0.1.0"), true);
  assert.equal(isNewer("v0.1.0", "v0.1.0"), false);
});

test("isNewer：非 semver 形态一律不比当前新（发版纪律：tag 只用 主.次.补丁）", () => {
  assert.equal(isNewer("abc", "0.1.0"), false);
  assert.equal(isNewer("0.2", "0.1.0"), false);
  assert.equal(isNewer("0.2.0-beta.1", "0.1.0"), false);
  assert.equal(isNewer("", "0.1.0"), false);
});
