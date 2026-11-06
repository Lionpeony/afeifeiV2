import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatch,
  getState,
  sanitizeLyricOffsets,
  sanitizePlaybackConfig,
  subscribe,
} from "../dist-test/kernel.mjs";

test("play 写入状态", () => {
  dispatch({ type: "player/play", trackId: "t1" });
  assert.equal(getState().player.status, "playing");
  assert.equal(getState().player.trackId, "t1");
});

test("pause 只改状态不动 trackId", () => {
  dispatch({ type: "player/pause" });
  assert.equal(getState().player.status, "paused");
  assert.equal(getState().player.trackId, "t1");
});

test("seek / volume 会被 clamp 到合法区间", () => {
  dispatch({ type: "player/seek", positionMs: -5 });
  assert.equal(getState().player.positionMs, 0);
  dispatch({ type: "player/setVolume", volume: 3 });
  assert.equal(getState().player.volume, 1);
});

test("subscribe 收到通知，取消后不再收到", () => {
  let calls = 0;
  const off = subscribe(() => {
    calls += 1;
  });
  dispatch({ type: "player/pause" });
  assert.equal(calls, 0, "pause 之前已是 paused，reduce 返回同一对象，不该通知");
  dispatch({ type: "player/seek", positionMs: 1000 });
  assert.equal(calls, 1);
  off();
  dispatch({ type: "player/seek", positionMs: 2000 });
  assert.equal(calls, 1);
});

test("未知 intent 不改状态", () => {
  const before = getState();
  dispatch({ type: "不存在的意图" });
  assert.equal(getState(), before);
});

/* ---------- A-17 静音 ---------- */

test("静音是独立字段：不改 volume，取消后回到原音量", () => {
  dispatch({ type: "player/setVolume", volume: 0.42 });
  dispatch({ type: "player/setMuted", muted: true });
  assert.equal(getState().player.muted, true);
  assert.equal(getState().player.volume, 0.42, "静音不许把音量清零");
  dispatch({ type: "player/setMuted", muted: false });
  assert.equal(getState().player.volume, 0.42);
});

test("重复静音不发通知（同值 reducer 返回同一对象）", () => {
  dispatch({ type: "player/setMuted", muted: true });
  let calls = 0;
  const off = subscribe(() => {
    calls += 1;
  });
  dispatch({ type: "player/setMuted", muted: true });
  assert.equal(calls, 0);
  off();
  dispatch({ type: "player/setMuted", muted: false });
});

/* ---------- A-20 队列增删排序 ---------- */

/** 队列入栈并让 startAt 那首真的在播（queue/set 只装载，不播）。 */
function reset(items = ["a", "b", "c", "d"], startAt = 1) {
  dispatch({ type: "queue/set", items, startAt });
  dispatch({ type: "player/play", trackId: items[startAt] });
}

/* ---------- 「添加到队列」：追加不打断 ---------- */

test("queue/add：追加到队尾，光标与当前播放都不动", () => {
  reset(["a", "b"], 0);
  dispatch({ type: "queue/add", items: ["x", "y"] });
  const s = getState();
  assert.deepEqual(s.queue.items, ["a", "b", "x", "y"]);
  assert.equal(s.queue.cursor, 0);
  assert.equal(s.player.trackId, "a");
});

test("queue/add：空数组与空串不产生新状态", () => {
  reset(["a"], 0);
  const before = getState();
  dispatch({ type: "queue/add", items: [] });
  dispatch({ type: "queue/add", items: [""] });
  assert.equal(getState(), before);
});

test("单曲循环下用户点下一首仍切歌（自然结束才重播本曲）", () => {
  // 抄 lx 的 isAutoToggle 双路径：手动切歌按列表走，单曲循环只约束 ended
  reset(["a", "b", "c"], 0);
  dispatch({ type: "queue/mode", mode: "repeat-one" });
  dispatch({ type: "queue/next" });
  const s = getState();
  assert.equal(s.queue.cursor, 1);
  assert.equal(s.player.trackId, "b");
});

