import { test } from "node:test";
import assert from "node:assert/strict";
import { scrollTopFor, selectVisible } from "../dist-test/projection.mjs";

const ROW = 36;

test("顶部：从 0 开始，含 overscan", () => {
  const w = selectVisible(5000, 0, 720, ROW, 6);
  assert.equal(w.start, 0);
  assert.ok(w.end >= Math.ceil(720 / ROW));
  assert.equal(w.offsetY, 0);
});

test("总高 = 行数 × 行高（撑起滚动条）", () => {
  assert.equal(selectVisible(5000, 0, 720, ROW).totalHeight, 5000 * ROW);
});

test("中段：起始行 = scrollTop / 行高 - overscan", () => {
  const w = selectVisible(5000, 3600, 720, ROW, 6);
  assert.equal(w.start, Math.floor(3600 / ROW) - 6);
  assert.equal(w.offsetY, w.start * ROW);
});

test("渲染行数远小于总行数（虚拟化的意义）", () => {
  const w = selectVisible(5000, 3600, 720, ROW, 6);
  assert.ok(w.end - w.start < 40, `只该渲染几十行，实际 ${w.end - w.start}`);
});

test("底部：end 不超过总行数", () => {
  const w = selectVisible(5000, 5000 * ROW, 720, ROW, 6);
  assert.equal(w.end, 5000);
});

test("空列表：全 0，不抛错", () => {
  assert.deepEqual(selectVisible(0, 0, 720, ROW), { start: 0, end: 0, offsetY: 0, totalHeight: 0 });
});

test("行高为 0 时不给除零结果", () => {
  assert.equal(selectVisible(100, 0, 720, 0).end, 0);
});

test("负 scrollTop 被夹到 0（弹性滚动会给负值）", () => {
  assert.equal(selectVisible(100, -200, 720, ROW).start, 0);
});

test("scrollTopFor：定位到某行时给它留出上方 1/3 视口", () => {
  assert.equal(scrollTopFor(100, ROW, 720), 100 * ROW - 240);
});

test("scrollTopFor：前几行不会算出负数", () => {
  assert.equal(scrollTopFor(2, ROW, 720), 0);
});

test("scrollTopFor：-1 返回 0", () => {
  assert.equal(scrollTopFor(-1, ROW, 720), 0);
});
