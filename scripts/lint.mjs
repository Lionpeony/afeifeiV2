#!/usr/bin/env node
/**
 * 六条规则（51 §2.4）。退出码 0 通过，1 有违规。
 * 规则 3/4/5 一律按「文件」判，不按「出现次数」判 —— 计数在递归/循环里必然对不上。
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "src";
const LAYERS = ["kernel", "domain", "capability", "projection", "ui"];
const AUDIO_GRAPH = "src/renderer/capability/audio/graph.ts";
const COMPOSITOR = "src/renderer/ui/compositor.ts";
/* 规则 5 白名单：tokens.css 是唯一色值事实源；theme/presets 与 af 的 art/Local 是
   生成式占位色板数据表（2026-11-20 收敛后仅剩这两处 tsx 例外，组件颜色一律走 token）。 */
const HEX_WHITELIST = [
  "src/renderer/ui/tokens.css",
  "src/renderer/ui/theme/presets/",
  "src/renderer/ui/af/art.tsx",
  "src/renderer/ui/af/pages/Local.tsx",
];

const problems = [];
const fail = (msg) => problems.push(msg);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 统一成「相对项目根」的 posix 路径：walk 给的是相对路径，resolveLocal 给的是绝对路径，
// 只做 split(sep) 的话两者对不上，规则 1 会静默失效。
const ROOT = process.cwd();
const norm = (f) => path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join("/");
const read = (f) => fs.readFileSync(f, "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function importsOf(src) {
  const out = new Set();
  for (const m of src.matchAll(/\bfrom\s*["']([^"']+)["']/g)) out.add(m[1]);
  for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.add(m[1]);
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']\s*;?$/gm)) out.add(m[1]);
  return [...out];
}

