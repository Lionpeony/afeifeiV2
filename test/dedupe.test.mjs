import { test } from "node:test";
import assert from "node:assert/strict";
import { findDuplicates, suggestKeep } from "../dist-test/dedupe.mjs";

const T = (id, extra = {}) => ({
  id,
  path: `C:/m/${id}.mp3`,
  title: id,
  artist: "a",
  album: "b",
  durationMs: 180000,
  size: 5000,
  mtimeMs: 1,
  hasCover: false,
  ...extra,
});

test("同 size + 同时长 → 一组", () => {
  const groups = findDuplicates([T("a"), T("b")], "same-size-duration");
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].trackIds.sort(), ["a", "b"]);
});

test("size 不同 → 不重复", () => {
  const groups = findDuplicates([T("a"), T("b", { size: 6000 })], "same-size-duration");
  assert.equal(groups.length, 0);
});

test("时长差 1 秒内算同一首（整数秒取整，容忍编码差异）", () => {
  const groups = findDuplicates(
    [T("a", { durationMs: 180000 }), T("b", { durationMs: 180400 })],
    "same-size-duration",
  );
  assert.equal(groups.length, 1);
});

test("0 字节文件不参与判重（那是读取失败的占位）", () => {
  const groups = findDuplicates(
    [T("a", { size: 0 }), T("b", { size: 0 })],
    "same-size-duration",
  );
  assert.equal(groups.length, 0);
});

test("同名 + 同时长 → 一组（不同目录下的同一首歌）", () => {
  const groups = findDuplicates(
    [T("a", { path: "C:/x/song.mp3" }), T("b", { path: "D:/y/song.mp3" })],
    "same-name-duration",
  );
  assert.equal(groups.length, 1);
});

test("同名但时长差很多 → 不是重复（同名不同歌）", () => {
  const groups = findDuplicates(
    [T("a", { path: "C:/x/intro.mp3" }), T("b", { path: "D:/y/intro.mp3", durationMs: 30000 })],
    "same-name-duration",
  );
  assert.equal(groups.length, 0);
});

test("组按份数从多到少排序", () => {
  const groups = findDuplicates(
    [T("a"), T("b"), T("c", { size: 7000 }), T("d", { size: 7000 })],
    "same-size-duration",
  );
  assert.equal(groups[0].trackIds.length, 2);
  assert.equal(groups.length, 2);
});

test("单条不重复（1 份不算一组）", () => {
  assert.equal(findDuplicates([T("a")], "same-size-duration").length, 0);
});

test("suggestKeep 建议保留路径最短的那个（通常是原件）", () => {
  const tracks = [T("a", { path: "C:/very/deep/folder/song.mp3" }), T("b", { path: "C:/s/song.mp3" })];
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const group = { key: "k", trackIds: ["a", "b"] };
  assert.equal(suggestKeep(group, byId), "b");
});

test("suggestKeep：组里没有对应记录时返回 null，不抛错", () => {
  assert.equal(suggestKeep({ key: "k", trackIds: ["ghost"] }, new Map()), null);
});
