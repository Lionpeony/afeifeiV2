/* 把 js/*.jsx 预编译成 js/compiled/*.js（普通脚本，file:// 可直接加载）。
   改过 jsx 后跑一次 npm run build；未安装 esbuild 时自动复用 afeifei-v2 里的副本。 */
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

let esbuild;
try {
  esbuild = await import("esbuild");
} catch {
  const fallback = process.env.ESBUILD_PATH || "F:/AI/afeifei-v2/node_modules/esbuild/lib/main.js";
  const mod = await import(pathToFileURL(fallback));
  esbuild = mod.build ? mod : mod.default;
}

const entries = (await readdir("js")).filter((f) => f.endsWith(".jsx")).map((f) => `js/${f}`);
await esbuild.build({
  entryPoints: entries,
  outdir: "js/compiled",
  loader: { ".jsx": "jsx" },
  target: "es2020",
  logLevel: "info",
});
