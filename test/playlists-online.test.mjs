import { test } from "node:test";
import assert from "node:assert/strict";
import { dropSaved, mergeSaved, parsePlaylistRef, parseSaved } from "../dist-test/playlists-online.mjs";

/* ---- 导入歌单（M11）：分享文案 → id；收藏列表去重 ---- */

test("parsePlaylistRef：?id= 参数", () => {
  assert.equal(parsePlaylistRef("https://music.163.com/playlist?id=24381616"), "24381616");
  assert.equal(parsePlaylistRef("https://music.163.com/playlist?userid=1&id=123"), "123");
});

test("parsePlaylistRef：/playlist/123 路径", () => {
  assert.equal(parsePlaylistRef("https://music.163.com/#/playlist/24381616"), "24381616");
});

test("parsePlaylistRef：纯 id 与带文案的分享串", () => {
  assert.equal(parsePlaylistRef("  24381616  "), "24381616");
  assert.equal(parsePlaylistRef("分享歌单 https://music.163.com/playlist?id=999 '我的歌单'"), "999");
});

test("parsePlaylistRef：认不出就返回 null，不猜", () => {
  assert.equal(parsePlaylistRef(""), null);
  assert.equal(parsePlaylistRef("周杰伦"), null);
  assert.equal(parsePlaylistRef("https://music.163.com/song?id=1"), null);
});

const p = (id, name, count) => ({ sourceId: "netease", id, name, count });

test("mergeSaved：新的排最前，重复的原地更新", () => {
  let list = mergeSaved([], p("1", "甲", 3), 100);
  list = mergeSaved(list, p("2", "乙", 4), 200);
  assert.deepEqual(
    list.map((x) => x.id),
    ["2", "1"],
  );

  list = mergeSaved(list, p("1", "甲改名", 9), 300);
  assert.deepEqual(
    list.map((x) => x.id),
    ["2", "1"],
  );
  assert.equal(list[1].name, "甲改名");
  assert.equal(list[1].count, 9);
  assert.equal(list[1].savedAt, 300);
});

test("mergeSaved：同 id 不同源算两个歌单", () => {
  let list = mergeSaved([], p("1", "甲", 3));
  list = mergeSaved(list, { ...p("1", "甲", 3), sourceId: "qq" });
  assert.equal(list.length, 2);
});

test("mergeSaved：超过上限丢最旧的", () => {
  let list = [];
  for (let i = 0; i < 205; i += 1) list = mergeSaved(list, p(String(i), `n${i}`, 1), i);
  assert.equal(list.length, 200);
  assert.equal(list[0].id, "204");
  assert.equal(list[199].id, "5");
});

test("dropSaved：按源 + id 精确移除", () => {
  const list = mergeSaved(mergeSaved([], p("1", "甲", 1)), p("2", "乙", 2));
  assert.deepEqual(
    dropSaved(list, "netease", "1").map((x) => x.id),
    ["2"],
  );
  assert.equal(dropSaved(list, "qq", "1").length, 2);
});

test("parseSaved：坏 JSON / 数组 / 缺字段一律丢弃", () => {
  assert.deepEqual(parseSaved(null), []);
  assert.deepEqual(parseSaved("{坏"), []);
  assert.deepEqual(parseSaved('{"a":1}'), []);
  assert.deepEqual(parseSaved(JSON.stringify([{ id: "1" }, p("2", "乙", 2)])).map((x) => x.id), ["2"]);
});

test("parseSaved：负数/NaN 曲目数归 0，名字兜底", () => {
  const [item] = parseSaved(JSON.stringify([{ ...p("1", "   ", -5) }]));
  assert.equal(item.count, 0);
  assert.equal(item.name, "未命名歌单");
});
