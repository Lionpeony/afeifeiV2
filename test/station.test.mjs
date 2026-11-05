import test from "node:test";
import assert from "node:assert/strict";

import {
  DAY_MS,
  MIN_PROGRAM_MS,
  buildDailySchedule,
  joinPointAt,
  programAt,
  queueFromJoin,
  slotLabel,
  startOfBroadcastDay,
} from "../dist-test/station.mjs";
import { PLAYHEAD_RATIO, buildBroadcast } from "../dist-test/broadcast.mjs";

const track = (n, album, artist, durationMs) => ({
  id: `/music/${album}/${n}.mp3`.toLowerCase(),
  path: `C:\\Music\\${album}\\${n}.mp3`,
  title: `${album || "散曲"} ${n}`,
  artist,
  album,
  durationMs,
  size: 1024,
  mtimeMs: 1,
  hasCover: false,
});

const TRACKS = [
  ...Array.from({ length: 8 }, (_, i) => track(i + 1, "夜航", "阿飞", 200_000 + i * 1_000)),
  ...Array.from({ length: 5 }, (_, i) => track(i + 1, "城市", "别人", 180_000)),
  ...Array.from({ length: 3 }, (_, i) => track(i + 1, "", "", 240_000)),
];

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m, 0, 0).getTime();

test("startOfBroadcastDay_凌晨三点_归前一天六点", () => {
  const start = new Date(startOfBroadcastDay(at(5, 3)));
  assert.equal(start.getDate(), 4);
  assert.equal(start.getHours(), 6);
  assert.equal(start.getMinutes(), 0);
});

test("startOfBroadcastDay_正好六点_归当天", () => {
  const start = new Date(startOfBroadcastDay(at(5, 6)));
  assert.equal(start.getDate(), 5);
  assert.equal(start.getHours(), 6);
});

test("buildDailySchedule_节目首尾相接且铺满全天", () => {
  const schedule = buildDailySchedule(TRACKS, at(5, 12));
  assert.ok(schedule.programs.length > 0);
  assert.equal(schedule.programs[0].startMs, schedule.dayStart);

  for (let i = 0; i < schedule.programs.length; i += 1) {
    const p = schedule.programs[i];
    const expected = i === 0 ? schedule.dayStart : schedule.programs[i - 1].endMs;
    assert.equal(p.startMs, expected, `第 ${i} 档起点不连续`);
    assert.ok(p.endMs > p.startMs);

    let ms = 0;
    for (const item of p.items) {
      assert.equal(item.offsetMs, ms, "档内偏移必须从 0 连续");
      ms += item.durationMs;
    }
    assert.equal(p.endMs - p.startMs, ms, "档长必须等于曲目时长之和");
  }
  assert.ok(
    schedule.programs[schedule.programs.length - 1].endMs >= schedule.dayStart + DAY_MS,
    "节目表必须铺满 24 小时",
  );
});

test("buildDailySchedule_收尾短档_并入前一档或重新分配", () => {
  const cases = [
    Array.from({ length: 9 }, (_, i) => track(i + 1, "长专辑", "阿飞", 240_000)),
    Array.from({ length: 13 }, (_, i) => track(i + 1, "短曲集", "阿飞", 120_000)),
  ];
  for (const tracks of cases) {
    const schedule = buildDailySchedule(tracks, at(5, 12));
    for (const p of schedule.programs) {
      assert.ok(
        p.endMs - p.startMs >= MIN_PROGRAM_MS,
        `第 ${p.index} 档只有 ${(p.endMs - p.startMs) / 60_000} 分钟`,
      );
    }
  }
});

test("buildDailySchedule_轮次接缝_相邻两档不重复同一组", () => {
  const schedule = buildDailySchedule(TRACKS, at(5, 12));
  const groupOf = (p) => p.id.split("@")[0].split("#")[0];
  for (let i = 1; i < schedule.programs.length; i += 1) {
    assert.notEqual(
      groupOf(schedule.programs[i]),
      groupOf(schedule.programs[i - 1]),
      `第 ${schedule.programs[i].index} 档与前一档同组：${schedule.programs[i].title}`,
    );
  }
});

