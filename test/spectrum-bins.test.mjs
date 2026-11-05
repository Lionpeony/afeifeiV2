import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSpectrum } from "../dist-test/audio-spectrum-bins.mjs";

test("aggregateSpectrum：空输入全 0，不造假波形", () => {
  assert.deepEqual(aggregateSpectrum([], 8), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(aggregateSpectrum([0, 0, 0, 0], 4), [0, 0, 0, 0]);
});

test("aggregateSpectrum：输出长度等于 bins，越界 bins 返回空", () => {
  const data = new Uint8Array(1024).fill(10);
  assert.equal(aggregateSpectrum(data, 48).length, 48);
  assert.deepEqual(aggregateSpectrum(data, 0), []);
});

test("aggregateSpectrum：对数分桶覆盖整个频段——最高频点落在最后一根柱子", () => {
  const data = new Uint8Array(1024);
  data[1023] = 255;
  const bins = aggregateSpectrum(data, 48);
  // 高频柱覆盖更宽的频段，单点会被平均稀释；判的是"映射到最后一根"而不是幅度
  assert.ok(bins[47] > 0, `最高频点应映射到最后一根，实际 ${bins[47]}`);
  assert.ok(bins.slice(0, 47).every((v) => v === 0), "其余柱子不该被点亮");
});

test("aggregateSpectrum：低频分辨率更高——第一个有效频点只点亮第一根柱子", () => {
  const data = new Uint8Array(1024);
  data[1] = 255; // 跳过 DC 后的第一个频点
  const bins = aggregateSpectrum(data, 48);
  assert.ok(bins[0] > 0.5, "频点 1 应落在第一根柱子");
  assert.ok(bins.slice(1).every((v) => v === 0), "低频点不该溢到第二根");
});

test("aggregateSpectrum：全幅输入每根柱子接近 1（0–255 归一化）", () => {
  const data = new Uint8Array(200).fill(255);
  const bins = aggregateSpectrum(data, 16);
  assert.ok(bins.every((v) => v > 0.98), "满幅应接近 1");
});
