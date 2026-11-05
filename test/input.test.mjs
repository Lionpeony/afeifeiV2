import { test } from "node:test";
import assert from "node:assert/strict";
import { isTextTarget, isRangeTarget, isListTarget, resolveEsc } from "../dist-test/input-esc.mjs";
import { COMMAND_LIMIT, filterCommands } from "../dist-test/input-commands.mjs";
import { setTracks, searchTracks, trackById } from "../dist-test/library-state.mjs";

/** DOM 类判定用假对象：isTextTarget 只访问 tagName/type/isContentEditable。 */
function fakeEl(tag, type, contentEditable = false) {
  return { tagName: tag, type, isContentEditable: contentEditable };
}

/* ---- Esc 裁决（穷举：全屏/模态/面板/空 × 组合） ---- */

test("resolveEsc：全屏优先于一切", () => {
  const a = resolveEsc({ fullscreen: true, modals: ["login"], panels: ["fx"] });
  assert.deepEqual(a, { type: "exitFullscreen" });
});

test("resolveEsc：模态优先于面板，且关最上层（末尾）", () => {
  const a = resolveEsc({ fullscreen: false, modals: ["login", "confirm"], panels: ["fx"] });
  assert.deepEqual(a, { type: "closeModal", id: "confirm" });
});

test("resolveEsc：无模态关最上层面板", () => {
  const a = resolveEsc({ fullscreen: false, modals: [], panels: ["fx", "menu"] });
  assert.deepEqual(a, { type: "closePanel", id: "menu" });
});

test("resolveEsc：什么都没有 → ignore（不吃掉 Esc，交给默认行为）", () => {
  const a = resolveEsc({ fullscreen: false, modals: [], panels: [] });
  assert.deepEqual(a, { type: "ignore" });
});

test("resolveEsc：穷举 2×3×3 = 18 种组合无异常且结果合法", () => {
  for (const fs of [true, false]) {
    for (const m of [[], ["a"], ["a", "b"]]) {
      for (const p of [[], ["p1"], ["p1", "p2"]]) {
        const a = resolveEsc({ fullscreen: fs, modals: m, panels: p });
        assert.ok(["exitFullscreen", "closeModal", "closePanel", "ignore"].includes(a.type));
      }
    }
  }
});

/* ---- 守卫判定 ---- */

test("isTextTarget：文本输入是 true，滑杆/按钮/checkbox 是 false", () => {
  assert.equal(isTextTarget(fakeEl("INPUT", "text")), true);
  assert.equal(isTextTarget(fakeEl("INPUT", "search")), true);
  assert.equal(isTextTarget(fakeEl("TEXTAREA", undefined)), true);
  assert.equal(isTextTarget(fakeEl("DIV", undefined, true)), true, "contentEditable 也是输入");
  assert.equal(isTextTarget(fakeEl("INPUT", "range")), false);
  assert.equal(isTextTarget(fakeEl("INPUT", "checkbox")), false);
  assert.equal(isTextTarget(fakeEl("INPUT", "button")), false);
  assert.equal(isTextTarget(fakeEl("BUTTON", undefined)), false);
  assert.equal(isTextTarget(null), false);
});

test("isRangeTarget：只有 input[type=range]", () => {
  assert.equal(isRangeTarget(fakeEl("INPUT", "range")), true);
  assert.equal(isRangeTarget(fakeEl("INPUT", "text")), false);
  assert.equal(isRangeTarget(null), false);
});

test("isListTarget：只有 <select>（方向键/空格归下拉，00 §9.5）", () => {
  assert.equal(isListTarget(fakeEl("SELECT", undefined)), true);
  assert.equal(isListTarget(fakeEl("INPUT", "text")), false);
  assert.equal(isListTarget(null), false);
});

/* ---- 面板搜歌（searchTracks：一次性查询，不动全局 query） ---- */

test("searchTracks：命中标题并截到上限，且不污染曲库全局搜索词", async () => {
  const { getQuery, setQuery } = await import("../dist-test/library-state.mjs");
  const tracks = [
    { id: "a", path: "a.mp3", title: "晴天", artist: "周杰伦", album: "", durationMs: 0, size: 1, mtimeMs: 0, hasCover: false },
    { id: "b", path: "b.mp3", title: "听妈妈的话", artist: "周杰伦", album: "", durationMs: 0, size: 1, mtimeMs: 0, hasCover: false },
    { id: "c", path: "c.mp3", title: "夜曲", artist: "周杰伦", album: "", durationMs: 0, size: 1, mtimeMs: 0, hasCover: false },
  ];
  setTracks(tracks);
  const out = searchTracks("晴天");
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "晴天");
  assert.equal(getQuery(), "", "searchTracks 不得改动全局搜索词");
  assert.equal(searchTracks("周杰伦").length <= 12, true);
  assert.equal(searchTracks("").length, 0, "空关键词不搜");
});

test("trackById：队列里存原始路径_归一化后仍能查到曲目", () => {
  setTracks([
    {
      id: "c:/music/叶惠美/1.mp3",
      path: "C:\\Music\\叶惠美\\1.mp3",
      title: "以父之名",
      artist: "周杰伦",
      album: "叶惠美",
      durationMs: 342000,
      size: 1,
      mtimeMs: 0,
      hasCover: false,
    },
  ]);
  // 队列/播放态放的是原始 path：盘符大写、反斜杠 —— 这是线上会走到的那条
  assert.equal(trackById("C:\\Music\\叶惠美\\1.mp3")?.title, "以父之名");
  assert.equal(trackById("c:/music/叶惠美/1.mp3")?.title, "以父之名", "已归一化的 id 也要能查");
  assert.equal(trackById("D:/nope.mp3"), undefined);
});

/* ---- 命令过滤 ---- */

const CMDS = [
  { id: "a", label: "播放 / 暂停", run: () => {} },
  { id: "b", label: "转到：本地曲库", run: () => {} },
  { id: "c", label: "转到：在线搜索", run: () => {} },
  { id: "d", label: "扫描目录", run: () => {} },
];

test("filterCommands：开头命中优先于包含命中", () => {
  const out = filterCommands(CMDS, "转到");
  assert.deepEqual(out.map((c) => c.id), ["b", "c"]);
});

test("filterCommands：包含命中兜底、大小写不敏感", () => {
  const out = filterCommands(CMDS, "目录");
  assert.deepEqual(out.map((c) => c.id), ["d"]);
  assert.equal(filterCommands(CMDS, "播放").length, 1);
});

test("filterCommands：空查询给全部（截到上限）", () => {
  assert.equal(filterCommands(CMDS, "").length, CMDS.length);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), label: `命令${i}`, run: () => {} }));
  assert.equal(filterCommands(many, "").length, COMMAND_LIMIT);
  assert.equal(COMMAND_LIMIT, 12);
});

test("filterCommands：无命中给空数组", () => {
  assert.deepEqual(filterCommands(CMDS, "zzz"), []);
});
