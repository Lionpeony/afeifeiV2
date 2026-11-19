import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, STAGE_TOKEN_KEYS, assertPresetComplete } from "../dist-test/stage-presets.mjs";
import { GLOBAL_TOKEN_KEYS } from "../dist-test/global-theme.mjs";

/**
 * A-10 判据「播放页样式与主题独立」的守门测试。
 *
 * 这类判据最容易在重构里悄悄破掉：谁把 `var(--stage-fg)` 写回 `var(--fg)`，
 * 界面在日间毫无异常，只有切夜间才露馅 —— 所以用源码扫描把它钉住，而不是靠肉眼。
 */

const readSrc = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");

/** 结构层 ① + 材质层 ③ 的变量名：播放页一律不许直接读。 */
const FORBIDDEN = [
  "--bg",
  "--bg-raised",
  "--fg",
  "--fg-dim",
  "--line",
  "--line-soft",
  "--accent",
  "--accent-ink",
  "--glass-bg",
  "--glass-border",
  "--glass-shadow",
  "--row-hover",
  "--mask",
];

const STAGE_DIR = "../src/renderer/ui/views/stage/";

/* views/stage 的 stage.css / stage-panels.css 已随死样式层删除（2026-11-20）：
   原「stage 样式只用场景层变量」与「stage-scope 块」两条守门测试随之移除。 */

test("stage 组件内联样式也不许碰结构层", () => {
  const src = readSrc(`${STAGE_DIR}index.tsx`);
  for (const name of FORBIDDEN) {
    assert.ok(!src.includes(`var(${name})`), `stage/index.tsx 里出现 var(${name})`);
  }
});

test("v4.2 亮暗双档：亮色「排练室」是默认，暗色只覆盖颜色，场景层默认值暂不动", () => {
  const css = readSrc("../src/renderer/ui/tokens.css");
  assert.ok(/:root\s*\{[\s\S]*?--bg-base:\s*#FFF8F5/.test(css), "亮色「排练室」应是默认档");
  const dark = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
  assert.ok(dark, "缺暗色「排练室熄灯」块");
  assert.ok(/--bg-base:\s*#2A2438/.test(dark[1]), "暗色底色不对");
  // 暗色块只覆盖颜色/阴影：出现布局、字号、动效就是写错了层
  assert.ok(
    !/--space-|--fs-|--lh-|--dur-|--ease-|--nav-w|--console-h/.test(dark[1]),
    "暗色块混入了布局/字号/动效 token",
  );
  /* 场景层已随整站还原接入新设计：默认值指向莓粉，不再保留旧版橙红。 */
  assert.ok(/--stage-accent:\s*var\(--pink-600\)/.test(css), "场景层默认值应指向新设计的莓粉");
});

test("tokens.css 的场景层声明与 STAGE_TOKEN_KEYS 双向对账（不漏、不多）", () => {
  const css = readSrc("../src/renderer/ui/tokens.css");
  const declared = new Set([...css.matchAll(/^\s*(--stage-[a-z0-9-]+):/gm)].map((m) => m[1]));
  for (const key of STAGE_TOKEN_KEYS) {
    assert.ok(declared.has(key), `tokens.css 缺 ${key} 的默认值（预设漏键时会变成空值）`);
  }
  for (const key of declared) {
    assert.ok(STAGE_TOKEN_KEYS.includes(key), `tokens.css 有未登记的 ${key}：主题包导不进来`);
  }
});

test("全局配色包白名单不许混入场景层（B-9 守门）", () => {
  // 全局配色包只能覆盖结构层；场景层（播放页）永远走自己的预设与主题包
  for (const key of GLOBAL_TOKEN_KEYS) {
    assert.ok(!key.startsWith("--stage-"), `全局配色包白名单混入 ${key}`);
  }
});

test("四套预设本身不含结构层引用，且 token 齐全", () => {
  for (const p of PRESETS) {
    assertPresetComplete(p);
    for (const [key, value] of Object.entries(p.tokens)) {
      for (const name of FORBIDDEN) {
        assert.ok(!String(value).includes(`var(${name})`), `预设 ${p.id} 的 ${key} 引用了 ${name}`);
      }
    }
  }
});

test("窗控三键读「当前可见页面」的色：场景层 → 控制室 → 结构层，三层都要在", () => {
  const src = readSrc("../src/renderer/ui/bootstrap.ts");
  const at = src.indexOf("function syncWindowOverlay");
  assert.ok(at > 0, "找不到 syncWindowOverlay");
  const body = src.slice(at, src.indexOf("\n}", at));
  assert.ok(body.includes('".stage"'), "syncWindowOverlay 不看 .stage：播放页恒深色，右上角会留一块白");
  assert.ok(
    body.includes('".shell.live"'),
    "syncWindowOverlay 不看 .shell.live：壳把 --bg 重映射成 --live-bg，三键会比眼前的底亮一档",
  );
  assert.ok(body.includes("--stage"), "syncWindowOverlay 没读场景层");
  assert.ok(body.includes("--live"), "syncWindowOverlay 没读控制室（--live-bg / --live-fg）");
});
