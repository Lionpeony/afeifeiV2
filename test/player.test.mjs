import { test } from "node:test";
import assert from "node:assert/strict";
import { isTerminal, nextStatus, normalizeError, shouldPlay } from "../dist-test/player.mjs";

test("idle + load → loading", () => {
  assert.equal(nextStatus("idle", { type: "load" }), "loading");
});

test("loading + ready → paused（准备好不等于自动播）", () => {
  assert.equal(nextStatus("loading", { type: "ready" }), "paused");
});

test("loading + error → error", () => {
  assert.equal(nextStatus("loading", { type: "error", code: "track-missing" }), "error");
});

test("paused + play → playing", () => {
  assert.equal(nextStatus("paused", { type: "play" }), "playing");
});

test("playing + pause → paused", () => {
  assert.equal(nextStatus("playing", { type: "pause" }), "paused");
});

test("playing + ended → ended", () => {
  assert.equal(nextStatus("playing", { type: "ended" }), "ended");
});

test("ended + play → playing（重播）", () => {
  assert.equal(nextStatus("ended", { type: "play" }), "playing");
});

test("error + load → loading（换一首能救回来）", () => {
  assert.equal(nextStatus("error", { type: "load" }), "loading");
});

test("任何状态 + stop → idle", () => {
  for (const s of ["idle", "loading", "paused", "playing", "ended", "error"]) {
    assert.equal(nextStatus(s, { type: "stop" }), "idle", s);
  }
});

test("未定义的转移保持原状态，不抛错", () => {
  assert.equal(nextStatus("idle", { type: "pause" }), "idle");
  assert.equal(nextStatus("idle", { type: "ended" }), "idle");
  assert.equal(nextStatus("ended", { type: "pause" }), "ended");
});

test("isTerminal 只认 ended / error", () => {
  assert.equal(isTerminal("ended"), true);
  assert.equal(isTerminal("error"), true);
  assert.equal(isTerminal("playing"), false);
});

test("shouldPlay 只认 playing", () => {
  assert.equal(shouldPlay("playing"), true);
  for (const s of ["idle", "loading", "paused", "ended", "error"]) {
    assert.equal(shouldPlay(s), false, s);
  }
});

test("normalizeError：空值一律 unknown", () => {
  assert.equal(normalizeError(undefined), "unknown");
  assert.equal(normalizeError(""), "unknown");
  assert.equal(normalizeError("network"), "network");
});
