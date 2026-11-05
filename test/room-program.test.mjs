import test from "node:test";
import assert from "node:assert/strict";
import { boardProgram, shelfProgram, startOfDay, tapeProgram } from "../dist-test/room-program.mjs";

const track = (id, album, artist, title, mtimeMs) => ({
  id, path: `C:/m/${id}.mp3`, title, artist, album,
  durationMs: 200000, size: 1000, mtimeMs, hasCover: true,
});

test("startOfDay：按给定时刻取本地零点，不读系统时钟", () => {
  const now = new Date(2026, 10, 5, 14, 30, 0).getTime();
  const day = startOfDay(now);
  assert.equal(new Date(day).getHours(), 0);
  assert.equal(day, new Date(2026, 10, 5, 0, 0, 0, 0).getTime());
});

test("shelfProgram：按专辑分组、专辑升序、空专辑归未分类", () => {
  const program = shelfProgram([
    track("1", "叶惠美", "周杰伦", "晴天", 1),
    track("2", "U87", "陈奕迅", "浮夸", 2),
    track("3", "", "佚名", "无题", 3),
  ]);
  assert.equal(program.kind, "shelf");
  assert.equal(program.meta.count, 3);
  assert.deepEqual(program.segments.map((s) => s.label), ["未分类", "叶惠美", "U87"], "按中文拼音排序，拉丁字母在后");
  assert.equal(program.meta.note, "3 张专辑 · 3 位艺人");
});

test("shelfProgram：空曲库没有分段，也不编 note", () => {
  const program = shelfProgram([]);
  assert.deepEqual(program.segments, []);
  assert.equal(program.meta.note, undefined);
});

test("tapeProgram：今天 / 这周 / 更早分桶，段内从新到旧", () => {
  const now = new Date(2026, 10, 5, 12, 0, 0).getTime();
  const day = startOfDay(now);
  const program = tapeProgram([
    track("old", "A", "a", "更早的歌", day - 30 * 86400000),
    track("week", "A", "a", "这周的歌", day - 2 * 86400000),
    track("today1", "A", "a", "今天的歌 1", day + 1000),
    track("today2", "A", "a", "今天的歌 2", day + 5000),
  ], now);
  assert.equal(program.kind, "tape");
  assert.deepEqual(program.segments.map((s) => s.key), ["today", "week", "older"]);
  assert.deepEqual(program.segments[0].items.map((i) => i.id), ["today2", "today1"], "段内新→旧");
  assert.equal(program.segments[1].items[0].id, "week");
  assert.equal(program.segments[2].items[0].id, "old");
});

test("tapeProgram：空段不输出，边界时间落在正确桶里", () => {
  const now = new Date(2026, 10, 5, 12, 0, 0).getTime();
  const day = startOfDay(now);
  const program = tapeProgram([track("edge", "A", "a", "零点", day)], now);
  assert.deepEqual(program.segments.map((s) => s.key), ["today"]);
});

test("boardProgram：固定四列，列内保持原顺序，空列也保留", () => {
  const program = boardProgram([
    { id: "a", title: "已下完", state: "done" },
    { id: "b", title: "正在下", state: "active" },
    { id: "c", title: "排队一", state: "queued" },
    { id: "d", title: "排队二", state: "queued" },
    { id: "e", title: "失败", state: "error" },
  ]);
  assert.equal(program.kind, "board");
  assert.deepEqual(program.segments.map((s) => s.key), ["active", "queued", "paused", "done", "error"]);
  assert.deepEqual(program.segments[1].items.map((i) => i.id), ["c", "d"]);
  assert.equal(program.segments[3].items[0].state, "done");
  assert.equal(program.meta.count, 5);
});

test("boardProgram：没有任务时四列仍在（空态由视图决定）", () => {
  const program = boardProgram([]);
  assert.equal(program.segments.length, 5);
  assert.ok(program.segments.every((s) => s.items.length === 0));
});
