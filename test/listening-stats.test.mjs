import { test } from "node:test";
import assert from "node:assert/strict";
import { begin, end, getSessions, parseLog } from "../dist-test/listening-log.mjs";
import { fmtListening, summarize } from "../dist-test/listening-stats.mjs";

/* ---- 听歌账本 + 统计（B-12） ---- */

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test("账本：一段播放算出 playedMs，暂停后不重复结算", () => {
  begin("a", { title: "晴天", artist: "周杰伦" }, 1000);
  const first = end(61_000);
  assert.deepEqual(first, { trackId: "a", title: "晴天", artist: "周杰伦", at: 1000, playedMs: 60_000 });
  assert.equal(end(120_000), null);
  assert.equal(getSessions().length, 1);
});

test("账本：不到 1 秒的误触不记，超长（睡着循环）截到 6 小时", () => {
  const before = getSessions().length;
  begin("b", {}, 1000);
  assert.equal(end(1500), null);
  begin("c", {}, 1000);
  assert.equal(end(1000 + 30 * 3600_000).playedMs, 6 * 3600_000);
  assert.equal(getSessions().length, before + 1);
});

test("账本：连切自动结算上一首；同一首重复 begin 不重开", () => {
  const before = getSessions().length;
  begin("d", { title: "A" }, 1000);
  begin("d", { title: "A" }, 2000); // 同曲忽略
  begin("e", { title: "B" }, 3000); // 连切：d 结算 2s
  assert.equal(getSessions().at(-1).trackId, "d");
  assert.equal(getSessions().at(-1).playedMs, 2000);
  end(63_000); // e 结算 60s
  assert.equal(getSessions().length, before + 2);
});

test("账本：缺 artist 兜底「未知歌手」，坏 JSON/坏条目逐条丢", () => {
  begin("f", { title: "" }, 1000);
  const s = end(11_000);
  assert.equal(s.artist, "未知歌手");
  assert.equal(s.title, "f");
  assert.deepEqual(parseLog(null), []);
  assert.deepEqual(parseLog("{坏"), []);
  assert.deepEqual(parseLog("{}"), []);
  assert.deepEqual(parseLog('[{"trackId":"x","at":1,"playedMs":5}, 1, {}]'), [
    { trackId: "x", title: "x", artist: "未知歌手", at: 1, playedMs: 5 },
  ]);
});

test("fmtListening：0 / 不足 1 分钟 / 分钟 / 小时", () => {
  assert.equal(fmtListening(0), "0 分钟");
  assert.equal(fmtListening(30_000), "不到 1 分钟");
  assert.equal(fmtListening(5 * 60_000), "5 分钟");
  assert.equal(fmtListening(2 * 3600_000 + 3 * 60_000), "2 小时 3 分");
});

const NOW = at(2026, 11, 4, 12);
const session = (trackId, title, artist, time, ms) => ({ trackId, title, artist, at: time, playedMs: ms });

test("统计：空账本给全 0 与 7 根空柱（页面空态有用）", () => {
  const s = summarize([], NOW);
  assert.equal(s.plays, 0);
  assert.equal(s.totalMs, 0);
  assert.equal(s.byDay.length, 7);
  assert.equal(s.byDay[6].label, "今天");
  assert.equal(s.byHour.length, 24);
  assert.deepEqual(s.topTracks, []);
});

test("统计：今天/近7天/本月/累计分桶，跨月与去年不算进本月", () => {
  const rows = [
    session("a", "晴天", "周杰伦", at(2026, 11, 4, 9), 10 * 60_000),
    session("b", "富士山下", "陈奕迅", at(2026, 11, 2, 20), 20 * 60_000),
    session("c", "江南", "林俊杰", at(2026, 10, 20, 8), 30 * 60_000),
    session("d", "老歌", "老歌手", at(2025, 1, 1, 8), 40 * 60_000),
  ];
  const s = summarize(rows, NOW);
  assert.equal(s.todayMs, 10 * 60_000);
  assert.equal(s.weekMs, 30 * 60_000);
  // 本月含 11/2 + 11/4，但不含 10/20 那 30 分钟（否则会是 60 分钟）
  assert.equal(s.monthMs, 30 * 60_000);
  assert.equal(s.totalMs, 100 * 60_000);
  assert.equal(s.byHour[9], 10 * 60_000);
  assert.equal(s.byDay[6].ms, 10 * 60_000);
  assert.equal(s.byDay[4].ms, 20 * 60_000);
});

test("统计：Top 按累计时长降序，同名曲目合并，坏时间戳跳过", () => {
  const rows = [
    session("a", "晴天", "周杰伦", at(2026, 11, 4, 9), 10 * 60_000),
    session("a", "晴天", "周杰伦", at(2026, 11, 3, 9), 15 * 60_000),
    session("b", "江南", "林俊杰", at(2026, 11, 4, 10), 5 * 60_000),
    session("x", "坏", "坏", Number.NaN, 999_000),
  ];
  const s = summarize(rows, NOW);
  assert.equal(s.plays, 3);
  assert.equal(s.topTracks[0].name, "晴天");
  assert.equal(s.topTracks[0].ms, 25 * 60_000);
  assert.equal(s.topTracks[0].plays, 2);
  assert.equal(s.topArtists[0].name, "周杰伦");
  assert.equal(s.topTracks.length, 2);
});
