import { test } from "node:test";
import assert from "node:assert/strict";
import { initialsOf, matchKey, scoreKey, searchKeyOf } from "../dist-test/pinyin.mjs";

test("汉字转首字母", () => {
  assert.equal(initialsOf("七里香"), "qlx");
});

test("英文与数字原样保留", () => {
  assert.equal(initialsOf("abc123"), "abc123");
});

test("中英混排：汉字转首字母，英文照抄（且统一小写）", () => {
  assert.equal(initialsOf("周杰伦Jay"), initialsOf("周杰伦") + "jay");
});

test("空串返回空串", () => {
  assert.equal(initialsOf(""), "");
});

test("searchKeyOf：拼出 base 与 initials", () => {
  const key = searchKeyOf({ title: "七里香", artist: "周杰伦", album: "七里香" });
  assert.ok(key.base.includes("七里香"));
  assert.ok(key.initials.includes("qlx"));
});

test("matchKey：打中文命中", () => {
  const key = searchKeyOf({ title: "七里香", artist: "周杰伦", album: "" });
  assert.equal(matchKey(key, "七里"), true);
});

test("matchKey：打两个首字母就命中（50 §18 第 2 条）", () => {
  const key = searchKeyOf({ title: "七里香", artist: "周杰伦", album: "" });
  assert.equal(matchKey(key, "ql"), true);
});

test("matchKey：打歌手首字母也命中", () => {
  const key = searchKeyOf({ title: "七里香", artist: "周杰伦", album: "" });
  assert.equal(matchKey(key, "zjl"), true);
});

test("matchKey：打不相关的不命中", () => {
  const key = searchKeyOf({ title: "七里香", artist: "周杰伦", album: "" });
  assert.equal(matchKey(key, "xyz"), false);
});

test("matchKey：空关键词命中全部（清空搜索框要能回到全量）", () => {
  const key = searchKeyOf({ title: "七里香", artist: "周杰伦", album: "" });
  assert.equal(matchKey(key, "   "), true);
});

test("scoreKey：字段开头命中排前面（0）", () => {
  const key = searchKeyOf({ title: "七里香", artist: "周杰伦", album: "" });
  assert.equal(scoreKey(key, "七里"), 0);
});

test("scoreKey：字段中间命中排后面（1）", () => {
  const key = searchKeyOf({ title: "爱在西元前", artist: "周杰伦", album: "" });
  assert.equal(scoreKey(key, "西元"), 1);
});

test("scoreKey：空关键词给最低优先级（2）", () => {
  const key = searchKeyOf({ title: "七里香", artist: "周杰伦", album: "" });
  assert.equal(scoreKey(key, ""), 2);
});