const layerOf = (file) => {
  const m = norm(file).match(/^src\/renderer\/([^/]+)\//);
  const idx = m ? LAYERS.indexOf(m[1]) : -1;
  return idx < 0 ? null : { name: m[1], idx };
};

function resolveLocal(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  const stem = base.replace(/\.(js|ts|tsx)$/, "");
  const candidates = [base, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`, `${stem}/index.tsx`];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

const code = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

/* ---------- 规则 1：环依赖 + 出站口 ---------- */
for (const file of code) {
  const src = stripComments(read(file));
  const me = layerOf(file);
  for (const spec of importsOf(src)) {
    const bare = !spec.startsWith(".");

    if (bare) {
      if (!me) continue; // main/ preload/ 是环境与端口，本来就该 import electron
      if ((spec === "react" || spec === "react-dom" || spec === "react/jsx-runtime") && me.name !== "ui") {
        fail(`${norm(file)}: ${me.name} 层不许 import "${spec}"（只有 ui/ 能碰 React）`);
      }
      if (spec === "electron") {
        fail(`${norm(file)}: 环 0–4 不许 import "electron"，出站只能走 contracts + preload`);
      }
      continue;
    }

    const target = resolveLocal(file, spec);
    if (!target) continue;
    const to = layerOf(target);
    if (!me || !to || me.name === to.name) continue;

    if (to.idx > me.idx) {
      fail(`${norm(file)}: 禁止 ${me.name} → ${to.name}（"${spec}"），依赖只能向内`);
    }
    if (me.name === "ui" && norm(target).endsWith("kernel/store.ts")) {
      fail(`${norm(file)}: ui 只准 import kernel/index.js，不许直接碰写入口 store.ts`);
    }
  }
  if (me && /\bipcRenderer\b/.test(src)) {
    fail(`${norm(file)}: 环内不许出现 ipcRenderer`);
  }
}

/* ---------- 规则 2：音频图唯一 ---------- */
const ctxHits = [];
for (const file of code) {
  const n = (stripComments(read(file)).match(/new\s+AudioContext\s*\(/g) ?? []).length;
  if (n > 0) ctxHits.push({ file: norm(file), n });
}
const ctxTotal = ctxHits.reduce((a, b) => a + b.n, 0);
if (ctxTotal > 1) {
  fail(`new AudioContext 出现 ${ctxTotal} 处，只允许 1 处：${ctxHits.map((h) => h.file).join(", ")}`);
} else if (ctxTotal === 1 && ctxHits[0].file !== AUDIO_GRAPH) {
  fail(`new AudioContext 只能在 ${AUDIO_GRAPH}，实际在 ${ctxHits[0].file}（I3）`);
}

/* ---------- 规则 3：时间唯一 ---------- */

for (const file of code) {
  const me = layerOf(file);
  if (!me || (me.name !== "ui" && me.name !== "projection")) continue;
  const src = stripComments(read(file));
  if (/\baudio\s*\.\s*currentTime\b/.test(src)) {
    fail(`${norm(file)}: ${me.name} 层不许读 audio.currentTime，时间只能来自 kernel/clock（I1）`);
  }
  if (/\bsetInterval\s*\(/.test(src)) {
    fail(`${norm(file)}: ${me.name} 层不许用 setInterval 驱动界面，用合成器的 t（I1）`);
  }
}

/* ---------- 规则 4：rAF 唯一 ---------- */
for (const file of code) {
  if (norm(file) === COMPOSITOR) continue;
  if (/\brequestAnimationFrame\s*\(/.test(stripComments(read(file)))) {
    fail(`${norm(file)}: requestAnimationFrame 只准出现在 ${COMPOSITOR}（50 §9.1）`);
  }
}

/* ---------- 规则 5：hex 白名单 ---------- */
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const styled = walk(SRC).filter((f) => /\.(css|tsx)$/.test(f));
for (const file of styled) {
  const n = norm(file);
  if (HEX_WHITELIST.some((w) => n.startsWith(w))) continue;
  const hits = stripComments(read(file)).match(HEX);
  if (hits) fail(`${n}: 裸色值 ${[...new Set(hits)].join(" ")}，颜色只能走 token（50 §9.3）`);
}

/* ---------- 规则 6：主进程无业务 ---------- */
const mainFiles = walk(path.join(SRC, "main")).filter((f) => /\.(ts|tsx)$/.test(f));
const BIZ = /\b(library|playlist|dedupe)\b/;
/** 去掉字符串字面量再判：文件名 "library.json" 不是业务判断，`function loadLibrary` 才是。 */
const stripStrings = (s) => s.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
for (const file of mainFiles) {
  const n = norm(file);
  const src = stripStrings(stripComments(read(file)));
  for (const spec of importsOf(src)) {
    // 按解析后的真实路径判，不按字符串里有没有 "renderer"（目录名可能合法地叫别的）
    const target = spec.startsWith(".") ? resolveLocal(file, spec) : null;
    if (target && norm(target).startsWith("src/renderer/")) {
      fail(`${n}: main 不许 import 环 4（"${spec}" → ${norm(target)}）`);
    }
  }
  if (BIZ.test(src)) fail(`${n}: 主进程里出现业务标识符（${src.match(BIZ)?.join(", ")}），业务属于环 1`);
  // 400 行文件上限已解除（2026-11-03 用户决定）：按域拆分仍是习惯，但不再做门禁。
}

/* ---------- 规则 7：z-index 全集 + !important 零容忍（00 §9.2/§9.3，gate: 2026-11-03） ----------
   旧仓库层走 0-60 八档白名单；af 层（2026-11-20 起）只准引用 tokens.css 的 --z-* 层序刻度，
   不许再写裸数值 —— 层序是设计系统事实源，不是各文件自留地。 */
const ALLOWED_Z = new Set([0, 1, 2, 3, 4, 20, 40, 50, 60]);
for (const file of styled) {
  const n = norm(file);
  const src = stripComments(read(file)); // 跳过注释——注释里提到这些词不算违规（2026-11-03 审计教训）
  if (n.includes("/ui/af/")) {
    for (const m of src.matchAll(/z-index:\s*([^;}]+)/g)) {
      if (!m[1].includes("var(--z-")) {
        fail(`${n}: z-index ${m[1].trim()} 不在 --z-* 层序刻度上（af 层只准引用 tokens.css 的 --z-*）`);
      }
    }
    continue;
  }
  for (const m of src.matchAll(/z-index:\s*(-?\d+)/g)) {
    if (!ALLOWED_Z.has(Number(m[1]))) {
      fail(`${n}: z-index ${m[1]} 不在全局层序（0 1 2 3 4 20 40 50 60，00 §9.2）`);
    }
  }
  if (/!important/.test(src)) {
    fail(`${n}: 出现 !important（00 §9.3 通用禁令：组件里 0 个）`);
  }
}

/* ---------- 规则 8：af 层字号只取阶梯（2026-11-21 二次收敛） ----------
   阶梯 = 10/12/14/16/18/20/22/26/30/36/44（+128 数字展示）。低端原 10-16 七档相邻 1px 已收成四档。
   字号声明只准是：阶梯 px、var(--fs-*)、calc()/clamp()。小数档与越阶值一律打回。 */
const AF_LADDER = new Set(["10", "12", "14", "16", "18", "20", "22", "26", "30", "36", "44", "128"]);
for (const file of styled) {
  const n = norm(file);
  if (!n.includes("/ui/af/")) continue;
  const src = stripComments(read(file));
  for (const m of src.matchAll(/font-size:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    const px = v.match(/^(\d+(?:\.\d+)?)px$/);
    const ok = (px && AF_LADDER.has(px[1])) || v.startsWith("var(--fs-") || v.startsWith("calc(") || v.startsWith("clamp(");
    if (!ok) fail(`${n}: font-size ${v} 不在阶梯上（10/12/14/16/18/20/22/26/30/36/44 + 128，或 var(--fs-*)）`);
  }
}

/* ---------- 规则 8（原「舞台字号阶梯」）已随 views/stage 死样式层删除（2026-11-20） ---------- */

/* ---------- 规则 9：源文件禁止 UTF-8 BOM（2026-11-19 事故复盘，docs/30 §11） ----------
   PowerShell 5.1 的 Set-Content -Encoding UTF8 会写 BOM；build.mjs 拼接 css 时
   文件中部的 U+FEFF 会吞掉下一条规则（shell.css 的 .app{display:grid} 曾被整条吃掉）。
   docs/ 一并扫：30 号文档自己也中过招。 */
const bomTargets = [...walk(SRC), ...walk("docs").map((f) => f)].filter((f) => /\.(css|ts|tsx|html|json|md)$/.test(f));
for (const file of bomTargets) {
  const head = fs.readFileSync(file).subarray(0, 3);
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
    fail(`${norm(file)}: 文件头带 UTF-8 BOM（批量改文件禁用 Set-Content -Encoding UTF8）`);
  }
}

/* ---------- 规则 10：af 层圆角只取刻度（2026-11-21 收敛） ----------
   只准：var(--r-*) / var(--radius-*)，以及 0 / 50% / inherit。
   原有 21 种裸 px 圆角（1-14 每个整数）已收成 7 档。 */
const RADIUS_OK = /^(0|50%|inherit)$|var\(--(r-|radius-)/;
for (const file of styled) {
  const n = norm(file);
  if (!n.includes("/ui/af/")) continue;
  const src = stripComments(read(file));
  for (const m of src.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    const comps = v.split(/\s+/);
    if (!comps.every((c) => RADIUS_OK.test(c))) {
      fail(`${n}: border-radius ${v} 不在刻度上（--r-* / --radius-* / 0 / 50%）`);
    }
  }
}

/* ---------- 规则 11：af 层间距只取 4px 刻度（2026-11-21 收敛） ----------
   只准：var(--space-*)、0、1px、3px、>48px 版式值、auto/%/calc/clamp。
   含显式 height 的块不查（垂直 padding 为保内容不裁切而保留原值）。 */
for (const file of styled) {
  const n = norm(file);
  if (!n.includes("/ui/af/")) continue;
  const src = stripComments(read(file));
  for (const blk of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/(?:^|[;{\s])height\s*:/.test(blk[2])) continue;
    for (const m of blk[2].matchAll(/(padding|margin|gap|row-gap|column-gap)(-top|-right|-bottom|-left)?\s*:\s*([^;}]+)/g)) {
      for (const c of m[3].trim().split(/\s+/)) {
        if (!/^-?\d+(\.\d+)?px$/.test(c)) continue;
        const px = Math.abs(parseFloat(c));
        if (px === 0 || px === 1 || px === 3 || px > 48) continue;
        fail(`${n}: ${m[1]}${m[2] || ""} 用了裸 px ${c}（应取 --space-* 刻度）`);
      }
    }
  }
}

/* ---------- 结果 ---------- */
if (problems.length) {
  console.log(`✗ lint 失败 ${problems.length} 处：`);
  for (const p of problems) console.log(`  · ${p}`);
  console.log("\n规则见 docs/51 §2.4（新仓库里的 docs/01）");
  process.exit(1);
}
console.log(`LINT PASS：${code.length} 个源文件，11 条规则无违规`);
