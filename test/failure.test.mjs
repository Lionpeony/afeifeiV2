import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RETRY,
  MAX_SKIP_STREAK,
  SKIP_DELAY_MS,
  classifyFailure,
  decideFailure,
} from "../dist-test/failure.mjs";

/** P0-14 的四条判据（docs/22 §三 R0.1）：分类 → 重试 → 跳 → 熔断。 */

test("分类：aborted 什么都不做（用户自己切歌，不是失败）", () => {
  assert.equal(classifyFailure("aborted"), "ignore");
  assert.deepEqual(
    decideFailure({ code: "aborted", retryCount: 0, skipStreak: 0, hasNext: true, autoSkip: true }),
    { action: "ignore" },
  );
});

test("分类：坏文件/格式不支持不重试，直接跳", () => {
  for (const code of ["track-missing", "decode-failed", "disk-full", "source-mismatch", "capability-missing", "contract-version"]) {
    assert.equal(classifyFailure(code), "skip", code);
  }
});

test("分类：网络类可重试（URL 可能只是过期）", () => {
  for (const code of ["network", "auth-expired", "auth-required", "quality-unavailable", "unknown"]) {
    assert.equal(classifyFailure(code), "retry", code);
  }
});

test("重试：同一首最多 2 次，第 3 次不再重试", () => {
  const base = { code: "network", skipStreak: 0, hasNext: true, autoSkip: true };
  assert.deepEqual(decideFailure({ ...base, retryCount: 0 }), { action: "retry", retryCount: 1 });
  assert.deepEqual(decideFailure({ ...base, retryCount: 1 }), { action: "retry", retryCount: 2 });
  // 用完 2 次后落到跳过
  assert.equal(decideFailure({ ...base, retryCount: MAX_RETRY }).action, "skip");
});

test("跳过：带 500ms 延迟，且连跳计数 +1", () => {
  assert.deepEqual(
    decideFailure({ code: "track-missing", retryCount: 0, skipStreak: 0, hasNext: true, autoSkip: true }),
    { action: "skip", skipStreak: 1, delayMs: SKIP_DELAY_MS },
  );
});

test("熔断：连跳 3 首仍失败就停机，不无限跳", () => {
  const d = decideFailure({ code: "track-missing", retryCount: 0, skipStreak: 2, hasNext: true, autoSkip: true });
  assert.deepEqual(d, { action: "stop", reason: "exhausted" });
  assert.equal(MAX_SKIP_STREAK, 3);
  // 第 1、2 次仍然跳
  assert.equal(decideFailure({ code: "track-missing", retryCount: 0, skipStreak: 0, hasNext: true, autoSkip: true }).action, "skip");
  assert.equal(decideFailure({ code: "track-missing", retryCount: 0, skipStreak: 1, hasNext: true, autoSkip: true }).action, "skip");
});

test("无下一首：报到 no-next，而不是 exhausted（提示要说真话）", () => {
  assert.deepEqual(
    decideFailure({ code: "track-missing", retryCount: 0, skipStreak: 1, hasNext: false, autoSkip: true }),
    { action: "stop", reason: "no-next" },
  );
});

test("开关关了（pause）：可重试的仍重试，该跳的停下等用户", () => {
  const base = { retryCount: 0, skipStreak: 0, hasNext: true, autoSkip: false };
  assert.equal(decideFailure({ ...base, code: "network" }).action, "retry");
  assert.deepEqual(decideFailure({ ...base, code: "track-missing" }), { action: "stop", reason: "manual" });
});
