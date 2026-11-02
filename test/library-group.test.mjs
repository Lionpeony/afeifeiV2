import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByAlbum, groupByArtist } from "../dist-test/library-group.mjs";

const t = (id, title, artist, album) => ({
  id,
  path: `X:\\${id}.mp3`,
  title,
  artist,
  album,
  durationMs: 180000,
  size: 1,
  mtimeMs: 1,
  hasCover: false,
  missing: false,
});

test("专辑分组：同专辑归组、组内保持原顺序", () => {
  const groups = groupByAlbum([
    t("1", "A1", "歌手甲", "专辑X"),
    t("2", "B1", "歌手乙", "专辑Y"),
    t("3", "A2", "歌手甲", "专辑X"),
  ]);
  assert.equal(groups.length, 2);
  const x = groups.find((g) => g.album === "专辑X");
  assert.deepEqual(
    x.tracks.map((track) => track.id),
    ["1", "3"],
  );
});

test("同名专辑不同歌手不算同一张；空专辑归「未知专辑」", () => {
  const groups = groupByAlbum([
    t("1", "A", "甲", "同名"),
    t("2", "B", "乙", "同名"),
    t("3", "C", "甲", " "),
  ]);
  assert.equal(groups.length, 3);
  assert.ok(groups.some((g) => g.album === "未知专辑" && g.artist === "甲"));
});

test("歌手分组：空歌手归「未知歌手」", () => {
  const groups = groupByArtist([t("1", "A", "周杰伦", ""), t("2", "B", "  ", "")]);
  assert.equal(groups.length, 2);
  assert.ok(groups.some((g) => g.artist === "未知歌手"));
});

test("组间排序按拼音首字母：李(l) < 张(z)；同首字母内按首字母串稳定排序", () => {
  // 天花板说明：只有首字母，张(zs)与周(zjl)的先后由首字母串决定，不保证全拼序
  const groups = groupByArtist([t("1", "A", "张三", ""), t("2", "B", "李四", "")]);
  assert.equal(groups[0].artist, "李四");
  assert.equal(groups[1].artist, "张三");
});

test("空输入 → 空数组；输入数组不被修改", () => {
  assert.deepEqual(groupByAlbum([]), []);
  assert.deepEqual(groupByArtist([]), []);
  const input = [t("1", "A", "甲", "X")];
  const frozen = structuredClone(input);
  groupByAlbum(input);
  groupByArtist(input);
  assert.deepEqual(input, frozen);
});
