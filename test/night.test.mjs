import { test } from "node:test";
import assert from "node:assert/strict";
import { issueOf, nightOfYear } from "../dist-test/night-issue.mjs";

/** 首页的「第 N 夜 / 刊号」必须由日期派生，不能让时区或时分秒改变结果。 */

test("年内第几天：元旦是第 1 夜，11-06 是第 310 夜", () => {
  assert.equal(nightOfYear(new Date(2026, 0, 1)), 1);
  assert.equal(nightOfYear(new Date(2026, 10, 6)), 310);
});

test("闰年 2 月 29 日算第 60 夜", () => {
  assert.equal(nightOfYear(new Date(2028, 1, 29)), 60);
});

test("时分秒不影响第几夜", () => {
  const early = nightOfYear(new Date(2026, 10, 6, 0, 0, 0));
  const late = nightOfYear(new Date(2026, 10, 6, 23, 59, 59));
  assert.equal(early, late);
});

test("刊号按 MMDD 编码，不补错位", () => {
  assert.equal(issueOf(new Date(2026, 0, 1)), "NO.0101");
  assert.equal(issueOf(new Date(2026, 10, 6)), "NO.1106");
});
