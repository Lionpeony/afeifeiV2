import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FILTER_PRESETS,
  filterLyricDoc,
  invalidPatterns,
  parseFilters,
  rulesFromText,
  rulesToText,
  serializeFilters,
} from "../dist-test/lyric-filter.mjs";

/* ---- 歌词正则过滤（B-2）：解析后、显示前 ---- */

const line = (i, text) => ({ index: i, startMs: i * 1000, endMs: i * 1000 + 900, text, words: [] });
const segment = (i, indexes) => ({
  index: i,
  name: `段${i}`,
  startMs: 0,
  endMs: 9000,
  lineIndexes: indexes,
  confidence: 1,
  boundary: "exact",
});
const doc = (lines, segments = []) => ({
  trackId: "t1",
  source: "manual",
  hasWordTiming: false,
  lines,
  segments,
  offsetMs: 500,
  quality: "estimated",
  fetchedAt: 0,
});

test("rulesFromText / rulesToText：一行一条，空行丢掉，上限 20 条", () => {
  const rules = rulesFromText("版权\n\n  作词  \n");
  assert.deepEqual(rules, [
    { pattern: "版权", enabled: true },
    { pattern: "作词", enabled: true },
  ]);
  assert.equal(rulesToText(rules), "版权\n作词");
  assert.equal(rulesFromText(Array.from({ length: 30 }, (_, i) => `r${i}`).join("\n")).length, 20);
});

test("parseFilters：兼容纯字符串数组与新形态；坏数据当空", () => {
  assert.deepEqual(parseFilters(null), []);
  assert.deepEqual(parseFilters("{坏"), []);
  assert.deepEqual(parseFilters("{}"), []);
  assert.deepEqual(parseFilters('["版权", {"pattern":"作词","enabled":false}]'), [
    { pattern: "版权", enabled: true },
    { pattern: "作词", enabled: false },
  ]);
});

test("序列化 → 解析 往返", () => {
  const rules = rulesFromText("版权|未经许可\n作词");
  assert.deepEqual(parseFilters(serializeFilters(rules)), rules);
});

test("invalidPatterns：写错的正则单独报出来，不吞掉", () => {
  assert.deepEqual(invalidPatterns(rulesFromText("版权\n[\n作词")), ["["]);
});

test("filterLyricDoc：没有规则时原样返回同一个对象", () => {
  const d = doc([line(0, "晴天")]);
  assert.equal(filterLyricDoc(d, []), d);
});

test("filterLyricDoc：忽略大小写，命中整行去掉；时间轴与偏移不动", () => {
  const d = doc([line(0, "作词: 某某"), line(1, "晴天"), line(2, "版权所有")]);
  const got = filterLyricDoc(d, rulesFromText("作词|版权"));
  assert.deepEqual(got.lines.map((l) => l.text), ["晴天"]);
  assert.equal(got.offsetMs, 500);
  assert.equal(got.lines[0].startMs, 1000); // 原第 2 行的时间戳
});

test("filterLyricDoc：重排行号并重映射段落，空段落丢掉", () => {
  const d = doc(
    [line(0, "作词: 某某"), line(1, "晴天"), line(2, "富士山下")],
    [segment(0, [0, 1]), segment(1, [0]), segment(2, [2])],
  );
  const got = filterLyricDoc(d, rulesFromText("作词"));
  assert.deepEqual(got.lines.map((l) => l.index), [0, 1]);
  assert.deepEqual(got.segments.map((s) => s.lineIndexes), [[0], [1]]);
  assert.deepEqual(got.segments.map((s) => s.index), [0, 1]);
});

test("filterLyricDoc：非法正则跳过，不能把整页歌词清空", () => {
  const d = doc([line(0, "晴天"), line(1, "富士山下")]);
  const got = filterLyricDoc(d, rulesFromText("[\n不存在的词"));
  assert.equal(got.lines.length, 2);
});

test("预设是能编译的正则", () => {
  assert.deepEqual(invalidPatterns(FILTER_PRESETS.map((p) => ({ pattern: p.pattern, enabled: true }))), []);
});
