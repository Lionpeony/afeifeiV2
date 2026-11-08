import { test } from "node:test";
import assert from "node:assert/strict";
import { isTheme, rgbToHex } from "../dist-test/ui-theme.mjs";
import {
  GLOBAL_TOKEN_KEYS,
  getGlobalTokens,
  globalThemeFile,
  sanitizeGlobalTokens,
  setGlobalTokens,
  subscribeGlobalTokens,
} from "../dist-test/global-theme.mjs";

/* ---- 全局配色（B-9）：四档预设 + 白名单净化 ---- */

test("四档主题：旧值 light/dark 仍合法，未知值拒绝", () => {
  for (const id of ["light", "dark", "sepia", "forest"]) assert.equal(isTheme(id), true);
  for (const id of ["custom", "", 1, null]) assert.equal(isTheme(id), false);
});

test("rgbToHex：三键只收 #rrggbb，rgb()/rgba() 归一化成六位色", () => {
  assert.equal(rgbToHex("rgb(10, 14, 19)"), "#0a0e13");
  assert.equal(rgbToHex("rgba(242, 238, 230, 0.6)"), "#f2eee6");
  // 小数通道（0.5 通道值）按四舍五入落整
  assert.equal(rgbToHex("rgb(10.6, 13.4, 19.5)"), "#0b0d14");
  // 解析不了就不猜：调用方跳过这次同步，别把乱码喂给 Electron
  assert.equal(rgbToHex("oklch(0.3 0.02 250)"), null);
  assert.equal(rgbToHex("transparent"), null);
  assert.equal(rgbToHex(""), null);
});

test("GLOBAL_TOKEN_KEYS 只含结构层/材质层，绝不含 --stage-*", () => {
  assert.equal(GLOBAL_TOKEN_KEYS.some((k) => k.startsWith("--stage-")), false);
  assert.ok(GLOBAL_TOKEN_KEYS.includes("--bg"));
  assert.ok(GLOBAL_TOKEN_KEYS.includes("--accent"));
});

test("sanitizeGlobalTokens：hex / rgba / 关键字 / 小数都收", () => {
  const got = sanitizeGlobalTokens({
    tokens: { "--bg": "#101a17", "--fg": "rgb(1, 2, 3)", "--grain-blend": "soft-light", "--grain-opacity": "0.05" },
  });
  assert.deepEqual(got, {
    "--bg": "#101a17",
    "--fg": "rgb(1, 2, 3)",
    "--grain-blend": "soft-light",
    "--grain-opacity": "0.05",
  });
});

test("sanitizeGlobalTokens：白名单外的 key / 危险值 / 坏类型一律丢", () => {
  const got = sanitizeGlobalTokens({
    tokens: {
      "--stage-bg": "#000000",
      "--font-sans": "evil",
      "--bg": "url(https://x/a.png)",
      "--fg": "red; } body { display:none }",
      "--accent": 42,
      "--line": "rgba(0,0,0,.3)",
    },
  });
  assert.deepEqual(got, { "--line": "rgba(0,0,0,.3)" });
});

test("sanitizeGlobalTokens：空集 / 坏形状返回 null（播放页的包导不进来）", () => {
  assert.equal(sanitizeGlobalTokens(null), null);
  assert.equal(sanitizeGlobalTokens([]), null);
  assert.equal(sanitizeGlobalTokens({ tokens: { "--stage-bg": "#fff" } }), null);
  assert.equal(sanitizeGlobalTokens({ tokens: { "--bg": "   " } }), null);
});

test("globalThemeFile 带 scope=global，导入处靠它拒绝播放页主题包", () => {
  const tokens = { "--bg": "#101a17" };
  assert.deepEqual(globalThemeFile(tokens), {
    name: "阿飞飞全局配色",
    version: 1,
    scope: "global",
    tokens,
  });
});

test("setGlobalTokens：可订阅、可清除（node 环境跳过 DOM 应用）", () => {
  let calls = 0;
  const stop = subscribeGlobalTokens(() => {
    calls += 1;
  });
  setGlobalTokens({ "--bg": "#abcdef" });
  assert.equal(getGlobalTokens()["--bg"], "#abcdef");
  setGlobalTokens(null);
  assert.equal(getGlobalTokens(), null);
  assert.equal(calls, 2);
  stop();
});
