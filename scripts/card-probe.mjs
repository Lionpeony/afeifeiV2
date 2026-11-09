/**
 * 探针：首页「接下来播放」卡片等高 / 标题截断。
 *
 * 跑法：先 npm run build，再 npx electron scripts/card-probe.mjs
 * 产物：docs/assets/probe-cards.png / probe-cards-crop.png
 *
 * 为什么要注入：无账号时首页只渲染登录卡（LiveHome 的每日推荐空态），拿不到 .cs-tape。
 * 注入的是与 LiveHome.tsx 完全同构的 DOM（同 class、同层级），CSS 走同一条链路，
 * 所以量到的卡高/标题行数就是真实布局结果。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const PROFILE = path.join(os.tmpdir(), `afeifei-card-${process.pid}`);

app.setPath("userData", PROFILE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACKS = [["Lay Down", "Caravan Palace", "3:09"]].map(([title], i) => ({
  id: `c:/probe/${i}.mp3`,
  title,
}));

function registerMinimalIpc() {
  const file = (name) => path.join(PROFILE, name);
  const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
  const writeFile = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };
  ipcMain.handle("library:loadIndex", () => readFile(file("library.json")));
  ipcMain.handle("library:saveIndex", (_e, json) => writeFile(file("library.json"), json));
  ipcMain.handle("library:readLog", () => "");
  ipcMain.handle("library:appendLog", () => undefined);
  ipcMain.handle("library:clearLog", () => undefined);
  ipcMain.handle("library:cover", () => null);
  ipcMain.handle("store:read", (_e, key) => readFile(file(`store-${String(key)}.json`)));
  ipcMain.handle("store:write", (_e, key, json) => writeFile(file(`store-${String(key)}.json`), json));
  ipcMain.handle("app-state:load", () => null);
  ipcMain.handle("app-state:save", () => undefined);
  ipcMain.handle("download:usage", () => 0);
  ipcMain.handle("download:dir", () => PROFILE);
  ipcMain.handle("library:roots", () => ["D:\\Music\\华语"]);
  ipcMain.handle("app:autoLaunch", () => true);
  ipcMain.handle("notify:show", () => true);
  ipcMain.handle("win:overlayTheme", () => undefined);
  ipcMain.handle("qq:profile", () => ({ loggedIn: false }));
  ipcMain.handle("scheme:poll", () => null);
  ipcMain.handle("app:lastCrash", () => null);
}

/** 与 LiveHome.tsx 的 cs-tape 结构 1:1 对齐；只换标题长度做实验 */
const CARDS = [
  ["10", "Old Habits（Alan Walker / Farruko / Sofia Reyes 2024 重制豪华版现场录音）", "Caravan Palace", "3:09"],
  ["11", "Black heart", "David Usher", "3:25"],
  ["12", "Sukidayo-Hyakka-Ryoran-Reflection", "Che'Nelle", "5:03"],
  ["13", "Supercalifragilisticexpialidocious", "国风堂 / 李常超", "4:07"],
  ["14", "It's Raining Men", "The Weather Girls", "3:29"],
];