/* ---------- 当前曲不在队列（在线单曲）：不许把"队列残值"当成位置 ---------- */

test("在线单曲点下一首：从队列开头播，不是谎报「播完了」", () => {
  reset(["a", "b", "c"], 2); // 光标停在队尾——在线曲目之前留下的残值
  dispatch({ type: "player/play", trackId: "https://cdn.example/x.mp3", trackTitle: "在线 — 某" });
  dispatch({ type: "queue/next" });
  const s = getState();
  assert.notEqual(s.player.status, "ended");
  assert.equal(s.player.trackId, "a");
});

test("在线单曲 + 空队列点下一首：保持播放，不暂停也不改状态", () => {
  dispatch({ type: "queue/clear" });
  dispatch({ type: "player/play", trackId: "https://cdn.example/x.mp3", trackTitle: "在线 — 某" });
  dispatch({ type: "queue/next" });
  const s = getState();
  assert.equal(s.player.status, "playing");
  assert.equal(s.player.trackId, "https://cdn.example/x.mp3");
});

test("切下一首：状态直接是 playing，元数据到达后也不许退回「已暂停」", () => {
  reset(["a", "b"], 0);
  dispatch({ type: "queue/next" });
  assert.equal(getState().player.status, "playing", "切歌就是要播");

  // loadedmetadata 迟到（引擎 onReady）：不能把正在播的这首按成暂停
  dispatch({ type: "player/ready" });
  assert.equal(getState().player.status, "playing");
  assert.equal(getState().player.trackId, "b");
});

test("真的播到队尾：仍然照实报「播完了」", () => {
  reset(["a", "b"], 1);
  dispatch({ type: "queue/next" });
  assert.equal(getState().player.status, "ended");
});

/* ---------- 在线列表入队：点每日推荐/榜单任意一首，队列 = 整份列表 ---------- */

const REMOTES = {
  "remote:netease:1": { sourceId: "netease", songId: "1", title: "新生活", artist: "王齐铭" },
  "remote:netease:2": {
    sourceId: "netease",
    songId: "2",
    title: "Komorebi",
    artist: "熊田理秀",
    coverUrl: "https://img/2",
  },
};

test("在线列表入队：标题与音源标识从元数据恢复，不靠直链", () => {
  dispatch({ type: "queue/set", items: ["remote:netease:1", "remote:netease:2"], startAt: 0, remote: REMOTES });
  dispatch({ type: "player/play" });
  const s = getState();
  assert.equal(s.player.trackId, "remote:netease:1");
  assert.equal(s.player.trackTitle, "新生活 — 王齐铭");
  assert.equal(s.player.remote?.sourceId, "netease");
  assert.equal(s.player.remote?.songId, "1");
});

test("在线列表：下一首就在队列里，不是 ended", () => {
  dispatch({ type: "queue/set", items: ["remote:netease:1", "remote:netease:2"], startAt: 0, remote: REMOTES });
  dispatch({ type: "player/play" });
  dispatch({ type: "queue/next" });
  const s = getState();
  assert.equal(s.player.status, "playing");
  assert.equal(s.player.trackId, "remote:netease:2");
  assert.equal(s.player.trackTitle, "Komorebi — 熊田理秀");
  assert.equal(s.player.remote?.coverUrl, "https://img/2");
});

test("队列里点播在线曲目：音源标识从队列表补，封面/歌词不丢", () => {
  dispatch({ type: "queue/set", items: ["remote:netease:1", "remote:netease:2"], startAt: 1, remote: REMOTES });
  dispatch({ type: "player/play", trackId: "remote:netease:2" });
  const s = getState();
  assert.equal(s.player.remote?.sourceId, "netease");
  assert.equal(s.player.remote?.songId, "2");
  assert.equal(s.player.trackTitle, "Komorebi — 熊田理秀");
});

