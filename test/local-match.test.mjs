import { test } from "node:test";
import assert from "node:assert/strict";
import { findLocalMatch, normalizeText } from "../dist-test/library-match.mjs";

const track = (title, artist, durationMs, id = title) => ({
  id,
  path: `C:/music/${id}.mp3`,
  title,
  artist,
  album: "专辑",
  durationMs,
  size: 1,
  mtimeMs: 1,
  hasCover: false,
});

const tracks = [
  track("夜曲", "周杰伦", 226_000, "yequ"),
  track("夜曲", "周杰伦", 240_000, "yequ-long"),
  track("Hello", "Adele", 295_000),
  track("稻香", "周杰伦 / 费玉清", 223_000),
];

test("标题标点与空格归一化", () => {
  assert.equal(normalizeText(" 夜 曲！ "), "夜曲");
});

test("标题 + 歌手 + 时长都对上", () => {
  const hit = findLocalMatch(tracks, { title: "夜曲", artist: "周杰伦", durationMs: 227_000 });
  assert.equal(hit?.title, "夜曲");
});

test("歌手名有分隔符差异也能匹配", () => {
  const hit = findLocalMatch(tracks, { title: "稻香", artist: "周杰伦&费玉清" });
  assert.equal(hit?.title, "稻香");
});

test("时长差超过容差直接拒绝", () => {
  const hit = findLocalMatch(tracks, { title: "夜曲", artist: "周杰伦", durationMs: 260_000 });
  assert.equal(hit, null);
});

test("歌手不同则拒绝（同标题不误配）", () => {
  const hit = findLocalMatch(tracks, { title: "Hello", artist: "Someone Else" });
  assert.equal(hit, null);
});

test("缺时长仍按标题歌手匹配，多个候选取时长最近", () => {
  const near = findLocalMatch(tracks, { title: "夜曲", artist: "周杰伦", durationMs: 241_000 });
  assert.equal(near?.durationMs, 240_000);
});

test("空标题不匹配", () => {
  assert.equal(findLocalMatch(tracks, { title: "  ", artist: "周杰伦" }), null);
});
