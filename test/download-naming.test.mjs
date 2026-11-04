import { test } from "node:test";
import assert from "node:assert/strict";
import { renderName, uniqueDestPath } from "../dist-test/download-naming.mjs";

/* ---- 下载命名模板（B-10）：只出文件名，不出目录 ---- */

const track = { title: "晴天", artist: "周杰伦", album: "叶惠美", id: "123" };

test("renderName：默认模板", () => {
  assert.equal(renderName("{artist} - {title}", track), "周杰伦 - 晴天");
});

test("renderName：album / index / id 可用，批量序号从 1 起", () => {
  assert.equal(renderName("[{index}] {title} - {artist} ({album})", { ...track, index: 3 }), "[3] 晴天 - 周杰伦 (叶惠美)");
  assert.equal(renderName("{id}", track), "123");
});

test("renderName：Windows 非法字符、控制字符、首尾点与空格", () => {
  // `c*"` 两个非法字符相邻 → 两个下划线，不能悄悄合并（合法名也可能真带 __）
  assert.equal(renderName("{title}", { ...track, title: 'a/b:c*"d<e>f|g' }), "a_b_c__d_e_f_g");
  assert.equal(renderName("{title}", { ...track, title: "  ..晴天..  " }), "晴天");
});

test("renderName：不认识的占位符原样留着，方便看出拼错", () => {
  assert.equal(renderName("{titel} - {title}", track), "{titel} - 晴天");
});

test("renderName：空模板 / 全空值兜底，绝不返回空文件名", () => {
  assert.equal(renderName("", track), "晴天");
  assert.equal(renderName("{album}", { ...track, album: "" }), "晴天");
  assert.equal(renderName("{title}", { title: "", artist: "", id: "abc" }), "abc");
});

test("renderName：超长截断到 120 字", () => {
  assert.equal(renderName("{title}", { ...track, title: "x".repeat(300) }).length, 120);
});

const item = (id, destPath) => ({ id, destPath });

test("uniqueDestPath：没有冲突时原样", () => {
  assert.equal(uniqueDestPath("D:/dl", "晴天", ".mp3", "a", []), "D:/dl/晴天.mp3");
});

test("uniqueDestPath：同名被别的任务占了就加 (2)、(3)", () => {
  const items = [item("b", "D:/dl/晴天.mp3"), item("c", "D:/dl/晴天 (2).mp3")];
  assert.equal(uniqueDestPath("D:/dl", "晴天", ".mp3", "a", items), "D:/dl/晴天 (3).mp3");
});

test("uniqueDestPath：自己已占同一个路径不算冲突（重试同名不改名）", () => {
  const items = [item("a", "D:/dl/晴天.mp3")];
  assert.equal(uniqueDestPath("D:/dl", "晴天", ".mp3", "a", items), "D:/dl/晴天.mp3");
});
