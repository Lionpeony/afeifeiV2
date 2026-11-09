#!/usr/bin/env node
/**
 * esbuild 打包（51 §1.3）。
 *   node scripts/build.mjs          产物 → dist/（main / preload / renderer / css / html）
 *   node scripts/build.mjs --test   产物 → dist-test/kernel.mjs，供 node --test 消费
 *
 * 为什么不用 Vite：单窗口应用不需要 dev server / HMR / 插件生态，多一层就多一个失败点。
 */
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const TEST = process.argv.includes("--test");
const NODE_TARGET = "node20";
const BROWSER_TARGET = "chrome120";

if (TEST) {
  fs.rmSync("dist-test", { recursive: true, force: true });
  await build({
    entryPoints: {
      kernel: "src/renderer/kernel/index.ts",
      queue: "src/renderer/kernel/queue.ts",
      clock: "src/renderer/kernel/clock.ts",
      player: "src/renderer/kernel/player.ts",
      failure: "src/renderer/kernel/failure.ts",
      persist: "src/renderer/kernel/persist.ts",
      schema: "src/renderer/domain/library/schema.ts",
      "index-store": "src/renderer/domain/library/index-store.ts",
      dedupe: "src/renderer/domain/library/dedupe.ts",
      pinyin: "src/renderer/domain/search/pinyin.ts",
      projection: "src/renderer/projection/library.ts",
      cover: "src/renderer/domain/library/cover.ts",
      likes: "src/renderer/domain/likes/index.ts",
  "account-likes": "src/renderer/domain/account-likes/index.ts",
      playlists: "src/renderer/domain/playlists/index.ts",
      history: "src/renderer/domain/history/index.ts",
      "capability-registry": "src/renderer/capability/registry.ts",
      "capability-errors": "src/renderer/capability/errors.ts",
      "capability-demo": "src/renderer/capability/sources/demo/index.ts",
      "capability-netease": "src/renderer/capability/sources/netease/index.ts",
      "capability-qq": "src/renderer/capability/sources/qq/index.ts",
      lyrics: "src/renderer/capability/lyrics/index.ts",
      "lyric-cache": "src/renderer/capability/lyrics/cache.ts",
      "audio-eq": "src/renderer/capability/audio/eq.ts",
      "audio-spectrum-bins": "src/renderer/capability/audio/spectrum-bins.ts",
      "audio-crossfade": "src/renderer/capability/audio/crossfade.ts",
      "audio-engine": "src/renderer/capability/audio/engine.ts",
      "audio-eq-response": "src/renderer/capability/audio/eq-response.ts",
      "library-group": "src/renderer/domain/library/group.ts",
      "library-meta": "src/renderer/domain/library/meta.ts",
      "playlists-online": "src/renderer/domain/playlists/online.ts",
      "lyric-filter": "src/renderer/domain/lyrics/filter.ts",
      "download-naming": "src/renderer/domain/download/naming.ts",
      "download-settings": "src/renderer/domain/download/settings.ts",
      "dislikes": "src/renderer/domain/dislikes/index.ts",
      "listening-log": "src/renderer/domain/listening/log.ts",
      "listening-stats": "src/renderer/projection/stats.ts",
      "ui-theme": "src/renderer/ui/theme.ts",
      "on-air": "src/renderer/ui/live/on-air.ts",
      "global-theme": "src/renderer/ui/global-theme.ts",
      "active-source": "src/renderer/ui/active-source.ts",
      recommend: "src/renderer/domain/recommend/index.ts",
      "recommend-salt": "src/renderer/domain/recommend/salt.ts",
      "roam-card": "src/renderer/domain/recommend/roam-card.ts",
      station: "src/renderer/domain/station/schedule.ts",
      broadcast: "src/renderer/projection/broadcast.ts",
      "room-program": "src/renderer/projection/room-program.ts",
      "lyric-state": "src/renderer/ui/views/stage/lyric-state.ts",
      "stage-tint": "src/renderer/ui/views/stage/tint.ts",
      "stage-presets": "src/renderer/ui/views/stage/presets.ts",
      "stage-spectrum": "src/renderer/ui/views/stage/spectrum.ts",
      "stage-visuals": "src/renderer/ui/views/stage/visuals.ts",
      "lyric-source": "src/renderer/ui/lyric-source.ts",
      "local-lyric": "src/renderer/ui/local-lyric.ts",
      "lyric-bindings": "src/renderer/domain/lyrics/bindings.ts",
      "desktop-lyric": "src/renderer/ui/desktop-lyric-state.ts",
      "input-esc": "src/renderer/ui/input/resolve-esc.ts",
      "input-commands": "src/renderer/ui/input/commands.ts",
      "input-media": "src/renderer/ui/input/media.ts",
      keymap: "src/renderer/ui/input/keymap.ts",
      "shortcuts-rule": "src/renderer/domain/shortcuts/index.ts",
      "trigger-gate": "src/renderer/domain/shortcuts/trigger-gate.ts",
      shortcuts: "src/renderer/ui/shortcuts.ts",
      "net-status": "src/renderer/ui/net-status.ts",
      "net-cache": "src/renderer/domain/net-cache/index.ts",
      "playback-phase": "src/renderer/ui/playback-phase.ts",
      "main-tray": "src/main/trayMenu.ts",
      "library-roots": "src/main/fs/roots.ts",
      "library-state": "src/renderer/domain/library/state.ts",
      "download-queue": "src/renderer/domain/download/queue.ts",
      "update-semver": "src/main/update/semver.ts",
    },
    outdir: "dist-test",
    bundle: true,
    platform: "node",
    format: "esm",
    target: NODE_TARGET,
    outExtension: { ".js": ".mjs" },
  });
  console.log("build:test ok → dist-test/*.mjs");
  process.exit(0);
}

