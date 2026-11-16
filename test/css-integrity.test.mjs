import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

/**
 * CSS 结构体检。
 *
 * 2026-11-16 发现：`app.css` 多了一个 `}`，浏览器照常渲染，但 `@layer legacy {`
 * 在 7KB 处就被这个多余的右括号提前关闭，后面所有旧样式变成「未分层」，
 * 直接压过新的 v4.2 规则（榜单卡片的渐变、冠军台柱的布局全部失效，
 * 但截图里只是"看起来旧"，没有报错）。这类问题必须用判据钉住。
 */

const ROOT = fileURLToPath(new URL("../src/renderer/ui/", import.meta.url));

const LEGACY = [
  "app.css",
  "player.css",
  "views/pages.css",
  "views/sheets.css",
  "views/stage/stage.css",
  "views/stage/stage-skins.css",
  "views/stage/stage-panels.css",
  "live/live.css",
  "live/night-signal.css",
  "views/redesign.css",
  "views/2026.css",
  "fx/fx.css",
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

test("旧样式每个文件花括号平衡：多一个 } 会提前关闭 @layer legacy", () => {
  for (const file of LEGACY) {
    assert.equal(braceBalance(read(file)), 0, `${file} 花括号不平衡：@layer legacy 会被提前关闭`);
  }
});

test("build.mjs 把旧覆盖层整体包进 @layer legacy", () => {
  const build = fs.readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.ok(build.includes("@layer legacy {"), "build.mjs 没有 @layer legacy 包装");
  assert.ok(build.includes("${legacyCss}"), "build.mjs 没把 legacyCss 放进 @layer");
  for (const file of LEGACY) {
    assert.ok(build.includes(`src/renderer/ui/${file}`), `build.mjs 漏了 ${file}`);
  }
});

test("v4.2 新增样式按页/组件拆分，单文件不超过 400 行", () => {
  const dir = path.join(ROOT, "v42");
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".css"))) {
    const src = fs.readFileSync(path.join(dir, name), "utf8");
    const lines = src.split("\n").length;
    assert.ok(lines <= 400, `v42/${name} ${lines} 行：拆成更小的一份，别让它承担两件事`);
    assert.ok(!/font-size:\s*\d/.test(src), `v42/${name} 有裸字号：只准用 --fs-* token`);
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(src), `v42/${name} 有裸 hex：颜色只准来自 tokens.css`);
  }
});
