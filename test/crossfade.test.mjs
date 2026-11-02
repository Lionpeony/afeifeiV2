import { test } from "node:test";
import assert from "node:assert/strict";
import { fadeCurves, sanitizeCrossfade } from "../dist-test/audio-crossfade.mjs";
import { sanitizeAudioConfig } from "../dist-test/audio-eq.mjs";
import { dispatch, getState } from "../dist-test/kernel.mjs";

test("fadeCurves：两端锚点正确（out: 1→0，in: 0→1）", () => {
  const { out, inn } = fadeCurves();
  assert.equal(out.length, inn.length);
  assert.ok(Math.abs(out[0] - 1) < 1e-6 && Math.abs(out[out.length - 1]) < 1e-6);
  assert.ok(Math.abs(inn[0]) < 1e-6 && Math.abs(inn[inn.length - 1] - 1) < 1e-6);
});

test("等功率：任意交叉点 out²+in² ≈ 1（没有 -3dB 响度坑）", () => {
  const { out, inn } = fadeCurves(64);
  for (let i = 0; i < out.length; i += 1) {
    assert.ok(Math.abs(out[i] ** 2 + inn[i] ** 2 - 1) < 1e-6, `p=${i} 处 ${out[i] ** 2 + inn[i] ** 2}`);
  }
});

test("sanitizeCrossfade：只认 0/3/6，其余一律关", () => {
  assert.equal(sanitizeCrossfade(0), 0);
  assert.equal(sanitizeCrossfade(3), 3);
  assert.equal(sanitizeCrossfade(6), 6);
  assert.equal(sanitizeCrossfade(4), 0);
  assert.equal(sanitizeCrossfade(-1), 0);
  assert.equal(sanitizeCrossfade("3"), 0);
});

test("sanitizeAudioConfig：crossfadeSec 坏数据回落 0，合法值保留", () => {
  assert.equal(sanitizeAudioConfig(null).crossfadeSec, 0);
  assert.equal(sanitizeAudioConfig({ preampDb: 0, eq: [0, 0, 0, 0, 0, 0], crossfadeSec: 9 }).crossfadeSec, 0);
  assert.equal(sanitizeAudioConfig({ preampDb: 0, eq: [0, 0, 0, 0, 0, 0], crossfadeSec: 6 }).crossfadeSec, 6);
});

test("audio/setCrossfade：档位生效，非法值回落 0，值同短路", () => {
  dispatch({ type: "audio/setCrossfade", sec: 3 });
  assert.equal(getState().audio.crossfadeSec, 3);
  dispatch({ type: "audio/setCrossfade", sec: 99 });
  assert.equal(getState().audio.crossfadeSec, 0);
  dispatch({ type: "audio/setCrossfade", sec: 0 });
  assert.equal(getState().audio.crossfadeSec, 0);
});
