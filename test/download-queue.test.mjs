import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ACTIVE,
  MAX_TRIES,
  QUOTA_BYTES,
  activeCount,
  backoffMs,
  clampProgress,
  nextQueued,
  oldestDone,
  overQuota,
  restoreItems,
  retryDecision,
  sanitizeForRestore,
} from "../dist-test/download-queue.mjs";

/** 造一个任务（只填测试关心的字段）。 */
function item(overrides = {}) {
  return {
    id: "qq:001",
    sourceId: "qq",
    songId: "001",
    title: "晴天",
    destPath: "d:/downloads/晴天.mp3",
    state: "queued",
    received: 0,
    total: 0,
    tries: 0,
    speed: 0,
    error: null,
    ...overrides,
  };
}

/* ---- 并发（判据：并发 2 队列，第三个排队） ---- */

test("activeCount：只数 active", () => {
  const items = [
    item({ id: "1", state: "active" }),
    item({ id: "2", state: "active" }),
    item({ id: "3", state: "queued" }),
    item({ id: "4", state: "done" }),
  ];
  assert.equal(activeCount(items), 2);
  assert.equal(activeCount([]), 0);
});

test("nextQueued：并发未满给最早的 queued", () => {
  const items = [item({ id: "1", state: "active" }), item({ id: "2" }), item({ id: "3" })];
  assert.equal(nextQueued(items).id, "2");
});

test("nextQueued：并发占满（MAX_ACTIVE=2）给 null", () => {
  const items = [item({ id: "1", state: "active" }), item({ id: "2", state: "active" }), item({ id: "3" })];
  assert.equal(nextQueued(items), null);
  assert.equal(MAX_ACTIVE, 2);
});

test("nextQueued：空队列给 null", () => {
  assert.equal(nextQueued([]), null);
});

/* ---- 重试（判据：重试 3 次退避） ---- */

test("retryDecision：前两次失败重排", () => {
  assert.equal(retryDecision(item({ tries: 0 })), "requeue");
  assert.equal(retryDecision(item({ tries: 1 })), "requeue");
});

test("retryDecision：第三次失败落 error（MAX_TRIES=3）", () => {
  assert.equal(retryDecision(item({ tries: 2 })), "error");
  assert.equal(MAX_TRIES, 3);
});

test("backoffMs：2^n 秒退避，封顶 30s", () => {
  assert.equal(backoffMs(0), 1000);
  assert.equal(backoffMs(1), 2000);
  assert.equal(backoffMs(2), 4000);
  assert.equal(backoffMs(20), 30000);
});

/* ---- 配额（判据：超配额被拒且文案人话——这里测判定，文案在 runner） ---- */

test("overQuota：未超给 false，超给 true", () => {
  assert.equal(overQuota(0, 100), false);
  assert.equal(overQuota(QUOTA_BYTES - 100, 100), false);
  assert.equal(overQuota(QUOTA_BYTES - 50, 100), true);
});

test("overQuota：恰好等于预算不算超（边界属于可用）", () => {
  assert.equal(overQuota(QUOTA_BYTES - 100, 100), false);
  assert.equal(overQuota(QUOTA_BYTES, 0), false);
});

/* ---- 淘汰（判据：最旧先删，正在下载的除外） ---- */

test("oldestDone：只挑 done，数组序即新旧序", () => {
  const items = [
    item({ id: "1", state: "active" }),
    item({ id: "2" }),
    item({ id: "3", state: "done" }),
    item({ id: "4", state: "done" }),
  ];
  assert.equal(oldestDone(items).id, "3");
});

test("oldestDone：没有 done 给 null（无处可淘汰 → 报空间不足）", () => {
  assert.equal(oldestDone([item({ id: "1", state: "active" })]), null);
  assert.equal(oldestDone([]), null);
});

/* ---- 恢复（判据：杀进程重启后任务还在、可续传） ---- */

test("sanitizeForRestore：active/queued 落回 queued，paused/done/error 保留", () => {
  const out = sanitizeForRestore([
    item({ id: "1", state: "active", received: 500 }),
    item({ id: "2", state: "queued" }),
    item({ id: "3", state: "paused", received: 300 }),
    item({ id: "4", state: "done" }),
    item({ id: "5", state: "error", error: "网络" }),
  ]);
  assert.deepEqual(
    out.map((i) => [i.id, i.state]),
    [
      ["1", "queued"],
      ["2", "queued"],
      ["3", "paused"],
      ["4", "done"],
      ["5", "error"],
    ],
  );
  assert.equal(out[0].speed, 0, "速度是瞬态，恢复后归零");
});

test("sanitizeForRestore：error 不带原因的坏数据直接丢", () => {
  const out = sanitizeForRestore([item({ id: "1", state: "error", error: null })]);
  assert.equal(out.length, 0);
});

test("restoreItems：外来数据逐字段校验，坏条目丢弃不抛", () => {
  assert.equal(restoreItems(null).length, 0);
  assert.equal(restoreItems("garbage").length, 0);
  assert.equal(restoreItems([{ id: "x" }]).length, 0, "缺字段的丢");
  const ok = restoreItems([
    { id: "a", sourceId: "qq", songId: "1", title: "t", destPath: "d:/a.mp3", received: 1, total: 2, tries: 0 },
  ]);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].state, "queued");
});

/* ---- 进度收敛 ---- */

test("clampProgress：received 不越过 total，负数归零，total 未知时放行", () => {
  assert.deepEqual(clampProgress(150, 100), { received: 100, total: 100 });
  assert.deepEqual(clampProgress(-5, 100), { received: 0, total: 100 });
  assert.deepEqual(clampProgress(150, 0), { received: 150, total: 0 });
  assert.deepEqual(clampProgress(Number.NaN, 0), { received: 0, total: 0 });
});
