import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

/**
 * CSS 结构体检（v4.2 整站还原后）。
 *
 * 2026-11-17 起视觉层只剩 `tokens.css + af/*`，按 offline_single 原型的顺序拼接。
 * 旧 `@layer legacy` 已整体移除；这里钉住「新层文件存在、顺序正确、花括号平衡」，
 * 防止再出现「多一个 } 让后面样式全部失层」的历史问题。
 */

const ROOT = fileURLToPath(new URL("../src/renderer/ui/", import.meta.url));

const AF = [
  "af/base.css",
  "af/shell.css",
  "af/pages.css",
  "af/player.css",
  "af/eggs.css",
  "af/anime.css",
  "af/v4.css",
  "af/polish.css",
  "af/compat.css",
  "af/account.css",
  "af/studio.css",
  "af/lyrics.css",
  "af/typography.css",
  "af/sidebar.css",
  "af/scene.css",
  "af/splash.css",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** 只数花括号；CSS 里的字符串不含花括号，注释里的花括号也一并计入，宁可保守。 */
function braceBalance(css) {
  let depth = 0;
  for (const ch of css) {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  }
  return depth;
}

test("新视觉层每个文件花括号平衡", () => {
  for (const file of AF) {
    assert.equal(braceBalance(read(file)), 0, `${file} 花括号不平衡`);
  }
});

test("build.mjs 按原型顺序拼接 af/*.css，且不再有 @layer legacy", () => {
  const build = fs.readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.ok(!build.includes("@layer legacy {"), "build.mjs 仍包着 @layer legacy");
  let last = -1;
  for (const file of AF) {
    const at = build.indexOf(`src/renderer/ui/${file}`);
    assert.ok(at > last, `build.mjs 缺少或顺序不对：${file}`);
    last = at;
  }
});

test("tokens.css 同时提供原型变量与规范名别名", () => {
  const tokens = read("tokens.css");
  for (const name of ["--bg", "--card", "--text", "--pink-600", "--bg-base", "--text-primary", "--brand-pink-600"]) {
    assert.ok(tokens.includes(`${name}:`), `tokens.css 缺少 ${name}`);
  }
  for (const palette of ["mygo", "gbc", "btr"]) {
    assert.ok(tokens.includes(`data-palette="${palette}"`), `tokens.css 缺少色板 ${palette}`);
  }
});
