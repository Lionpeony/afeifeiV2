#!/usr/bin/env node
/* 浅色主题文字对比度实测（WCAG 2.1 对比度公式），docs/30 §19 验收数据。
   跑法：node scripts/_diag-contrast.mjs；退出码 0=全过，1=有 fail。
   阈值：正文(≥12px 一般字号) 4.5:1；大字(≥24px 或 ≥18.66px bold) 3:1。 */
import fs from "node:fs";

const css = fs.readFileSync("src/renderer/ui/tokens.css", "utf8");
/** 取 :root（浅色）块的 var 值 */
const light = css.slice(0, css.indexOf('[data-theme="dark"]'));
const get = (name) => {
  const m = light.match(new RegExp(`^\\s*--${name}:([^;]+);`, "m"));
  if (!m) throw new Error(`token --${name} 未找到`);
  return m[1].trim();
};

/** rgba(x,x,x,a) 叠在底色上的合成色 */
function blend(fg, bg) {
  const parse = (s) => {
    s = s.trim();
    if (s.startsWith("#")) {
      const h = s.slice(1);
      const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) throw new Error(`解析不了颜色: ${s}`);
    const [r, g, b, a = 1] = m[1].split(",").map(Number);
    return [r, g, b, a];
  };
  const [fr, fg2, fb, fa = 1] = parse(fg);
  if (fa >= 1) return [fr, fg2, fb];
  const [br, bg2, bb] = parse(bg);
  return [fr * fa + br * (1 - fa), fg2 * fa + bg2 * (1 - fa), fb * fa + bb * (1 - fa)];
}
const lum = ([r, g, b]) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (fg, bg) => {
  const l1 = lum(blend(fg, bg));
  const l2 = lum(blend(bg, "#ffffff"));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

/* [前景 token, 背景 token, 阈值, 场景说明] */
const CASES = [
  ["text", "bg", 4.5, "正文 / 页面底"],
  ["text", "card", 4.5, "正文 / 卡片"],
  ["text-2", "bg", 4.5, "次级文字（歌手/专辑）/ 页面底"],
  ["text-2", "card", 4.5, "次级文字 / 白卡"],
  ["text-3", "bg", 4.5, "弱文字（时长/序号/eyebrow）/ 页面底"],
  ["text-3", "card", 4.5, "弱文字 / 白卡"],
  ["note-ink", "note-yellow-bg", 4.5, "便签手写体 / 便签纸"],
  ["pink-700", "card", 4.5, "btn-soft 文字 / 白卡"],
  ["pink-700", "bg", 4.5, "链接/红心态文字 / 页面底"],
  ["on-accent", "pink-600", 4.5, "主按钮文字 / 主按钮底"],
  ["coral", "bg", 4.5, "错误/警示文字 / 页面底"],
];

let fail = 0;
for (const [fgv, bgv, min, label] of CASES) {
  const fg = get(fgv);
  const bg = get(bgv);
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (需 ${min}:1)  ${label}  [--${fgv} ${fg} on --${bgv} ${bg}]`);
}
/* 大字档：hero/标题 3:1（只测 40px 档用 text 的场景，浅色必然过，列入留档） */
for (const [fgv, bgv, label] of [["text", "bg", "标题大字 / 页面底"], ["pink-700", "bg", "粉色大字 / 页面底"]]) {
  const r = ratio(get(fgv), get(bgv));
  const ok = r >= 3;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (需 3:1)   ${label}  [--${fgv} on --${bgv}]`);
}
console.log(fail === 0 ? "\n全部通过。" : `\n${fail} 项不达标。`);
process.exit(fail === 0 ? 0 : 1);
