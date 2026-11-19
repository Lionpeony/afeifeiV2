import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * v4.2 token 契约：必需键、亮/暗对比度、字号与布局尺寸。
 *
 * 设计系统把「品牌粉」和「交互粉」分开：`--brand-pink-400` 只做装饰，
 * 白字对比度不到 3:1；任何文字/图标交互面必须用 `--brand-pink-600`（≥4.5:1）。
 * 这里实算对比度，避免有人把 400 接回 `--accent`（视觉上很像，可读性会掉）。
 */

const css = fs.readFileSync(new URL("../src/renderer/ui/tokens.css", import.meta.url), "utf8");

function block(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  assert.ok(m, `找不到 ${selector} 块`);
  return m[1];
}

const root = block(":root");
const dark = block(':root[data-theme="dark"]');

function raw(name, scope) {
  const m = new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(scope);
  if (m) return m[1].trim();
  if (scope !== root) return raw(name, root);
  return null;
}

/** 顺着 var() 解析成最终值；只支持本文件里用到的 token 引用。 */
function color(name, scope = root, depth = 0) {
  const value = raw(name, scope);
  assert.ok(value, `缺 token ${name}`);
  const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value);
  if (!ref) return value;
  assert.ok(depth < 8, `${name} 的 var() 引用链过深`);
  return color(ref[1], scope, depth + 1);
}

function rgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  assert.ok(m, `只接受六位 hex，拿到 ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("必需 token 齐全：表面 / 文字 / 品牌 / 语义 / 字阶 / 间距 / 布局", () => {
  const required = [
    "--bg-base",
    "--bg-sub",
    "--bg-card",
    "--text-primary",
    "--text-secondary",
    "--brand-pink-400",
    "--brand-pink-600",
    "--brand-pink-700",
    "--accent",
    "--accent-hover",
    "--accent-press",
    "--accent-text",
    "--on-accent",
    "--on-gradient",
    "--scrim",
    "--font-display",
    "--font-body",
    "--font-hand",
    "--font-mono",
    "--fs-display",
    "--fs-title",
    "--fs-heading",
    "--fs-body",
    "--fs-caption",
    "--fs-micro",
    "--space-1",
    "--space-2",
    "--space-3",
    "--space-4",
    "--radius-card",
    "--radius-btn",
    "--radius-cover",
    "--nav-w",
    "--topbar-h",
    "--console-h",
    "--ease-out-soft",
    "--ease-spring",
    "--ease-curtain",
    "--dur-tap",
    "--dur-fast",
    "--dur-base",
    "--dur-curtain",
    "--dur-ambient",
  ];
  for (const name of required) assert.ok(raw(name, root), `tokens.css 缺 ${name}`);
});

test("亮色「排练室」正文对比度 ≥ 4.5:1（primary / secondary）", () => {
  const bg = color("--bg-base");
  assert.ok(contrast(color("--text-primary"), bg) >= 4.5, "正文主色在白底上不到 4.5:1");
  assert.ok(contrast(color("--text-secondary"), bg) >= 4.5, "正文次色在白底上不到 4.5:1");
});

test("品牌粉 400 只做装饰：白字 < 3:1；交互粉 600 白字 ≥ 4.5:1", () => {
  assert.ok(
    contrast(color("--brand-pink-400"), "#FFFFFF") < 3,
    "pink-400 突然够对比度了？先复核 design.md 再放宽这条",
  );
  assert.ok(contrast(color("--brand-pink-600"), "#FFFFFF") >= 4.49, "pink-600 白字不到 4.5:1");
  assert.equal(color("--accent").toLowerCase(), color("--brand-pink-600").toLowerCase(), "--accent 必须指向交互粉 600");
});

test("暗色「熄灯」正文与按钮对比度 ≥ 4.5:1", () => {
  const bg = color("--bg-base", dark);
  assert.ok(contrast(color("--text-primary", dark), bg) >= 4.5, "暗色正文主色不到 4.5:1");
  assert.ok(contrast(color("--text-secondary", dark), bg) >= 4.5, "暗色正文次色不到 4.5:1");
  // 暗色实心粉底 + 白字不达标，语义层把 on-accent 换成深底色（描边按钮）
  assert.ok(
    contrast(color("--on-accent", dark), color("--accent", dark)) >= 4.5,
    "暗色按钮文字与底色不到 4.5:1",
  );
});

/* 元信息三级文字（--text-3）也承担可读性（时间戳、歌手行、meta）。
   2026-11-20 审计：暗色基座 3.8:1、mygo 亮 4.48 / 暗 3.79、gbc 暗 4.29、btr 亮 4.42，
   全部提亮到卡面 ≥4.5:1；这条守住不回退。 */
test("元信息文字（--text-3）基座与三只包、亮暗各档卡面上 ≥ 4.5:1", () => {
  const cases = [
    ["基座亮色", root],
    ["基座暗色", dark],
    ["mygo 亮色", block(':root[data-palette="mygo"]')],
    ["mygo 暗色", block(':root[data-theme="dark"][data-palette="mygo"]')],
    ["gbc 亮色", block(':root[data-palette="gbc"]')],
    ["gbc 暗色", block(':root[data-theme="dark"][data-palette="gbc"]')],
    ["btr 亮色", block(':root[data-palette="btr"]')],
    ["btr 暗色", block(':root[data-theme="dark"][data-palette="btr"]')],
  ];
  for (const [label, scope] of cases) {
    const bg = color("--card", scope);
    assert.ok(contrast(color("--text-3", scope), bg) >= 4.5, `${label} 的 --text-3 对卡面不到 4.5:1`);
  }
});

test("布局与字阶是规范值：200 / 60 / 72、8-16-24-32、16/999/4", () => {
  assert.equal(raw("--nav-w", root), "200px");
  assert.equal(raw("--topbar-h", root), "60px");
  assert.equal(raw("--console-h", root), "72px");
  assert.deepEqual([1, 2, 3, 4].map((n) => raw(`--space-${n}`, root)), ["8px", "16px", "24px", "32px"]);
  assert.equal(raw("--radius-card", root), "16px");
  assert.equal(raw("--radius-btn", root), "999px");
  assert.equal(raw("--radius-cover", root), "4px");
  assert.deepEqual(
    ["display", "title", "heading", "body", "caption", "micro"].map((n) => raw(`--fs-${n}`, root)),
    ["28px", "20px", "16px", "14px", "12px", "11px"],
  );
});
