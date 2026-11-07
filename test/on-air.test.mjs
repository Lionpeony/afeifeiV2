import test from "node:test";
import assert from "node:assert/strict";
import { onAirProgram } from "../dist-test/on-air.mjs";

/** 队列元数据：sourceId = 音源，songId = 歌 id */
const meta = (source, song, title) => ({ sourceId: source, songId: song, title, artist: `歌手 ${song}` });

test("onAirProgram：本地歌（队列表查不到）返回 null，首页回落每日推荐", () => {
  const queue = { items: ["local:1"], remote: {} };
  assert.equal(onAirProgram("local:1", queue, () => "本地"), null);
  assert.equal(onAirProgram(null, { items: [], remote: {} }, () => ""), null);
});

test("onAirProgram：节目单 = 同音源队列曲目，按播出顺序，编号位置可对上", () => {
  const remote = {
    "remote:qq:s1": meta("qq", "s1", "第一首"),
    "remote:qq:s2": meta("qq", "s2", "第二首"),
    "remote:ne:s3": meta("ne", "s3", "别家的歌"),
  };
  const queue = { items: ["remote:qq:s1", "remote:qq:s2", "remote:ne:s3"], remote };
  const onAir = onAirProgram("remote:qq:s2", queue, (id) => (id === "qq" ? "QQ音乐" : id));
  assert.ok(onAir, "在播远程歌必须有投影");
  assert.equal(onAir.meta.songId, "s2");
  assert.equal(onAir.sourceName, "QQ音乐");
  // 混源队列只收当前音源，防 id 前缀错位
  assert.deepEqual(
    onAir.list.map((t) => t.sourceId),
    ["s1", "s2"],
    "节目单只含同音源曲目且保序",
  );
  // 转出来的 RemoteTrack 能直接喂给 onPlayRemote（sourceId 字段 = 歌 id）
  assert.equal(onAir.list[1].title, "第二首");
  assert.equal(onAir.list[1].durationMs, 0, "元数据没给时长就落 0，不编数据");
});

test("onAirProgram：当前曲不在同音源集合里也返回投影（list 至少含它自己）", () => {
  const remote = { "remote:qq:s1": meta("qq", "s1", "第一首") };
  const onAir = onAirProgram("remote:qq:s1", { items: ["remote:qq:s1"], remote }, () => "QQ音乐");
  assert.ok(onAir);
  assert.equal(onAir.list.length, 1);
});
