import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyPicks, dailySeed, nextRefreshMs, radioOf, recentAdds, recentPlayed } from "../dist-test/recommend.mjs";

const t = (id, artist, album, mtimeMs = 1) => ({
  id,
  path: `X:\\${id}.mp3`,
  title: id,
  artist,
  album,
  durationMs: 180000,
  size: 1,
  mtimeMs,
  hasCover: false,
  missing: false,
});

const lib = [
  t("a1", "甲", "X1", 10),
  t("a2", "甲", "X1", 20),
  t("a3", "甲", "X2", 30),
  t("a4", "甲", "X2", 40),
  t("b1", "乙", "Y1", 50),
  t("b2", "乙", "Y1", 60),
  t("c1", "丙", "Z1", 70),
  t("c2", "丙", "Z2", 80),
];

test("每日推荐：同一天同种子稳定，换种子换顺序", () => {
  const seed = dailySeed(new Date(2026, 10, 3));
  const a = dailyPicks({ tracks: lib, liked: new Set(), recent: [], seed }).map((x) => x.id);
  const b = dailyPicks({ tracks: lib, liked: new Set(), recent: [], seed }).map((x) => x.id);
  assert.deepEqual(a, b);
  const c = dailyPicks({ tracks: lib, liked: new Set(), recent: [], seed: seed + 1 }).map((x) => x.id);
  assert.notDeepEqual(a, c);
});

test("每日推荐：红心排在前面，且不重复取同一首", () => {
  const picks = dailyPicks({
    tracks: lib,
    liked: new Set(["c2"]),
    recent: ["b1"],
    seed: 7,
    count: 8,
  });
  assert.equal(picks[0].id, "c2");
  assert.equal(picks.filter((x) => x.id === "c2").length, 1);
  assert.equal(new Set(picks.map((x) => x.id)).size, picks.length);
});

test("每日推荐：配额内同艺人最多 3 首，曲库不够就全给（不给半份）", () => {
  // count 6 < 各艺人配额之和（3+2+2），此时不该触发回填，配额必须守得住
  const pics = dailyPicks({ tracks: lib, liked: new Set(), recent: [], seed: 3, count: 6 });
  assert.equal(Math.max(...["甲", "乙", "丙"].map((a) => pics.filter((x) => x.artist === a).length)) <= 3, true);

  const small = lib.slice(0, 2);
  assert.equal(dailyPicks({ tracks: small, liked: new Set(), recent: [], seed: 3, count: 30 }).length, 2);
  assert.equal(dailyPicks({ tracks: [], liked: new Set(), recent: [], seed: 3 }).length, 0);
});

test("每日推荐：不喜欢名单在取牌之前摘掉（B-11，公共函数新增入参）", () => {
  const picks = dailyPicks({
    tracks: lib,
    liked: new Set(["c2"]),
    recent: ["b1"],
    seed: 7,
    count: 8,
    disliked: new Set(["c2", "b1", "a1"]),
  });
  const ids = picks.map((x) => x.id);
  assert.equal(ids.includes("c2"), false, "红心也压不过不喜欢");
  assert.equal(ids.includes("b1"), false);
  assert.equal(ids.includes("a1"), false);
  assert.equal(ids.length, 5);
});

test("换新倒计时：06:00 前算当天，过点后算次日", () => {
  const before = new Date(2026, 10, 3, 5, 0, 0);
  assert.equal(nextRefreshMs(before), 60 * 60 * 1000);
  const after = new Date(2026, 10, 3, 6, 0, 0);
  assert.equal(nextRefreshMs(after), 24 * 60 * 60 * 1000);
});

test("最近添加按 mtime 倒序；最近播放跳过不在曲库的直链", () => {
  assert.deepEqual(recentAdds(lib, 2).map((x) => x.id), ["c2", "c1"]);
  const played = recentPlayed(lib, ["https://cdn/x.mp3", "b2", "a1"], 5);
  assert.deepEqual(played.map((x) => x.id), ["b2", "a1"]);
});

test("本地电台：曲目不足 3 首的艺人不进候选", () => {
  const pick = radioOf(lib, 42, 3);
  assert.ok(pick);
  assert.equal(pick.tracks.length >= 3, true);
  assert.equal(radioOf([t("solo", "独", "S", 1)], 1, 3), null);
});
