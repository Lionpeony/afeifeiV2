import { test } from "node:test";
import assert from "node:assert/strict";
import { createNeteaseProvider } from "../dist-test/capability-netease.mjs";

/** 首页栏目映射：字段路径猜错会变成「区块空白」，必须在这里钉住。 */
function fakeApi(routes) {
  const calls = [];
  return {
    calls,
    profile: async () => ({ loggedIn: true, nick: "tester", uid: "42" }),
    call: async (_ns, method, params) => {
      calls.push({ method, params });
      const route = routes[method];
      if (typeof route === "function") return route(params);
      if (route === undefined) throw new Error(`unexpected method ${method}`);
      return route;
    },
  };
}

test("home：推荐歌单与 新歌速递 映射成两块，字段不丢", async () => {
  const api = fakeApi({
    personalized: {
      result: [
        { id: 11, name: "夜车歌单", picUrl: "https://cdn/p.jpg", playCount: 123456, trackCount: 22 },
        { id: 12, name: "", picUrl: "", playCount: "x", trackCount: "y" },
      ],
    },
    personalized_newsong: {
      result: [
        {
          id: 99,
          song: {
            id: 99,
            name: "夜行",
            artists: [{ name: "A" }, { name: "B" }],
            album: { name: "专", picUrl: "https://cdn/a.jpg" },
            duration: 201000,
          },
        },
      ],
    },
  });

  const sections = await createNeteaseProvider(api).home();
  assert.equal(sections.length, 2);

  const cards = sections[0];
  assert.equal(cards.id, "recommend-playlists");
  assert.equal(cards.layout, "cards");
  assert.equal(cards.items.length, 2);
  const first = cards.items[0];
  assert.equal(first.kind, "playlist");
  assert.equal(first.id, "11");
  assert.equal(first.title, "夜车歌单");
  assert.equal(first.subtitle, "22 首");
  assert.equal(first.coverUrl, "https://cdn/p.jpg");
  assert.equal(first.playCount, 123456);
  // 空名字/坏数字要兜底，不能让界面出现 undefined
  assert.equal(cards.items[1].title, "未命名歌单");
  assert.equal(cards.items[1].playCount, undefined);

  const tracks = sections[1];
  assert.equal(tracks.id, "new-songs");
  assert.equal(tracks.layout, "tracks");
  assert.equal(tracks.items.length, 1);
  const t = tracks.items[0].track;
  assert.equal(t.sourceId, "99");
  assert.equal(t.title, "夜行");
  assert.equal(t.artist, "A / B");
  assert.equal(t.album, "专");
  assert.equal(t.coverUrl, "https://cdn/a.jpg");
  assert.equal(t.durationMs, 201000);

  assert.ok(api.calls.some((c) => c.method === "personalized" && c.params.limit === 12));
  assert.ok(api.calls.some((c) => c.method === "personalized_newsong"));
});

test("home：某一栏失败只少那一块，不连坐", async () => {
  const api = fakeApi({
    personalized: () => {
      throw new Error("boom");
    },
    personalized_newsong: { result: [] },
  });
  const sections = await createNeteaseProvider(api).home();
  assert.deepEqual(sections, []);
});
