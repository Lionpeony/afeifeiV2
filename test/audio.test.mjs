import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQ_BANDS,
  EQ_DEFAULT,
  EQ_PRESETS,
  GAIN_LIMIT_DB,
  PREAMP_DEFAULT,
  clampDb,
  dbToGain,
  migrateGains6,
  sameGains,
  sanitizeAudioConfig,
  sanitizeGains,
  writeEqGains,
} from "../dist-test/audio-eq.mjs";
import { dispatch, getState, subscribe } from "../dist-test/kernel.mjs";

/* ---------------- 纯函数 ---------------- */

test("EQ_BANDS：10 段（A-06 判据 ≥10）、严格递增、覆盖 32Hz–16kHz", () => {
  assert.equal(EQ_BANDS.length, 10);
  for (let i = 1; i < EQ_BANDS.length; i += 1) assert.ok(EQ_BANDS[i] > EQ_BANDS[i - 1]);
  assert.equal(EQ_BANDS[0], 32);
  assert.equal(EQ_BANDS[EQ_BANDS.length - 1], 16000);
});

test("默认值：10 段全 0，preamp 0", () => {
  assert.deepEqual(EQ_DEFAULT, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
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

test("writeEqGains：写进滤波器的必须是 dB 原值（不是线性增益）", () => {
  // 曾经这里套了 dbToGain：+6dB 变成 2.0dB，整条 EQ 听感偏软
  const nodes = EQ_BANDS.map(() => ({ gain: { value: 0 } }));
  writeEqGains(nodes, [6, -6, 12, -12, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(
    nodes.map((n) => n.gain.value),
    [6, -6, 12, -12, 0, 0, 0, 0, 0, 0],
  );
});

test("writeEqGains：段数不齐时缺的按 0，多出来的忽略（图不负责校验）", () => {
  const nodes = EQ_BANDS.map(() => ({ gain: { value: 0 } }));
  writeEqGains(nodes, [3]);
  assert.equal(nodes[0].gain.value, 3);
  assert.equal(nodes[9].gain.value, 0);
});

test("sanitizeGains：10 段越界 clamp、非数补 0", () => {
  assert.deepEqual(sanitizeGains([0, 20, -20, Number.NaN, "x", 5, 0, 0, 0, 0]), [0, 12, -12, 0, 0, 5, 0, 0, 0, 0]);
});

test("sanitizeGains：老 6 段存档按最近频段迁移，用户 EQ 不被清零", () => {
  assert.deepEqual(migrateGains6([6, 0, 0, 0, 0, -6]), [6, 6, 0, 0, 0, 0, 0, 0, 0, -6]);
  // 迁移后长度必须等于新段数，且仍守 ±12
  const got = sanitizeGains([6, 0, 0, 40, 0, -6]);
  assert.equal(got.length, EQ_BANDS.length);
  assert.ok(got.every((v) => Math.abs(v) <= GAIN_LIMIT_DB));
});

test("sanitizeGains：长度既不等于 10 也不等于 6 / 非数组 → 整组默认", () => {
  assert.deepEqual(sanitizeGains([1, 2, 3]), EQ_DEFAULT);
  assert.deepEqual(sanitizeGains("nope"), EQ_DEFAULT);
  assert.deepEqual(sanitizeGains(null), EQ_DEFAULT);
});

test("预设：≥3 个（A-06 判据）、段数对齐、值在 ±12、id/name 不重复", () => {
  assert.ok(EQ_PRESETS.length >= 3, `预设只有 ${EQ_PRESETS.length} 个`);
  for (const p of EQ_PRESETS) {
    assert.equal(p.gains.length, EQ_BANDS.length, `${p.name} 段数不对`);
    assert.ok(p.gains.every((v) => Math.abs(v) <= GAIN_LIMIT_DB), `${p.name} 有越界值`);
  }
  assert.equal(new Set(EQ_PRESETS.map((p) => p.id)).size, EQ_PRESETS.length);
  assert.equal(new Set(EQ_PRESETS.map((p) => p.name)).size, EQ_PRESETS.length);
  // 平直必须是全 0，否则「重置」和它视觉不一致
  assert.deepEqual(EQ_PRESETS.find((p) => p.id === "flat").gains, EQ_DEFAULT);
});

test("sameGains：长度不同 / 任一不同都算不相等", () => {
  assert.equal(sameGains([0, 0], [0, 0]), true);
  assert.equal(sameGains([0, 0], [0, 1]), false);
  assert.equal(sameGains([0, 0], [0]), false);
});

test("sanitizeAudioConfig：null / 坏结构 → 全默认", () => {
  assert.deepEqual(sanitizeAudioConfig(null), { preampDb: 0, eq: EQ_DEFAULT, crossfadeSec: 0 });
  assert.deepEqual(sanitizeAudioConfig("junk"), { preampDb: 0, eq: EQ_DEFAULT, crossfadeSec: 0 });
  assert.deepEqual(sanitizeAudioConfig({ preampDb: "3", eq: 7 }), {
    preampDb: 0,
    eq: EQ_DEFAULT,
    crossfadeSec: 0,
  });
});

test("sanitizeAudioConfig：10 段合法数据原样保留（clamp 后）", () => {
  const eq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const cfg = sanitizeAudioConfig({ preampDb: -3, eq, crossfadeSec: 3 });
  assert.deepEqual(cfg, { preampDb: -3, eq, crossfadeSec: 3 });
});

test("sanitizeAudioConfig：老 6 段存档读出来是 10 段", () => {
  const cfg = sanitizeAudioConfig({ preampDb: 0, eq: [1, 2, 3, 4, 5, 6] });
  assert.equal(cfg.eq.length, EQ_BANDS.length);
  assert.deepEqual(cfg.eq, [1, 1, 2, 2, 3, 3, 4, 4, 5, 6]);
});

/* ---------------- store 的 audio 域 ---------------- */

test("store 初始 EQ 段数与 EQ_BANDS 对齐（跨环一致性，kernel 不 import capability）", () => {
  assert.equal(getState().audio.eq.length, EQ_BANDS.length);
});

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
  dispatch({ type: "audio/setEq", gains: [1, 2, 3, 4, 5, 6] });
  assert.deepEqual(getState().audio.eq, before, "老 6 段也不能直接塞进来（迁移在 capability 侧）");
});

test("audio/setEq：10 段越界 clamp、数值生效", () => {
  dispatch({ type: "audio/setEq", gains: [12, -12, 0, 0, 0, 0, 0, 0, 0, 3] });
  assert.deepEqual(getState().audio.eq, [12, -12, 0, 0, 0, 0, 0, 0, 0, 3]);
  dispatch({ type: "audio/setEq", gains: EQ_DEFAULT });
});

test("audio：值没变不通知（幂等）", () => {
  let calls = 0;
  const off = subscribe(() => {
    calls += 1;
  });
  dispatch({ type: "audio/setPreamp", db: 0 });
  dispatch({ type: "audio/setEq", gains: EQ_DEFAULT });
  assert.equal(calls, 0);
  off();
});

test("audio/restore：整组生效", () => {
  const eq = [3, 3, 0, 0, -3, -3, 0, 2, 0, 0];
  dispatch({ type: "audio/restore", config: { preampDb: -6, eq, crossfadeSec: 3 } });
  assert.equal(getState().audio.preampDb, -6);
  assert.deepEqual(getState().audio.eq, eq);
  assert.equal(getState().audio.crossfadeSec, 3);
  dispatch({ type: "audio/restore", config: { preampDb: 0, eq: EQ_DEFAULT, crossfadeSec: 0 } });
});

test("audio/restore：段数不齐回落全 0，不把 6 段塞进 10 段的图", () => {
  dispatch({ type: "audio/restore", config: { preampDb: -6, eq: [3, 3, 0, 0, -3, -3] } });
  const s = getState().audio;
  assert.equal(s.eq.length, EQ_BANDS.length);
  assert.deepEqual(s.eq, EQ_DEFAULT);
  assert.equal(s.preampDb, -6, "preamp 与段数无关，照常生效");
  dispatch({ type: "audio/restore", config: { preampDb: 0, eq: EQ_DEFAULT, crossfadeSec: 0 } });
});
