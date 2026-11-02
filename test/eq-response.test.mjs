import { test } from "node:test";
import assert from "node:assert/strict";
import { EQ_BANDS } from "../dist-test/audio-eq.mjs";
import { eqResponseDb, logFreqs } from "../dist-test/audio-eq-response.mjs";

test("全 0 增益：曲线恒等于 0dB（不改声音）", () => {
  const db = eqResponseDb([0, 0, 0, 0, 0, 0], [100, 1000, 10000]);
  for (const v of db) assert.ok(Math.abs(v) < 1e-9, `0 增益处响应 ${v}dB`);
});

test("单段 +12dB：中心频率处响应 ≈ +12dB（peaking 的定义性质）", () => {
  const gains = [0, 0, 12, 0, 0, 0];
  const db = eqResponseDb(gains, [700]);
  assert.ok(Math.abs(db[0] - 12) < 0.01, `f0=700Hz 处 ${db[0].toFixed(2)}dB，应等于 12`);
});

test("远处泄漏小：+12dB@60Hz 在 7.5kHz 处接近 0", () => {
  const gains = [12, 0, 0, 0, 0, 0];
  const db = eqResponseDb(gains, [7500]);
  assert.ok(Math.abs(db[0]) < 0.5, `泄漏 ${db[0].toFixed(2)}dB`);
});

test("级联 dB 相加 = 精确解：两段同为 +12 时中心附近超过单段", () => {
  const gains = [0, 0, 12, 12, 0, 0];
  const at = eqResponseDb(gains, [2000])[0]; // 两段中心（700/2500）之间的谷
  const single = eqResponseDb([0, 0, 12, 0, 0, 0], [2000])[0];
  assert.ok(at > single, `级联 ${at.toFixed(2)} 应大于单段 ${single.toFixed(2)}`);
});

test("负增益对称：-12 与 +12 响应互为镜像（peaking A 与 1/A）", () => {
  const up = eqResponseDb([12, 0, 0, 0, 0, 0], [60])[0];
  const down = eqResponseDb([-12, 0, 0, 0, 0, 0], [60])[0];
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
  const gains = [0, 0, 6, 0, 0, 0];
  for (const fs of [44100, 48000, 96000]) {
    const db = eqResponseDb(gains, [EQ_BANDS[2]], fs);
    assert.ok(Math.abs(db[0] - 6) < 0.01, `fs=${fs} 处 ${db[0].toFixed(2)}dB`);
  }
});
