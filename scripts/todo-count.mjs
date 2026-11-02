#!/usr/bin/env node
/** 跨段检查（51 §5）：数 TODO / FIXME / HACK 的处数，只许降。 */
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

let total = 0;
for (const file of walk("src").concat(walk("scripts"))) {
  const hits = fs.readFileSync(file, "utf8").match(/\b(TODO|FIXME|HACK)\b/g);
  if (hits) {
    total += hits.length;
    console.log(`  ${file.split(path.sep).join("/")} × ${hits.length}`);
  }
}
console.log(`TODO 类标记：${total} 处（只许下降）`);