test("buildDailySchedule_同一时刻两次构建_结果一致", () => {
  const a = buildDailySchedule(TRACKS, at(5, 12));
  const b = buildDailySchedule(TRACKS, at(5, 12));
  assert.deepEqual(
    a.programs.map((p) => p.id),
    b.programs.map((p) => p.id),
  );
  assert.equal(a.seed, b.seed);
});

test("buildDailySchedule_空曲库_产出空台", () => {
  const schedule = buildDailySchedule([], at(5, 12));
  assert.equal(schedule.programs.length, 0);
  assert.equal(programAt(schedule, schedule.dayStart + 1000), null);
  assert.equal(joinPointAt(schedule, schedule.dayStart + 1000), null);
});

test("programAt_表内命中_表外为空", () => {
  const schedule = buildDailySchedule(TRACKS, at(5, 12));
  assert.equal(programAt(schedule, schedule.dayStart), schedule.programs[0]);
  assert.equal(programAt(schedule, schedule.dayStart - 1), null);

  const last = schedule.programs[schedule.programs.length - 1];
  assert.equal(programAt(schedule, last.endMs), null);
});

test("joinPointAt_十分钟处_落在正确的曲目与偏移", () => {
  const schedule = buildDailySchedule(TRACKS, at(5, 12));
  const atMs = schedule.dayStart + 10 * 60_000;
  const join = joinPointAt(schedule, atMs);
  assert.ok(join);
  assert.equal(join.programOffsetMs, 10 * 60_000);
  assert.ok(join.positionMs >= 0);
  assert.ok(join.positionMs < join.item.durationMs);
  assert.equal(join.program.items[join.itemIndex].path, join.item.path);
  assert.ok(atMs >= join.item.offsetMs + join.program.startMs);
});

test("queueFromJoin_从接驳曲目起_只含真实曲目路径", () => {
  const schedule = buildDailySchedule(TRACKS, at(5, 12));
  const join = joinPointAt(schedule, schedule.dayStart + 10 * 60_000);
  assert.ok(join);

  const paths = new Set(TRACKS.map((t) => t.path));
  const sameProgram = queueFromJoin(schedule, join, 0);
  assert.equal(sameProgram.length, join.program.items.length - join.itemIndex);
  assert.equal(sameProgram[0], join.item.path);
  for (const p of sameProgram) assert.ok(paths.has(p), `队列混入非曲库路径：${p}`);

  const ahead = queueFromJoin(schedule, join, 2);
  assert.ok(ahead.length > sameProgram.length, "向后看两档应包含更多曲目");
});

test("slotLabel_按时段分段", () => {
  assert.equal(slotLabel(at(5, 3)), "深夜");
  assert.equal(slotLabel(at(5, 7)), "清晨");
  assert.equal(slotLabel(at(5, 13)), "午后");
  assert.equal(slotLabel(at(5, 19)), "黄昏");
  assert.equal(slotLabel(at(5, 22)), "夜场");
});

test("buildBroadcast_播放头固定38%_窗口与节目对得上", () => {
  const now = at(5, 21, 30);
  const schedule = buildDailySchedule(TRACKS, now);
  const cast = buildBroadcast(schedule, now);

  assert.equal(cast.onAir, true);
  assert.equal(cast.windowStart, now - PLAYHEAD_RATIO * 6 * 3_600_000);
  assert.equal(cast.current, programAt(schedule, now));
  assert.equal(cast.join?.program.id, cast.current.id);
  assert.ok(cast.seamPct !== null && cast.seamPct >= 0 && cast.seamPct <= 100);
  assert.ok(cast.elapsedMs >= 0 && cast.elapsedMs < cast.current.endMs - cast.current.startMs);

  for (const slot of cast.slots) {
    assert.ok(slot.leftPct >= 0, "slot 左边界不能出窗");
    assert.ok(slot.leftPct + slot.widthPct <= 100.001, "slot 右边界不能出窗");
    assert.ok(slot.widthPct > 0);
  }
  assert.equal(cast.slots.filter((s) => s.current).length, 1);
});

test("buildBroadcast_空台_不在播且无带", () => {
  const now = at(5, 21, 30);
  const schedule = buildDailySchedule([], now);
  const cast = buildBroadcast(schedule, now);
  assert.equal(cast.onAir, false);
  assert.equal(cast.current, null);
  assert.equal(cast.join, null);
  assert.equal(cast.slots.length, 0);
});