app.whenReady().then(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.writeFileSync(
    path.join(PROFILE, "library.json"),
    JSON.stringify({ v: 1, tracks: TRACKS, savedAt: Date.now() }),
  );
  registerMinimalIpc();

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    show: true,
    webPreferences: {
      preload: path.resolve("dist/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.resolve("dist/renderer/index.html"));
  await sleep(900);
  const js = (code) => win.webContents.executeJavaScript(code, true);

  win.webContents.on("render-process-gone", (_e, d) => console.error("✗ 渲染进程结束：", d.reason));
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) console.error(`  renderer: ${message}`);
  });

  // 注入一块「接下来播放」带：容器宽 860，5 列，和首页右侧同宽
  const cardsJson = JSON.stringify(CARDS);
  await js(`(() => {
    const old = document.querySelector("#probe-strip");
    if (old) old.remove();
    const host = document.createElement("div");
    host.id = "probe-strip";
    host.style.cssText = "position:fixed;left:24px;top:120px;width:860px;height:560px;display:flex;flex-direction:column;z-index:99999;padding:16px;border-radius:12px;background:color-mix(in srgb, var(--live-panel) 92%, transparent);";
    const head = document.createElement("div");
    head.className = "cs-strip-head";
    head.innerHTML = '<h2>接下来播放</h2><span class="cs-strip-sub">按顺序播放</span>';
    const ol = document.createElement("ol");
    ol.className = "cs-tapes";
    for (const [no, title, artist, dur] of ${cardsJson}) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cs-tape";
      btn.innerHTML =
        (no === "11" || no === "13"
          ? '<span class="cs-tape-art cs-tape-vinyl" aria-hidden="true"></span>'
          : '<img class="cs-tape-art" alt="" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==">') +
        '<span class="cs-tape-no">' + no + '</span>' +
        '<span class="cs-tape-title">' + title + '</span>' +
        '<span class="cs-tape-artist">' + artist + '</span>' +
        '<span class="cs-tape-foot"><span class="cs-tape-dur">' + dur + '</span><i class="cs-tape-play" aria-hidden="true"></i></span>';
      li.appendChild(btn);
      ol.appendChild(li);
    }
    host.appendChild(head);
    host.appendChild(ol);
    document.querySelector(".shell.live").appendChild(host);
    return true;
  })()`);
  await sleep(300);

  const measure = async (tag) => {
    const data = await js(`(() => {
      return [...document.querySelectorAll(".cs-tape")].map((c, i) => {
        const t = c.querySelector(".cs-tape-title");
        const foot = c.querySelector(".cs-tape-foot");
        const art = c.querySelector(".cs-tape-art");
        const r = c.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        const fr = foot.getBoundingClientRect();
        const ar = art.getBoundingClientRect();
        const cs = getComputedStyle(t);
        const lines = Math.round(tr.height / parseFloat(cs.lineHeight));
        return {
          i: i + 1,
          title: t.textContent.slice(0, 40),
          cardH: Math.round(r.height),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          artH: Math.round(ar.height),
          artW: Math.round(ar.width),
          titleH: Math.round(tr.height),
          lines,
          needH: t.scrollHeight,
          footTop: Math.round(fr.top),
          footBottom: Math.round(fr.bottom),
          ws: cs.whiteSpace,
          clamp: cs.webkitLineClamp,
          cssH: cs.height,
          fs: cs.fontSize,
        };
      });
    })()`);
    console.log(`\n[${tag}]`);
    for (const d of data) {
      console.log(
        `  #${d.i} card=${d.cardH} (${d.top}→${d.bottom}) art=${d.artW}x${d.artH} ` +
          `title=${d.titleH}/${d.lines}行 需${d.needH} foot=${d.footTop}→${d.footBottom} ` +
          `ws=${d.ws} clamp=${d.clamp} h=${d.cssH} fs=${d.fs} | ${d.title}`,
      );
    }
    const hs = data.map((d) => d.cardH);
    const bs = data.map((d) => d.bottom);
    console.log(`  → 卡高 ${JSON.stringify([...new Set(hs)])} 极差=${Math.max(...hs) - Math.min(...hs)}px`);
    console.log(`  → 底边 ${JSON.stringify([...new Set(bs)])} 极差=${Math.max(...bs) - Math.min(...bs)}px`);
  };

  await measure("现状");

  await js(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
  const full = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, "probe-cards.png"), full.toPNG());
  console.log("shot → docs/assets/probe-cards.png");

  {
    const r = await js(`(() => { const b = document.querySelector("#probe-strip").getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()`);
    const c = await win.webContents.capturePage({
      x: Math.round(r[0]),
      y: Math.round(r[1]),
      width: Math.round(r[2]),
      height: Math.round(r[3]),
    });
    fs.writeFileSync(path.join(OUT, "probe-cards-crop.png"), c.toPNG());
    console.log("crop → docs/assets/probe-cards-crop.png");
  }

  app.quit();
});

process.on("unhandledRejection", (err) => {
  console.error("✗", err);
  app.quit();
});