test("重启恢复：cue 到 remote 逻辑 id 时从队列表补标题（不依赖快照带 title）", () => {
  dispatch({ type: "queue/set", items: ["remote:netease:1", "remote:netease:2"], startAt: 0, remote: REMOTES });
  dispatch({ type: "player/cue", trackId: "remote:netease:2", positionMs: 1000 });
  const s = getState();
  assert.equal(s.player.trackTitle, "Komorebi — 熊田理秀");
  assert.equal(s.player.remote?.sourceId, "netease");
  assert.equal(s.player.positionMs, 1000);
});

test("queue/remove：删掉在线曲目时元数据一起清", () => {
  dispatch({ type: "queue/set", items: ["remote:netease:1", "remote:netease:2"], startAt: 0, remote: REMOTES });
  dispatch({ type: "queue/remove", index: 1 });
  assert.equal("remote:netease:2" in getState().queue.remote, false);
  assert.deepEqual(getState().queue.items, ["remote:netease:1"]);
});

test("queue/set：换一整条队列时旧的在线元数据作废", () => {
  dispatch({ type: "queue/set", items: ["remote:netease:1"], startAt: 0, remote: REMOTES });
  dispatch({ type: "queue/set", items: ["a"], startAt: 0 });
  assert.deepEqual(getState().queue.remote, {});
});

/* ---------- 漫游 FM 无限流：这批放完自动续下一批 ---------- */

test("FM 流式队列：stream 标记随 queue/set 写入，换队列/清空时作废", () => {
  dispatch({
    type: "queue/set",
    items: ["remote:netease:1"],
    startAt: 0,
    remote: REMOTES,
    stream: { sourceId: "netease" },
  });
  assert.equal(getState().queue.stream?.sourceId, "netease");

  reset(["a"], 0); // 普通歌单：不带 stream
  assert.equal(getState().queue.stream, null);

  dispatch({ type: "queue/clear" });
  assert.equal(getState().queue.stream, null);
});

test("queue/trim：裁掉播过的，光标仍指向同一首", () => {
  const items = Array.from({ length: 30 }, (_, i) => `t${i}`);
  reset(items, 25);
  dispatch({ type: "queue/trim", keepBefore: 5 });
  const s = getState();
  assert.equal(s.queue.items.length, 10, "只留当前曲往前 5 首 + 后面的");
  assert.equal(s.queue.items[0], "t20");
  assert.equal(s.queue.cursor, 5);
  assert.equal(s.queue.items[s.queue.cursor], "t25");
  assert.equal(s.player.trackId, "t25");
});

test("queue/trim：没攒够就不产生新状态（不通知）", () => {
  reset(["a", "b", "c"], 2);
  const before = getState();
  dispatch({ type: "queue/trim", keepBefore: 5 });
  assert.equal(getState(), before);
});

