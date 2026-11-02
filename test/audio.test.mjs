import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQ_BANDS,
  EQ_DEFAULT,
  GAIN_LIMIT_DB,
  PREAMP_DEFAULT,
  clampDb,
  dbToGain,
  sanitizeAudioConfig,
  sanitizeGains,
} from "../dist-test/audio-eq.mjs";
import { dispatch, getState, subscribe } from "../dist-test/kernel.mjs";

/* ---------------- 纯函数 ---------------- */

test("EQ_BANDS：6 段、严格递增", () => {
  assert.equal(EQ_BANDS.length, 6);
  for (let i = 1; i < EQ_BANDS.length; i += 1) assert.ok(EQ_BANDS[i] > EQ_BANDS[i - 1]);
});

test("默认值：6 段全 0，preamp 0", () => {
  assert.deepEqual(EQ_DEFAULT, [0, 0, 0, 0, 0, 0]);
  assert.equal(PREAMP_DEFAULT, 0);
});

test("clampDb：越界收进 ±12，非有限数一律回落 0（坏数据不放大）", () => {
  assert.equal(clampDb(15), GAIN_LIMIT_DB);
  assert.equal(clampDb(-15), -GAIN_LIMIT_DB);
  assert.equal(clampDb(0), 0);
  assert.equal(clampDb(Number.NaN), 0);
  assert.equal(clampDb(Number.POSITIVE_INFINITY), 0);
});

test("dbToGain：0dB = 1（不改声音），±12 与 10^(db/20) 一致", () => {
  assert.equal(dbToGain(0), 1);
  assert.ok(Math.abs(dbToGain(12) - 3.981) < 0.001);
  assert.ok(Math.abs(dbToGain(-12) - 0.251) < 0.001);
});

test("sanitizeGains：越界 clamp、非数补 0", () => {
  assert.deepEqual(sanitizeGains([0, 20, -20, Number.NaN, "x", 5]), [0, 12, -12, 0, 0, 5]);
});

test("sanitizeGains：长度不对 / 非数组 → 整组默认", () => {
  assert.deepEqual(sanitizeGains([1, 2, 3]), EQ_DEFAULT);
  assert.deepEqual(sanitizeGains("nope"), EQ_DEFAULT);
  assert.deepEqual(sanitizeGains(null), EQ_DEFAULT);
});

test("sanitizeAudioConfig：null / 坏结构 → 全默认", () => {
  assert.deepEqual(sanitizeAudioConfig(null), { preampDb: 0, eq: EQ_DEFAULT });
  assert.deepEqual(sanitizeAudioConfig("junk"), { preampDb: 0, eq: EQ_DEFAULT });
  assert.deepEqual(sanitizeAudioConfig({ preampDb: "3", eq: 7 }), { preampDb: 0, eq: EQ_DEFAULT });
});

test("sanitizeAudioConfig：合法数据原样保留（clamp 后）", () => {
  const cfg = sanitizeAudioConfig({ preampDb: -3, eq: [1, 2, 3, 4, 5, 6] });
  assert.deepEqual(cfg, { preampDb: -3, eq: [1, 2, 3, 4, 5, 6] });
});

/* ---------------- store 的 audio 域 ---------------- */

test("audio/setPreamp：clamp 到 ±12", () => {
  dispatch({ type: "audio/setPreamp", db: 30 });
  assert.equal(getState().audio.preampDb, 12);
  dispatch({ type: "audio/setPreamp", db: -30 });
  assert.equal(getState().audio.preampDb, -12);
  dispatch({ type: "audio/setPreamp", db: 0 });
  assert.equal(getState().audio.preampDb, 0);
});

test("audio/setEq：长度不齐整组拒绝", () => {
  const before = getState().audio.eq;
  dispatch({ type: "audio/setEq", gains: [1, 2, 3] });
  assert.deepEqual(getState().audio.eq, before, "长度不齐必须整组拒绝，部分生效更难排查");
});

test("audio/setEq：越界 clamp、数值生效", () => {
  dispatch({ type: "audio/setEq", gains: [12, -12, 0, 0, 0, 0] });
  assert.deepEqual(getState().audio.eq, [12, -12, 0, 0, 0, 0]);
  dispatch({ type: "audio/setEq", gains: [0, 0, 0, 0, 0, 0] });
});

test("audio：值没变不通知（幂等）", () => {
  let calls = 0;
  const off = subscribe(() => {
    calls += 1;
  });
  dispatch({ type: "audio/setPreamp", db: 0 });
  dispatch({ type: "audio/setEq", gains: [0, 0, 0, 0, 0, 0] });
  assert.equal(calls, 0);
  off();
});

test("audio/restore：整组生效", () => {
  dispatch({ type: "audio/restore", config: { preampDb: -6, eq: [3, 3, 0, 0, -3, -3] } });
  assert.equal(getState().audio.preampDb, -6);
  assert.deepEqual(getState().audio.eq, [3, 3, 0, 0, -3, -3]);
  dispatch({ type: "audio/restore", config: { preampDb: 0, eq: [0, 0, 0, 0, 0, 0] } });
});
