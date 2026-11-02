import { test } from "node:test";
import assert from "node:assert/strict";
import { stageTint } from "../dist-test/stage-tint.mjs";

/** 把 hex 转成扁平 rgb 数组（测试输入用手写像素）。 */
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const px = (h, times = 1) => Array.from({ length: times }, () => hex(h)).flat();

test("格式：产出 oklch(L C H)，L 夹在 [0.35, 0.75]", () => {
  const tint = stageTint(px("#22aa44", 64));
  assert.match(tint, /^oklch\(0\.\d{3} 0\.\d{3} \d+\.\d\)$/);
  const L = Number(tint.match(/oklch\((0\.\d{3})/)[1]);
  assert.ok(L >= 0.35 && L <= 0.75, `L=${L} 越界`);
});

test("过亮/过暗都被夹回区间（白 → ≤0.75，黑 → ≥0.35）", () => {
  const white = Number(stageTint(px("#ffffff")).match(/oklch\((0\.\d{3})/)[1]);
  const black = Number(stageTint(px("#000000")).match(/oklch\((0\.\d{3})/)[1]);
  assert.ok(white <= 0.75, `白 L=${white}`);
  assert.ok(black >= 0.35, `黑 L=${black}`);
});

test("主色选择：绿海里掺几粒红，量化后色相仍是绿", () => {
  const tint = stageTint([...px("#22aa44", 60), ...px("#d8341c", 4)]);
  const H = Number(tint.match(/ (-?\d+\.\d)\)$/)[1]);
  // 绿在 OKLCH 色相 ≈ 140–150；红 ≈ 25–30
  assert.ok(H > 100 && H < 180, `H=${H} 落到了红那边`);
});

test("色相圆均值：350° 与 10° 的平均是 0° 附近，不是 180°", () => {
  // 手造两个色相位于 350°/10° 的像素：用近似色（紫红/橙红）验证不翻到对面
  const tint = stageTint([...px("#ff00c8"), ...px("#ff8000")]);
  const H = Number(tint.match(/ (-?\d+\.\d)\)$/)[1]);
  assert.ok(H < 45 || H > 315, `H=${H} 翻到了对面（线性均值的病）`);
});

test("空输入返回 null（调用方保留当前 tint）", () => {
  assert.equal(stageTint([]), null);
});