test("queue/trim：裁掉的在线元数据不留在表里", () => {
  dispatch({
    type: "queue/set",
    items: ["remote:netease:1", "remote:netease:2", "remote:netease:3"],
    startAt: 2,
    remote: { ...REMOTES, "remote:netease:3": { sourceId: "netease", songId: "3", title: "C", artist: "丙" } },
  });
  dispatch({ type: "queue/trim", keepBefore: 0 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["remote:netease:3"]);
  assert.deepEqual(Object.keys(s.queue.remote), ["remote:netease:3"]);
});

test("FM 挂机：先裁再追加，下一首仍是新批第一首（队列不会涨到几千）", () => {
  const items = Array.from({ length: 200 }, (_, i) => `t${i}`);
  reset(items, 199);
  dispatch({ type: "queue/trim", keepBefore: 20 });
  assert.equal(getState().queue.items.length, 21, "裁完只剩 21 首");

  dispatch({ type: "queue/add", items: ["u0", "u1"] });
  dispatch({ type: "queue/next" });
  assert.equal(getState().player.trackId, "u0");
});

test("FM 续批：queue/add 把新批元数据并进表，光标不动，下一首正好是新批第一首", () => {
  dispatch({
    type: "queue/set",
    items: ["remote:netease:1"],
    startAt: 0,
    remote: REMOTES,
    stream: { sourceId: "netease" },
  });
  const before = getState().queue.cursor;

  dispatch({
    type: "queue/add",
    items: ["remote:netease:2"],
    remote: { "remote:netease:2": REMOTES["remote:netease:2"] },
  });
  const s = getState();
  assert.equal(s.queue.cursor, before, "追加不该打断当前播放");
  assert.equal(s.queue.items.length, 2);
  assert.equal(s.queue.remote["remote:netease:2"].title, "Komorebi");

  // 续批后前进一格：原来那首是队尾，stepForward 会走到新加的第一首
  dispatch({ type: "queue/next" });
  assert.equal(getState().player.trackId, "remote:netease:2");
  assert.equal(getState().player.status, "playing");
});

/* ---------- 倍速（A-15 的一半，抄 lx 的 usePlaybackRate） ---------- */

test("倍速限幅在 0.5–2（抄 lx 的限幅）", () => {
  dispatch({ type: "player/setPlaybackRate", rate: 3 });
  assert.equal(getState().player.playbackRate, 2);
  dispatch({ type: "player/setPlaybackRate", rate: 0.1 });
  assert.equal(getState().player.playbackRate, 0.5);
  dispatch({ type: "player/setPlaybackRate", rate: 1.25 });
  assert.equal(getState().player.playbackRate, 1.25);
});

test("音调补偿是独立开关", () => {
  dispatch({ type: "player/setPreservesPitch", on: false });
  assert.equal(getState().player.preservesPitch, false);
  dispatch({ type: "player/setPreservesPitch", on: true });
  assert.equal(getState().player.preservesPitch, true);
});

test("删当前之前的：光标减一，播放曲目不变", () => {
  reset();
  dispatch({ type: "queue/remove", index: 0 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["b", "c", "d"]);
  assert.equal(s.queue.cursor, 0);
  assert.equal(s.player.trackId, "b");
  assert.equal(s.player.status, "playing");
});

test("删当前之后的：光标不动", () => {
  reset();
  dispatch({ type: "queue/remove", index: 3 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["a", "b", "c"]);
  assert.equal(s.queue.cursor, 1);
  assert.equal(s.player.trackId, "b");
});

test("删正在播的：接到下一条并保持播放，不重播已删的", () => {
  reset();
  dispatch({ type: "queue/remove", index: 1 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["a", "c", "d"]);
  assert.equal(s.player.trackId, "c");
  assert.equal(s.queue.cursor, 1);
  assert.equal(s.player.status, "playing", "一边播一边删，别把播放停掉");
  assert.equal(s.player.positionMs, 0);
});

test("删正在播的且它是最后一条：队列空了就结束，不假装还有歌", () => {
  reset(["a"], 0);
  dispatch({ type: "queue/remove", index: 0 });
  const s = getState();
  assert.deepEqual(s.queue.items, []);
  assert.equal(s.queue.cursor, -1);
  assert.equal(s.player.trackId, null);
  assert.equal(s.player.status, "ended");
});

test("越界的删除/移动不产生新状态", () => {
  reset();
  const before = getState();
  dispatch({ type: "queue/remove", index: 99 });
  dispatch({ type: "queue/move", from: -1, to: 2 });
  assert.equal(getState(), before);
});

test("移动队列：不换歌，光标跟着正在播的那首走", () => {
  reset();
  dispatch({ type: "queue/move", from: 3, to: 0 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["d", "a", "b", "c"]);
  assert.equal(s.player.trackId, "b", "排序不许换歌");
  assert.equal(s.queue.cursor, 2, "光标要跟着 b 走");
  assert.equal(s.player.status, "playing");
});

/* ---------- A-23 睡眠定时 ---------- */

test("睡眠定时：到点只暂停，不退出、不清队列", () => {
  reset();
  dispatch({ type: "sleep/set", endsAt: Date.now() + 1_800_000 });
  assert.equal(typeof getState().sleep.endsAt, "number");

  dispatch({ type: "sleep/expire" });
  const s = getState();
  assert.equal(s.sleep.endsAt, null, "到点后必须清掉定时，否则下一秒又触发一次");
  assert.equal(s.player.status, "paused");
  assert.equal(s.player.trackId, "b", "只暂停，不许退出或换歌");
  assert.equal(s.queue.items.length, 4);
  assert.equal(s.queue.cursor, 1);
});

test("睡眠定时：暂停态到点只是清定时，不改状态位", () => {
  reset(["x", "y"], 0);
  dispatch({ type: "player/pause" });
  dispatch({ type: "sleep/clear" }); // 没设置时也合法（幂等）
  dispatch({ type: "sleep/set", endsAt: 42 });
  dispatch({ type: "sleep/expire" });
  assert.equal(getState().sleep.endsAt, null);
  assert.equal(getState().player.status, "paused");
});

test("睡眠定时：没设定时收到 expire 不产生新状态（迟到的计时器）", () => {
  const before = getState();
  dispatch({ type: "sleep/expire" });
  assert.equal(getState(), before);
});

test("睡眠定时：非法 endsAt 被忽略", () => {
  dispatch({ type: "sleep/clear" });
  const before = getState();
  dispatch({ type: "sleep/set", endsAt: Number.NaN });
  assert.equal(getState(), before);
});

test("移动当前这一格到下一位：光标跟着，播放序不乱", () => {
  reset();
  dispatch({ type: "queue/move", from: 1, to: 2 });
  const s = getState();
  assert.deepEqual(s.queue.items, ["a", "c", "b", "d"]);
  assert.equal(s.queue.cursor, 2);
  assert.equal(s.player.trackId, "b");
  assert.equal(s.queue.items[s.queue.cursor], "b", "cursor 与正在播的必须指向同一项");
});

test("失败策略（P0-15）：默认 skip，可切成 pause", () => {
  assert.equal(getState().playback.onError, "skip", "默认必须是自动跳过");
  dispatch({ type: "playback/setOnError", onError: "pause" });
  assert.equal(getState().playback.onError, "pause");
  dispatch({ type: "playback/setOnError", onError: "skip" });
  assert.equal(getState().playback.onError, "skip");
});

test("失败策略：坏存档落回 skip，不进真相", () => {
  assert.deepEqual(sanitizePlaybackConfig(null), { onError: "skip" });
  assert.deepEqual(sanitizePlaybackConfig("{坏掉的 json"), { onError: "skip" });
  assert.deepEqual(sanitizePlaybackConfig('{"onError":"whatever"}'), { onError: "skip" });
  assert.deepEqual(sanitizePlaybackConfig('{"onError":"pause"}'), { onError: "pause" });
});

test("cue 带上标题与源标识（P0-13）：恢复后顶栏说歌名，不是一串直链", () => {
  dispatch({
    type: "player/cue",
    trackId: "https://stream/x.mp3",
    positionMs: 1000,
    trackTitle: "晴天",
    remote: { sourceId: "netease", songId: "9" },
  });
  const s = getState();
  assert.equal(s.player.trackTitle, "晴天");
  assert.equal(s.player.remote.songId, "9");
  assert.equal(s.player.positionMs, 1000);
});

test("cue 不带标题时清空上一首的（别串台）", () => {
  dispatch({ type: "player/cue", trackId: "C:/b.mp3" });
  const s = getState();
  assert.equal(s.player.trackTitle, null);
  assert.equal(s.player.remote, null);
});

/* ---------- 队列面板（P0-10/12/16） ---------- */

test("queue/clear：队列、光标、标题、进度一起归零，进空态", () => {
  reset();
  dispatch({ type: "player/seek", positionMs: 5000 });
  dispatch({ type: "queue/clear" });
  const s = getState();
  assert.deepEqual(s.queue.items, []);
  assert.equal(s.queue.cursor, -1);
  assert.deepEqual(s.queue.failed, []);
  assert.equal(s.player.status, "idle", "清空后是 idle，不是 ended（ended 会被当成「播完了还有下一首」）");
  assert.equal(s.player.trackId, null);
  assert.equal(s.player.positionMs, 0);
});

test("queue/fail：同一首重复标记是幂等的（不产生新状态）", () => {
  reset();
  dispatch({ type: "queue/fail", trackId: "b", failed: true });
  assert.deepEqual(getState().queue.failed, ["b"]);
  const before = getState();
  dispatch({ type: "queue/fail", trackId: "b", failed: true });
  assert.equal(getState(), before, "重复标记不该通知订阅者");
  dispatch({ type: "queue/fail", trackId: "b", failed: false });
  assert.deepEqual(getState().queue.failed, []);
});

test("queue/remove：删掉的曲目连失败标记一起清掉", () => {
  reset(["a", "b", "c"], 0);
  dispatch({ type: "queue/fail", trackId: "c", failed: true });
  dispatch({ type: "queue/remove", index: 2 });
  assert.deepEqual(getState().queue.failed, [], "同一 id 重新入队不该带着旧标记");
});

test("queue/set：换一整条队列时失败标记作废", () => {
  reset();
  dispatch({ type: "queue/fail", trackId: "b", failed: true });
  dispatch({ type: "queue/set", items: ["x", "y"], startAt: 0 });
  assert.deepEqual(getState().queue.failed, []);
});

/* ---------- 歌词校准（P0-18） ---------- */

test("lyric/nudgeOffset：按曲累加、±10s 封顶、归零删键", () => {
  dispatch({ type: "lyric/resetOffset", trackId: "t1" });
  dispatch({ type: "lyric/nudgeOffset", trackId: "t1", deltaMs: 500 });
  dispatch({ type: "lyric/nudgeOffset", trackId: "t1", deltaMs: 500 });
  assert.equal(getState().lyrics.offsets.t1, 1000);
  // 另一首互不影响（这是"按曲"的意义）
  assert.equal(getState().lyrics.offsets.t2, undefined);
  dispatch({ type: "lyric/nudgeOffset", trackId: "t1", deltaMs: 999999 });
  assert.equal(getState().lyrics.offsets.t1, 10000, "上限 ±10s");
  dispatch({ type: "lyric/nudgeOffset", trackId: "t1", deltaMs: -10000 });
  assert.equal("t1" in getState().lyrics.offsets, false, "归零要删键，不留一堆 0 撑存档");
});

test("lyric/resetOffset：只清这一首", () => {
  dispatch({ type: "lyric/nudgeOffset", trackId: "a", deltaMs: 500 });
  dispatch({ type: "lyric/nudgeOffset", trackId: "b", deltaMs: -500 });
  dispatch({ type: "lyric/resetOffset", trackId: "a" });
  assert.equal(getState().lyrics.offsets.a, undefined);
  assert.equal(getState().lyrics.offsets.b, -500);
  dispatch({ type: "lyric/resetOffset", trackId: "b" });
});

test("sanitizeLyricOffsets：坏条目逐条丢，不整份作废", () => {
  assert.deepEqual(sanitizeLyricOffsets(null), {});
  assert.deepEqual(sanitizeLyricOffsets("{坏 json"), {});
  const got = sanitizeLyricOffsets('{"ok":500,"big":99999,"zero":0,"str":"x","neg":-300}');
  assert.deepEqual(got, { ok: 500, big: 10000, neg: -300 }, "99999 夹到 10000，0 与字符串丢掉");
});

/* ---------- P0-24 睡眠定时：播完当前曲再停 ---------- */

/** 起一条 a/b/c 的队列并播第一首（每条用例自己铺干净现场） */
const seedPlaying = (mode = "order") => {
  dispatch({
    type: "queue/restore",
    state: {
      items: ["a", "b", "c"],
      cursor: 0,
      context: ["a", "b", "c"],
      history: [],
      mode,
      shuffleSeed: 1,
    },
  });
  dispatch({ type: "player/play", trackId: "a" });
};

test("勾了「播完再停」：到点不暂停，这首结束才停且不切下一首", () => {
  seedPlaying();
  dispatch({ type: "sleep/setWaitEnd", waitEnd: true });
  dispatch({ type: "sleep/set", endsAt: 1 });
  dispatch({ type: "sleep/expire" });

  assert.equal(getState().player.status, "playing", "到点那一刻不许暂停");
  assert.equal(getState().sleep.pending, true, "要挂起等这首播完");
  assert.equal(getState().sleep.endsAt, null, "定时本身结束，界面不再倒计时");

  dispatch({ type: "player/ended" });
  const s = getState();
  assert.equal(s.player.status, "paused");
  assert.equal(s.player.trackId, "a", "停在这首，不许替用户切下一首");
  assert.equal(s.sleep.pending, false, "挂起只用一次");
});

test("不勾「播完再停」：到点立刻暂停（A-23 老行为不变）", () => {
  seedPlaying();
  dispatch({ type: "sleep/setWaitEnd", waitEnd: false });
  dispatch({ type: "sleep/set", endsAt: 2 });
  dispatch({ type: "sleep/expire" });
  assert.equal(getState().player.status, "paused");
  assert.equal(getState().sleep.pending, false);
});

test("单曲循环 + 挂起：播完是停，不是重播", () => {
  seedPlaying("repeat-one");
  dispatch({ type: "sleep/setWaitEnd", waitEnd: true });
  dispatch({ type: "sleep/set", endsAt: 3 });
  dispatch({ type: "sleep/expire" });
  dispatch({ type: "player/ended" });
  const s = getState();
  assert.equal(s.player.status, "paused");
  assert.equal(s.player.positionMs, 0);
});

test("挂起时用户主动切下一首：跟着走，别在新歌上突然停", () => {
  seedPlaying();
  dispatch({ type: "sleep/setWaitEnd", waitEnd: true });
  dispatch({ type: "sleep/set", endsAt: 4 });
  dispatch({ type: "sleep/expire" });
  dispatch({ type: "queue/next" });
  assert.equal(getState().player.trackId, "b");
  assert.equal(getState().sleep.pending, false);
});

test("挂起时取消勾选 = 别等了，立刻暂停", () => {
  seedPlaying();
  dispatch({ type: "sleep/setWaitEnd", waitEnd: true });
  dispatch({ type: "sleep/set", endsAt: 5 });
  dispatch({ type: "sleep/expire" });
  dispatch({ type: "sleep/setWaitEnd", waitEnd: false });
  assert.equal(getState().player.status, "paused");
  assert.equal(getState().sleep.pending, false);
});

test("挂起时点「取消」：挂起一起清掉", () => {
  seedPlaying();
  dispatch({ type: "sleep/setWaitEnd", waitEnd: true });
  dispatch({ type: "sleep/set", endsAt: 6 });
  dispatch({ type: "sleep/expire" });
  dispatch({ type: "sleep/clear" });
  assert.equal(getState().sleep.pending, false);
  assert.equal(getState().sleep.endsAt, null);
});

test("重新定时会清掉上一次的挂起", () => {
  seedPlaying();
  dispatch({ type: "sleep/setWaitEnd", waitEnd: true });
  dispatch({ type: "sleep/set", endsAt: 7 });
  dispatch({ type: "sleep/expire" });
  dispatch({ type: "sleep/set", endsAt: 8 });
  assert.equal(getState().sleep.pending, false);
  assert.equal(getState().sleep.endsAt, 8);
});

test("queue/restore：老快照没有 failed 字段时补空数组", () => {
  dispatch({
    type: "queue/restore",
    state: { items: ["a", "b"], cursor: 0, context: ["a", "b"], history: [], mode: "order", shuffleSeed: 1 },
  });
  assert.deepEqual(getState().queue.failed, []);
});
