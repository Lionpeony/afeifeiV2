import { test } from "node:test";
import assert from "node:assert/strict";
import { __resetRegistry, registerProvider } from "../dist-test/capability-registry.mjs";
import { findRemoteMatch } from "../dist-test/library-match.mjs";
import { findOnlineFallback } from "../dist-test/fallback.mjs";

test("findRemoteMatch：精确与模糊匹配", () => {
  const list = [
    { sourceId: "s1", title: "春日影 (Live)", artist: "MyGO!!!!!", durationMs: 240000 },
    { sourceId: "s2", title: "迷星叫", artist: "MyGO!!!!!", durationMs: 200000 },
  ];

  // 1. 标题包含/相近
  const match1 = findRemoteMatch(list, { title: "春日影", artist: "MyGO" });
  assert.ok(match1);
  assert.equal(match1.sourceId, "s1");

  // 2. 无关歌曲
  const match2 = findRemoteMatch(list, { title: "碧天伴走", artist: "MyGO" });
  assert.equal(match2, null);
});

test("findOnlineFallback：从备用音源匹配并获取替补播放地址", async () => {
  const mockProvider = {
    id: "mock-qq",
    name: "Mock QQ",
    capabilities: {
      canSearch: true,
      canGetDetail: false,
      canGetUrl: true,
      canGetLyric: false,
      canLogin: false,
      canGetAlbum: false,
      canGetArtist: false,
      canGetPlaylist: false,
      canListPlaylists: false,
      canGetRadio: false,
      canFavorite: false,
      canGetToplist: false,
    },
    traits: { requiresAuth: false, qualities: ["320k"] },
    search: async (q) => {
      if (q.includes("春日影")) {
        return {
          items: [
            { sourceId: "qq-101", title: "春日影", artist: "MyGO!!!!!", durationMs: 242000 },
          ],
        };
      }
      return { items: [] };
    },
    getUrl: async (id) => `https://stream.mock.com/${id}.mp3`,
  };

  const providers = [mockProvider];

  // 排除原音源 netease，成功从 mock-qq 找到替补
  const res = await findOnlineFallback(
    { title: "春日影", artist: "MyGO", durationMs: 240000 },
    "netease",
    "320k",
    providers
  );

  assert.ok(res);
  assert.equal(res.sourceId, "mock-qq");
  assert.equal(res.track.sourceId, "qq-101");
  assert.equal(res.url, "https://stream.mock.com/qq-101.mp3");

  // 若备用源找不到，返回 null
  const noRes = await findOnlineFallback(
    { title: "未知的曲目", artist: "未知" },
    "netease",
    "320k",
    providers
  );
  assert.equal(noRes, null);
});
