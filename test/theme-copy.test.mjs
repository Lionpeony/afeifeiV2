import { test } from "node:test";
import assert from "node:assert/strict";
import { packCopy, stageCopy } from "../dist-test/theme-copy.mjs";

/**
 * 演出话术表（docs/30 §39）的守门测试。
 * 三个包各说各的话是这套主题的产品承诺；任何一包漏 key 或抄回基座，
 * 界面上只会显示成「换色不换文」，肉眼很难在切包时抓到，所以钉在源码层。
 */

const PALETTES = ["default", "mygo", "gbc", "btr"];
const LABEL_KEYS = [
  "idle",
  "live",
  "paused",
  "intermission",
  "encore",
  "curtain",
  "setMain",
  "setEncore",
  "setlistTitle",
  "artTag",
  "emptyTitle",
  "emptySub",
  "loading",
  "loadFail",
  "trackChange",
  "finished",
  "intermissionTip",
];

test("每包话术表齐全，四幕名为四个非空词", () => {
  for (const p of PALETTES) {
    const s = stageCopy(p);
    for (const k of LABEL_KEYS) {
      assert.equal(typeof s[k], "string", `${p}.${k} 不是字符串`);
      assert.ok(s[k].trim().length > 0, `${p}.${k} 是空的`);
    }
    assert.equal(s.actNames.length, 4, `${p}.actNames 应恰好四幕`);
    assert.ok(s.actNames.every((n) => typeof n === "string" && n.trim()), `${p}.actNames 有空词`);
    assert.ok(s.remain(12).includes("12"), `${p}.remain 没把分钟数带出来`);
  }
});

test("三包说自己的话：状态行/演出单抬头/首幕名互不相同", () => {
  const mygo = stageCopy("mygo");
  const gbc = stageCopy("gbc");
  const btr = stageCopy("btr");
  assert.notEqual(mygo.live, gbc.live);
  assert.notEqual(gbc.live, btr.live);
  assert.notEqual(mygo.setlistTitle, gbc.setlistTitle);
  assert.notEqual(mygo.actNames[0], gbc.actNames[0]);
  assert.notEqual(gbc.artTag, btr.artTag);
});

test("未登记 palette 回落基座，不会把 undefined 送进界面", () => {
  assert.equal(stageCopy("nope").live, stageCopy("default").live);
  assert.equal(packCopy("nope").stage.curtain, stageCopy("default").curtain);
});
