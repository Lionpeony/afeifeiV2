import { test } from "node:test";
import assert from "node:assert/strict";
import { EQ_BANDS } from "../dist-test/audio-eq.mjs";
import { eqResponseDb, logFreqs } from "../dist-test/audio-eq-response.mjs";

/**
 * 只让第 i 段有增益的数组。段数从 EQ_BANDS 现取 —— 写死 6 个 0 会在改段数时静默失效
 * （2026-11-03 从 6 段扩到 10 段就踩过：测试还在断言 700Hz，而那里已经是 125Hz 的段）。
 */
const at = (i, db) => EQ_BANDS.map((_, k) => (k === i ? db : 0));

test("全 0 增益：曲线恒等于 0dB（不改声音）", () => {
  const db = eqResponseDb([], [100, 1000, 10000]);
  for (const v of db) assert.ok(Math.abs(v) < 1e-9, `0 增益处响应 ${v}dB`);
});

test("单段 +12dB：中心频率处响应 ≈ +12dB（peaking 的定义性质）", () => {
  const db = eqResponseDb(at(2, 12), [EQ_BANDS[2]]);
  assert.ok(Math.abs(db[0] - 12) < 0.01, `f0=${EQ_BANDS[2]}Hz 处 ${db[0].toFixed(2)}dB，应等于 12`);
});

test("远处泄漏小：最低段 +12dB 在 7.5kHz 处接近 0", () => {
  const db = eqResponseDb(at(0, 12), [7500]);
  assert.ok(Math.abs(db[0]) < 0.5, `泄漏 ${db[0].toFixed(2)}dB`);
});

test("级联 dB 相加 = 精确解：两段同为 +12 时中间谷底高于单段", () => {
  const between = Math.sqrt(EQ_BANDS[2] * EQ_BANDS[3]); // 两段中心之间的几何中点
  const both = eqResponseDb(at(2, 12).map((v, i) => (i === 3 ? 12 : v)), [between])[0];
  const single = eqResponseDb(at(2, 12), [between])[0];
  assert.ok(both > single, `级联 ${both.toFixed(2)} 应大于单段 ${single.toFixed(2)}`);
});

test("负增益对称：-12 与 +12 响应互为镜像（peaking A 与 1/A）", () => {
  const f0 = EQ_BANDS[0];
  const up = eqResponseDb(at(0, 12), [f0])[0];
  const down = eqResponseDb(at(0, -12), [f0])[0];
  assert.ok(Math.abs(up + down) < 0.5, `+12=${up.toFixed(2)} -12=${down.toFixed(2)}`);
});

test("logFreqs：20Hz–20kHz 对数取样，首尾正确", () => {
  const f = logFreqs(50);
  assert.equal(f.length, 50);
  assert.ok(Math.abs(f[0] - 20) < 1e-6);
  assert.ok(Math.abs(f[f.length - 1] - 20000) < 1e-6);
  for (let i = 1; i < f.length; i += 1) assert.ok(f[i] > f[i - 1], "必须严格递增");
});

test("采样率影响形状但不影响中心点峰值（peaking 在 f0 处恒等于 gainDb）", () => {
  for (const fs of [44100, 48000, 96000]) {
    const db = eqResponseDb(at(2, 6), [EQ_BANDS[2]], fs);
    assert.ok(Math.abs(db[0] - 6) < 0.01, `fs=${fs} 处 ${db[0].toFixed(2)}dB`);
  }
});

test("10 段全 +12：曲线处处为正，且不低于单段", () => {
  const all = EQ_BANDS.map(() => 12);
  const freqs = logFreqs(40);
  const both = eqResponseDb(all, freqs);
  const single = eqResponseDb(at(5, 12), freqs);
  both.forEach((v, i) => {
    assert.ok(v > 0, `${freqs[i].toFixed(0)}Hz 处 ${v.toFixed(2)}dB 应为正`);
    assert.ok(v >= single[i] - 1e-9, `${freqs[i].toFixed(0)}Hz 处全段 ${v} 少于单段 ${single[i]}`);
  });
});
