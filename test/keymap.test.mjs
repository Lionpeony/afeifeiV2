import { test } from "node:test";
import assert from "node:assert/strict";
import { SEEK_STEP_MS, VOLUME_STEP, resolveKey } from "../dist-test/keymap.mjs";

/**
 * P0-22 判据：**键位表一条键一条用例**（表在 `docs/22` §三末，一次定死）。
 * 这里只断"这个键是什么意思"；"焦点在输入框/滑杆时不抢键"是 `keyboard.ts` 的前置闸门，
 * 由 `resolve-esc` 的 isTextTarget 系列保证（见 `test/input.test.mjs`）。
 */

const key = (k, extra = {}) => ({ key: k, ...extra });

test("Space = 播放 / 暂停", () => {
  assert.deepEqual(resolveKey(key(" "), "local"), { type: "togglePlay" });
});

test("← / → = ∓5 秒", () => {
  assert.deepEqual(resolveKey(key("ArrowLeft"), "local"), { type: "seekBy", deltaMs: -SEEK_STEP_MS });
  assert.deepEqual(resolveKey(key("ArrowRight"), "local"), { type: "seekBy", deltaMs: SEEK_STEP_MS });
  assert.equal(SEEK_STEP_MS, 5000);
});

test("Shift+← / Shift+→ = 上一首 / 下一首", () => {
  assert.deepEqual(resolveKey(key("ArrowLeft", { shiftKey: true }), "local"), { type: "prev" });
  assert.deepEqual(resolveKey(key("ArrowRight", { shiftKey: true }), "local"), { type: "next" });
});

test("↑ / ↓ = 音量 ±5%", () => {
  assert.deepEqual(resolveKey(key("ArrowUp"), "local"), { type: "volumeBy", delta: VOLUME_STEP });
  assert.deepEqual(resolveKey(key("ArrowDown"), "local"), { type: "volumeBy", delta: -VOLUME_STEP });
  assert.equal(VOLUME_STEP, 0.05);
});

test("M = 静音，L = 红心（大小写都认）", () => {
  assert.deepEqual(resolveKey(key("m"), "local"), { type: "mute" });
  assert.deepEqual(resolveKey(key("M"), "local"), { type: "mute" });
  assert.deepEqual(resolveKey(key("l"), "local"), { type: "like" });
  assert.deepEqual(resolveKey(key("L"), "local"), { type: "like" });
});

test("0–9 只在播放页 = 跳到 0%–90%", () => {
  for (const n of ["0", "3", "9"]) {
    assert.deepEqual(resolveKey(key(n), "stage"), { type: "seekPercent", percent: Number(n) * 10 });
  }
  assert.deepEqual(resolveKey(key("5"), "stage"), { type: "seekPercent", percent: 50 });
});

test("0–9 在别的页面不接（数字要留给搜索框和列表）", () => {
  for (const page of ["local", "online", "mine", "settings"]) {
    assert.equal(resolveKey(key("5"), page), null);
  }
});

test("Ctrl+K / Ctrl+F = 命令面板 / 聚焦搜索（Cmd 同义）", () => {
  assert.deepEqual(resolveKey(key("k", { ctrlKey: true }), "local"), { type: "palette" });
  assert.deepEqual(resolveKey(key("K", { metaKey: true }), "stage"), { type: "palette" });
  assert.deepEqual(resolveKey(key("f", { ctrlKey: true }), "local"), { type: "focusSearch" });
  assert.equal(resolveKey(key("s", { ctrlKey: true }), "local"), null, "没定义的 Ctrl 组合不接");
});

test("Alt 组合整体让位给系统；未定义的键返回 null", () => {
  assert.equal(resolveKey(key("ArrowRight", { altKey: true }), "stage"), null);
  assert.equal(resolveKey(key("m", { altKey: true }), "stage"), null);
  assert.equal(resolveKey(key("F5"), "stage"), null);
  assert.equal(resolveKey(key("Enter"), "stage"), null);
});
