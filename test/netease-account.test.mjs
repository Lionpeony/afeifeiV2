import { test } from "node:test";
import assert from "node:assert/strict";
import { createNeteaseProvider } from "../dist-test/capability-netease.mjs";
import { assertCapabilities, __resetRegistry, registerProvider } from "../dist-test/capability-registry.mjs";

/**
 * 账号级数据（R1 第一批）的判据。
 * 这一层的错只有两种：①方法名/参数与主进程白名单对不上（线上直接抛「不允许调用」）；
 * ②字段路径猜错（返回空列表，界面显示成「今天没推荐」）。两种都在这里钉住。
 */
function fakeApi(routes, { loggedIn = true, uid = 42 } = {}) {
  const calls = [];
  return {
    calls,
    profile: async () => ({ loggedIn, nick: loggedIn ? "tester" : null, uid: loggedIn ? String(uid) : null }),
    call: async (ns, method, params) => {
      calls.push({ ns, method, params });
      if (method === "login_status") return loggedIn ? { profile: { userId: uid } } : { code: 301 };
      const route = routes[method];
      if (typeof route === "function") return route(params);
      return route ?? {};
    },
  };
}

const rawSong = (id, name, artist = "周杰伦") => ({
  id,
  name,
  ar: [{ name: artist }],
  al: { name: "叶惠美", picUrl: "https://cdn/x.jpg" },
  dt: 269000,
});

test("account 五件事齐全才算合规（启动断言拦得住缺一件）", () => {
  const p = createNeteaseProvider(fakeApi({}));
  assert.ok(p.account, "netease 必须提供 account");
  assert.doesNotThrow(() => assertCapabilities(p));

  __resetRegistry();
  const broken = { ...p, id: "broken-account", account: { dailySongs: async () => [] } };
  assert.throws(() => registerProvider(broken), /account 却缺少 likedIds/);
});

test("每日推荐：认 v3 的 data.dailySongs，映射成 RemoteTrack", async () => {
  const api = fakeApi({
    recommend_songs: { data: { dailySongs: [rawSong(1, "晴天"), rawSong(2, "以父之名")] } },
  });
  const p = createNeteaseProvider(api);
  const songs = await p.account.dailySongs();

  assert.equal(api.calls[0].method, "recommend_songs", "方法名必须与主进程白名单登记的一致");
  assert.equal(songs.length, 2);
  assert.deepEqual(songs[0], {
    sourceId: "1",
    title: "晴天",
    artist: "周杰伦",
    album: "叶惠美",
    durationMs: 269000,
    coverUrl: "https://cdn/x.jpg",
  });
});

test("每日推荐：老版本只给 recommend 也要认", async () => {
  const p = createNeteaseProvider(fakeApi({ recommend_songs: { recommend: [rawSong(3, "东风破")] } }));
  const songs = await p.account.dailySongs();
  assert.equal(songs.length, 1);
  assert.equal(songs[0].title, "东风破");
});

test("每日推荐：空列表 + 未登录 → auth-required（不是静默空）", async () => {
  const p = createNeteaseProvider(fakeApi({ recommend_songs: { data: { dailySongs: [] } } }, { loggedIn: false }));
  await assert.rejects(
    () => p.account.dailySongs(),
    (e) => e.code === "auth-required",
    "未登录必须说「先登录」，否则界面显示成「今天没有推荐」",
  );
});

test("账号红心：likelist 带 uid（来自 login_status），id 一律转字符串", async () => {
  const api = fakeApi({ likelist: { ids: [1, 2, "3"] } });
  const p = createNeteaseProvider(api);
  const ids = await p.account.likedIds();

  const like = api.calls.find((c) => c.method === "likelist");
  assert.equal(like.params.uid, 42, "uid 必须从登录态取，不能让调用方传");
  assert.deepEqual(ids, ["1", "2", "3"]);
});

test("收藏：like 接口认字符串 'true'/'false'（传布尔值会被包当成「收藏」）", async () => {
  const api = fakeApi({ like: { code: 200 } });
  const p = createNeteaseProvider(api);

  await p.account.setLiked("123", true);
  assert.deepEqual(api.calls.at(-1), { ns: "netease", method: "like", params: { id: "123", like: "true" } });

  await p.account.setLiked("123", false);
  assert.deepEqual(api.calls.at(-1), { ns: "netease", method: "like", params: { id: "123", like: "false" } });
});

test("听歌排行：week → type 1 取 weekData，all → type 0 取 allData，歌在 row.song 里", async () => {
  const api = fakeApi({
    user_record: {
      weekData: [{ playCount: 12, song: rawSong(7, "七里香") }],
      allData: [{ playCount: 99, song: rawSong(8, "夜曲") }, { playCount: 5, song: rawSong(9, "搁浅") }],
    },
  });
  const p = createNeteaseProvider(api);

  const week = await p.account.listeningHistory("week");
  assert.equal(api.calls.at(-1).params.type, 1);
  assert.equal(week.length, 1);
  assert.equal(week[0].title, "七里香");
  assert.equal(week[0].durationMs, 269000, "排行行本身没有时长，必须从 song 里取");

  const all = await p.account.listeningHistory("all");
  assert.equal(api.calls.at(-1).params.type, 0);
  assert.equal(all.length, 2);
  assert.equal(all[1].title, "搁浅");
});

test("红心详情：likelist 拿 id → song_detail 分批取详情（不是 N 次单曲请求）", async () => {
  const ids = Array.from({ length: 250 }, (_, i) => i + 1);
  const api = fakeApi({
    likelist: { ids },
    song_detail: (params) => {
      const wanted = String(params.ids).split(",").map(Number);
      return { songs: wanted.map((id) => rawSong(id, `第${id}首`)) };
    },
  });
  const p = createNeteaseProvider(api);
  const songs = await p.account.likedSongs();

  const detailCalls = api.calls.filter((c) => c.method === "song_detail");
  assert.equal(detailCalls.length, 2, `250 首应分 2 批，实际 ${detailCalls.length} 次`);
  assert.equal(detailCalls[0].params.ids.split(",").length, 200);
  assert.equal(detailCalls[1].params.ids.split(",").length, 50);
  assert.equal(songs.length, 250);
  assert.equal(songs[249].title, "第250首");
});

test("红心详情：一首都没有时不发 song_detail（省一次请求）", async () => {
  const api = fakeApi({ likelist: { ids: [] } });
  const p = createNeteaseProvider(api);
  assert.deepEqual(await p.account.likedSongs(), []);
  assert.equal(api.calls.filter((c) => c.method === "song_detail").length, 0);
});

test("个人 FM：取 data，未登录给 auth-required", async () => {
  const ok = createNeteaseProvider(fakeApi({ personal_fm: { data: [rawSong(11, "半岛铁盒")] } }));
  const songs = await ok.account.personalFm();
  assert.equal(songs[0].title, "半岛铁盒");

  const anon = createNeteaseProvider(fakeApi({ personal_fm: { data: [] } }, { loggedIn: false }));
  await assert.rejects(() => anon.account.personalFm(), (e) => e.code === "auth-required");
});
