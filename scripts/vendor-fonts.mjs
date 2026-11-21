#!/usr/bin/env node
/**
 * 下载 v4.2 设计系统需要的开源字体到本地（CSP 'self'，离线可用）。
 *
 * 跑法：node scripts/vendor-fonts.mjs
 * 产物：src/renderer/ui/fonts/<family>-<n>.woff2 + src/renderer/ui/fonts-v42.css
 *
 * 只从 Google Fonts 取 @font-face 的 unicode-range 子集，与仓库既有的
 * Noto Serif SC 做法一致；生成文件不手工改，重跑即可更新。
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "src/renderer/ui/fonts";
const CSS_OUT = "src/renderer/ui/fonts-v42.css";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const FAMILIES = [
  { slug: "zcool-xiaowei", url: "https://fonts.googleapis.com/css2?family=ZCOOL+XiaoWei&display=swap" },
  { slug: "zcool-kuaile", url: "https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap" },
  {
    slug: "jetbrains-mono",
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap",
  },
  // 番剧主题包（docs/30 §31）：MyGO 正文/标题、BTR 正文，Instrument Serif 为 BTR 标题拉丁字
  { slug: "noto-serif-sc", url: "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500&display=swap" },
  {
    slug: "instrument-serif",
    url: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap",
  },
  { slug: "manrope", url: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&display=swap" },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

let cssOut = `/* 自动生成：node scripts/vendor-fonts.mjs。不要手改。\n   来源：Google Fonts（OFL），仅本地 @font-face 子集。 */\n\n`;

for (const family of FAMILIES) {
  const res = await fetch(family.url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${family.slug}: HTTP ${res.status}`);
  const css = await res.text();

  const blocks = [...css.matchAll(/@font-face\s*\{[\s\S]*?\}/g)].map((m) => m[0]);
  let index = 0;
  for (const block of blocks) {
    const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)/);
    if (!urlMatch) continue;
    index += 1;
    const fileName = `${family.slug}-${index}.woff2`;
    const bin = await fetch(urlMatch[1], { headers: { "User-Agent": UA } });
    if (!bin.ok) throw new Error(`${family.slug}-${index}: HTTP ${bin.status}`);
    fs.writeFileSync(path.join(OUT_DIR, fileName), Buffer.from(await bin.arrayBuffer()));
    cssOut += block.replace(urlMatch[1], `./fonts/${fileName}`) + "\n\n";
  }
  console.log(`${family.slug}: ${index} subsets`);
}

fs.writeFileSync(CSS_OUT, cssOut);
console.log(`fonts -> ${OUT_DIR}, css -> ${CSS_OUT}`);
