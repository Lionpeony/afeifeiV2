import { test } from "node:test";
import assert from "node:assert/strict";
import { isTextTarget, isRangeTarget, resolveEsc } from "../dist-test/input-esc.mjs";
import { COMMAND_LIMIT, filterCommands } from "../dist-test/input-commands.mjs";

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
