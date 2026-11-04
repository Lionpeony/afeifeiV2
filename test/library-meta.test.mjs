import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMeta,
  parseMetaOverrides,
  patchMeta,
  serializeMetaOverrides,
} from "../dist-test/library-meta.mjs";

/* ---- 元数据覆盖（M11）：只盖在索引之上，音频文件不动 ---- */

const track = {
  id: "X:\\1.mp3",
  path: "X:\\1.mp3",
  title: "未命名",
  artist: "未知歌手",
  album: "未知专辑",
  durationMs: 1000,
  size: 1,
  mtimeMs: 1,
  hasCover: false,
};

test("applyMeta：没覆盖就原样返回同一个对象（不做无谓拷贝）", () => {
  assert.equal(applyMeta(track, undefined), track);
});

test("applyMeta：只覆盖给出的字段，其余保持文件值", () => {
  const got = applyMeta(track, { title: "晴天" });
  assert.equal(got.title, "晴天");
  assert.equal(got.artist, "未知歌手");
  assert.equal(got.album, "未知专辑");
  assert.notEqual(got, track);
});

test("patchMeta：整条替换，清空的字段回落到文件值", () => {
  let overrides = patchMeta({}, track.id, { title: "晴天", artist: "周杰伦", album: "叶惠美" });
  assert.deepEqual(overrides[track.id], { title: "晴天", artist: "周杰伦", album: "叶惠美" });

  // 只把歌手改回空 → 覆盖里没有 artist，显示回落到文件值
  overrides = patchMeta(overrides, track.id, { title: "晴天", artist: "  ", album: "叶惠美" });
  assert.equal(overrides[track.id].artist, undefined);
  assert.equal(applyMeta(track, overrides[track.id]).artist, "未知歌手");
});

test("patchMeta：三项全空 = 整条摘掉（恢复原值）", () => {
  const overrides = patchMeta({ [track.id]: { title: "晴天" } }, track.id, { title: "", artist: "", album: "" });
  assert.deepEqual(overrides, {});
});

test("patchMeta：超长字段截断到 200，不接受的类型直接忽略", () => {
  const long = "x".repeat(300);
  const overrides = patchMeta({}, track.id, { title: long, artist: 42 });
  assert.equal(overrides[track.id].title.length, 200);
  assert.equal(overrides[track.id].artist, undefined);
});

test("parseMetaOverrides：坏 JSON / 数组 / 坏条目一律当没有", () => {
  assert.deepEqual(parseMetaOverrides(null), {});
  assert.deepEqual(parseMetaOverrides("{ 坏"), {});
  assert.deepEqual(parseMetaOverrides("[1,2]"), {});
  assert.deepEqual(parseMetaOverrides(JSON.stringify({ a: { title: "  " } })), {});
  assert.deepEqual(parseMetaOverrides(JSON.stringify({ a: { title: "晴天" } })), { a: { title: "晴天" } });
});

test("序列化 → 解析 往返不丢字段", () => {
  const overrides = { [track.id]: { title: "晴天", artist: "周杰伦" } };
  assert.deepEqual(parseMetaOverrides(serializeMetaOverrides(overrides)), overrides);
});
