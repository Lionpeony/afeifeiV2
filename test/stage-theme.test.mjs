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

/** 剪掉唯一允许的重映射块（结构层 → 场景层）。 */
function stripScope(css) {
  return css.replace(/\/\* stage-scope:begin \*\/[\s\S]*?\/\* stage-scope:end \*\//, "");
}

const STAGE_FILES = [
  "../src/renderer/ui/views/stage/stage.css",
  "../src/renderer/ui/views/stage/stage-queue.css",
  "../src/renderer/ui/views/stage/stage-panels.css",
];

test("stage 样式（拆分后的每个文件）只用场景层变量（剪掉 stage-scope 块后不得出现结构层/材质层）", () => {
  for (const file of STAGE_FILES) {
    const css = stripScope(readSrc(file));
    for (const name of FORBIDDEN) {
      assert.ok(!css.includes(`var(${name})`), `${file.slice(file.indexOf("stage/") + 6)} 直接读了 ${name}：切夜间会把播放页一起翻黑`);
    }
  }
});

test("stage 组件内联样式也不许碰结构层", () => {
  const src = readSrc(`${STAGE_DIR}index.tsx`);
  for (const name of FORBIDDEN) {
    assert.ok(!src.includes(`var(${name})`), `stage/index.tsx 里出现 var(${name})`);
  }
});

test("stage-scope 块存在且把 8 个结构层变量指向场景层（嵌套组件靠它拿纸面色）", () => {
  const css = readSrc(`${STAGE_DIR}stage.css`);
  const block = css.match(/\/\* stage-scope:begin \*\/([\s\S]*?)\/\* stage-scope:end \*\//);
  assert.ok(block, "找不到 stage-scope 块：PageHead 的朱砂句号会跟着主题变");
  for (const pair of [
    ["--bg", "--stage-bg"],
    ["--fg", "--stage-fg"],
    ["--fg-dim", "--stage-fg-dim"],
    ["--line", "--stage-line"],
    ["--line-soft", "--stage-line-soft"],
    ["--accent", "--stage-accent"],
  ]) {
    assert.ok(
      block[1].includes(`${pair[0]}: var(${pair[1]})`),
      `stage-scope 缺 ${pair[0]} → ${pair[1]} 的重映射`,
    );
  }
});

test("tokens.css 的夜间块不许改场景层（改了就说明播放页还在跟主题）", () => {
  const css = readSrc("../src/renderer/ui/tokens.css");
  const at = css.indexOf(':root[data-theme="dark"]');
  assert.ok(at > 0, "找不到夜间块");
  const dark = css.slice(at);
  assert.ok(!/--stage-[a-z-]+:/.test(dark), "夜间块里出现了 --stage-* 覆盖");
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

test("四档全局配色块都不许改场景层（B-9 新增 sepia/forest 后的守门）", () => {
  const css = readSrc("../src/renderer/ui/tokens.css");
  const blocks = css.match(/:root\[data-theme="[^"]+"\]\s*\{[\s\S]*?\}/g) ?? [];
  assert.equal(blocks.length, 3, "应有 dark / sepia / forest 三个主题块");
  for (const block of blocks) {
    assert.ok(!/--stage-[a-z-]+:/.test(block), `主题块改了场景层：${block.slice(0, 40)}`);
  }
  // 全局配色包的白名单也不能漏进场景层
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