const OUT = "dist";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "renderer"), { recursive: true });

await build({
  entryPoints: ["src/main/index.ts"],
  outfile: path.join(OUT, "main.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: NODE_TARGET,
  // NeteaseCloudMusicApi 按目录扫描 300+ 个模块并动态 require，打不进 bundle，
  // 运行时从 node_modules 加载（打包 exe 时要 asarUnpack，见 package.json 的 build 段）
  // qq-music-api 同理（自带 dist，require 即启动服务）
  external: ["electron", "NeteaseCloudMusicApi", "@yakult-green-tea/qq-music-api"],
  sourcemap: true,
});

await build({
  entryPoints: ["src/preload/index.ts"],
  outfile: path.join(OUT, "preload.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: NODE_TARGET,
  external: ["electron"],
});

// 用户源沙箱子进程：独立产物，utilityProcess.fork 按 __dirname 找它
await build({
  entryPoints: ["src/main/sandbox/child.ts"],
  outfile: path.join(OUT, "sandbox-child.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: NODE_TARGET,
  external: ["electron"],
});

// 迷你窗：独立 preload（只 3 个方法）+ 独立渲染产物
await build({
  entryPoints: ["src/preload/mini.ts"],
  outfile: path.join(OUT, "mini-preload.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: NODE_TARGET,
  external: ["electron"],
});

await build({
  entryPoints: ["src/renderer/mini.tsx"],
  outfile: path.join(OUT, "renderer", "mini.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: BROWSER_TARGET,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

// 取色 Worker（M9-2）：量化不在主线程。独立 iife，运行时 new Worker("tint-worker.js")
await build({
  entryPoints: ["src/renderer/ui/views/stage/tint-worker.ts"],
  outfile: path.join(OUT, "renderer", "tint-worker.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: BROWSER_TARGET,
  define: { "process.env.NODE_ENV": '"production"' },
});

// 桌面歌词窗（M9-1）：同迷你窗——独立 preload（只 3 个方法）+ 独立渲染产物
await build({
  entryPoints: ["src/preload/lyric.ts"],
  outfile: path.join(OUT, "lyric-preload.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: NODE_TARGET,
  external: ["electron"],
});

await build({
  entryPoints: ["src/renderer/lyric.tsx"],
  outfile: path.join(OUT, "renderer", "lyric.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: BROWSER_TARGET,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

// 必须是 iife：file:// 下 ES module 会被 CORS 拦掉，#root 永远是空的。
await build({
  entryPoints: ["src/renderer/ui/index.tsx"],
  outfile: path.join(OUT, "renderer", "app.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: BROWSER_TARGET,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

const css = [
  "src/renderer/ui/tokens.css",
  "src/renderer/ui/app.css",
  "src/renderer/ui/player.css",
  "src/renderer/ui/views/pages.css",
  "src/renderer/ui/views/sheets.css",
  "src/renderer/ui/views/stage/stage.css",
  "src/renderer/ui/views/stage/stage-skins.css",
  "src/renderer/ui/views/stage/stage-queue.css",
  "src/renderer/ui/views/stage/stage-panels.css",
  "src/renderer/ui/live/live.css",
  "src/renderer/ui/live/night-signal.css",
  "src/renderer/ui/live/cover-stage.css",
  "src/renderer/ui/views/redesign.css",
]
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");
fs.writeFileSync(path.join(OUT, "renderer", "app.css"), css);
fs.copyFileSync("src/renderer/index.html", path.join(OUT, "renderer", "index.html"));
fs.copyFileSync("src/renderer/mini.html", path.join(OUT, "renderer", "mini.html"));
fs.copyFileSync("src/renderer/mini.css", path.join(OUT, "renderer", "mini.css"));
fs.copyFileSync("src/renderer/lyric.html", path.join(OUT, "renderer", "lyric.html"));
fs.copyFileSync("src/renderer/lyric.css", path.join(OUT, "renderer", "lyric.css"));

console.log("build ok → dist/");
