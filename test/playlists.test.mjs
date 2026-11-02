import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTrack,
  createPlaylist,
  getPlaylists,
  loadPlaylists,
  removePlaylist,
  removeTrack,
  renamePlaylist,
  savePlaylists,
  setPlaylists,
} from "../dist-test/playlists.mjs";

function memoryPort(initial = null) {
  const written = [];
  return {
    written,
    read: async () => initial,
    write: async (_key, json) => {
      written.push(json);
    },
  };
}

test("createPlaylist：建出来的歌单带 id 与空列表", () => {
  setPlaylists([]);
  const p = createPlaylist("通勤", 1000);
  assert.ok(p.id.length > 0);
  assert.equal(p.name, "通勤");
  assert.deepEqual(p.trackIds, []);
  assert.equal(p.createdAt, 1000);
});

test("createPlaylist：空名字给默认名，不会建出无名歌单", () => {
  setPlaylists([]);
  const p = createPlaylist("   ");
  assert.equal(p.name, "未命名歌单");
});

test("createPlaylist：名字超长被截断（60 字上限）", () => {
  setPlaylists([]);
  const p = createPlaylist("x".repeat(100));
  assert.equal(p.name.length, 60);
});

test("addTrack：加进去", () => {
  setPlaylists([]);
  const p = createPlaylist("a");
  assert.equal(addTrack(p.id, "t1"), true);
  assert.deepEqual(getPlaylists()[0].trackIds, ["t1"]);
});

test("addTrack：同一首不重复加", () => {
  setPlaylists([]);
  const p = createPlaylist("a");
  addTrack(p.id, "t1");
  assert.equal(addTrack(p.id, "t1"), false);
  assert.equal(getPlaylists()[0].trackIds.length, 1);
});

test("removeTrack：删掉指定的歌", () => {
  setPlaylists([]);
  const p = createPlaylist("a");
  addTrack(p.id, "t1");
  addTrack(p.id, "t2");
  assert.equal(removeTrack(p.id, "t1"), true);
  assert.deepEqual(getPlaylists()[0].trackIds, ["t2"]);
});

test("removeTrack：不在列表里返回 false", () => {
  setPlaylists([]);
  const p = createPlaylist("a");
  assert.equal(removeTrack(p.id, "ghost"), false);
});

test("renamePlaylist：改名字", () => {
  setPlaylists([]);
  const p = createPlaylist("旧");
  assert.equal(renamePlaylist(p.id, "新"), true);
  assert.equal(getPlaylists()[0].name, "新");
});

test("renamePlaylist：名字没变返回 false（不产生无谓通知）", () => {
  setPlaylists([]);
  const p = createPlaylist("同名");
  assert.equal(renamePlaylist(p.id, "同名"), false);
});

test("removePlaylist：删掉整个歌单", () => {
  setPlaylists([]);
  const p = createPlaylist("a");
  assert.equal(removePlaylist(p.id), true);
  assert.equal(getPlaylists().length, 0);
});

test("removePlaylist：不存在的 id 返回 false", () => {
  setPlaylists([]);
  assert.equal(removePlaylist("ghost"), false);
});

test("save / load 往返一致", async () => {
  setPlaylists([]);
  const p = createPlaylist("通勤", 5);
  addTrack(p.id, "t1");

  const port = memoryPort();
  await savePlaylists(port);

  const restored = memoryPort(port.written[0]);
  const count = await loadPlaylists(restored);
  assert.equal(count, 1);
  assert.equal(getPlaylists()[0].name, "通勤");
  assert.deepEqual(getPlaylists()[0].trackIds, ["t1"]);
});

test("load：坏记录被过滤，不整份丢掉", async () => {
  const good = { id: "1", name: "ok", trackIds: ["t"], createdAt: 1 };
  const count = await loadPlaylists(memoryPort(JSON.stringify([good, { id: 2 }, null])));
  assert.equal(count, 1);
  assert.equal(getPlaylists()[0].name, "ok");
});
