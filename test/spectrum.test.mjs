import { test } from "node:test";
import assert from "node:assert/strict";
import { SILENT, barHeights } from "../dist-test/stage-spectrum.mjs";

/**
 * A-07 判据「频谱与音量同步」的可断部分：
 * 音量（analyser 桶值）为 0 时柱高必须是 0 —— 上一版每帧 Math.max(2, …)
 * 会让暂停后的屏幕留一排矮柱，看着像还在放。
 */

const H = 120;
const BARS = 48;

test("静音（全 0）→ 全 0，不留 2px 地板线", () => {
  const bars = barHeights(new Array(BARS).fill(0), BARS, H);
  assert.equal(bars.length, BARS);
  assert.ok(
    bars.every((h) => h === 0),
    "静音时不该有柱子",
  );
});

test("无数据（图未建 / null）→ 全 0，不画假波形", () => {
  assert.deepEqual(barHeights(null, BARS, H), new Array(BARS).fill(0));
  assert.deepEqual(barHeights(undefined, BARS, H), new Array(BARS).fill(0));
});

test("底噪（< SILENT）也算静音", () => {
  const bars = barHeights(new Array(BARS).fill(SILENT / 2), BARS, H);
  assert.ok(bars.every((h) => h === 0));
});

test("音量变大 → 柱变高（同位置单调）", () => {
  const make = (v) => {
    const d = new Array(BARS).fill(0);
    d[7] = v;
    return barHeights(d, BARS, H)[7];
  };
  const a = make(0.1);
  const b = make(0.4);
  assert.ok(a > 0, "0.1 应当看得见");
  assert.ok(b > a, "0.4 必须比 0.1 高");
});

test("柱高按 90% 封顶，超范围输入不会溢出画布", () => {
  const d = new Array(BARS).fill(1);
  const bars = barHeights(d, BARS, H);
  assert.ok(bars.every((h) => h === H * 0.9));
  const over = barHeights(new Array(BARS).fill(9), BARS, H);
  assert.ok(over.every((h) => h <= H * 0.9), "越界值必须夹住");
});

test("长度永远等于 bars（画布宽度 ↔ 柱子数对齐）", () => {
  const d = [0.5, 0.2, 0.9];
  assert.equal(barHeights(d, 8, H).length, 8);
  assert.equal(barHeights(d, 48, H).length, 48);
});
