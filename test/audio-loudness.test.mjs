import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELER_FLOOR_DB, levelerTargetDb } from "../dist-test/audio-loudness.mjs";

test("静音/间奏不抬增益", () => {
  assert.equal(levelerTargetDb(LEVELER_FLOOR_DB - 1, 0), 0);
  assert.equal(levelerTargetDb(-Infinity, 2), 2);
});

test("太响时向下、太轻时向上，每次最多 1dB", () => {
  assert.equal(levelerTargetDb(-20, 0), 1);
  assert.equal(levelerTargetDb(-8, 0), -1);
});

test("2dB 死区内不动（防抖）", () => {
  assert.equal(levelerTargetDb(-15, 0), 0);
  assert.equal(levelerTargetDb(-13, 0), 0);
});

test("总增益封顶 ±6dB", () => {
  assert.equal(levelerTargetDb(-40, 6), 6);
  assert.equal(levelerTargetDb(0, -6), -6);
  assert.equal(levelerTargetDb(-30, 5), 6);
});
