/**
 * 队列面板截图（queue v3 悬浮玻璃卡证据：docs/15 交付门槛）。
 *
 * 跑法：先 npm run build，再 npx electron scripts/queue-shots.mjs
 * 产物：docs/assets/queue-v3.png（纸色 · 有内容）/ queue-v3-dark.png（夜色）/ queue-v3-empty.png（空态）
 *
 * page-shots.mjs 的整链目前断在过期的「下载」导航项上（站尺已移除该 tick），
 * 队列截图排在断点之后拿不到——这里是只拍队列的最小链，IPC 桩与 fixture 抄 page-shots。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const PROFILE = path.join(os.tmpdir(), `afeifei-shots-${process.pid}`);

app.setPath("userData", PROFILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACKS = [
  ["夜的第七章", "周杰伦", "依然范特西", 297000],
  ["青花瓷", "周杰伦", "我很忙", 239000],
  ["东风破", "周杰伦", "叶惠美", 315000],
  ["江南", "林俊杰", "第二天堂", 268000],
  ["她说", "林俊杰", "她说", 322000],
  ["富士山下", "陈奕迅", "What's Going On…?", 258000],
  ["浮夸", "陈奕迅", "U87", 285000],
  ["十年", "陈奕迅", "黑白灰", 205000],
].map(([title, artist, album, durationMs], i) => ({
  id: `c:/shots/${i}.mp3`,
  path: `C:/shots/${i}.mp3`,
  title,
  artist,
  album,
  durationMs,
  size: 5000 + i,
  mtimeMs: 1000 + i,
  hasCover: false,
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
  ipcMain.handle("library:roots", () => ["D:\\Music\\华语", "E:\\Music\\Lossless"]);
  ipcMain.handle("app:autoLaunch", () => true);
  ipcMain.handle("notify:show", () => true);
  ipcMain.handle("win:overlayTheme", () => undefined);
  ipcMain.handle("qq:profile", () => ({ loggedIn: false }));
  ipcMain.handle("scheme:poll", () => null);
  ipcMain.handle("app:lastCrash", () => null);
}

app.whenReady().then(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.writeFileSync(path.join(PROFILE, "library.json"), JSON.stringify({ v: 1, tracks: TRACKS, savedAt: Date.now() }));
  registerMinimalIpc();

  const win = new BrowserWindow({
    width: 1334,
    height: 747,
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

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`✗ 渲染进程结束：${details.reason}（exitCode ${details.exitCode}）`);
  });
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) console.error(`  renderer: ${message}`);
  });

  fs.mkdirSync(OUT, { recursive: true });

  const shoot = async (name) => {
    await win.webContents.executeJavaScript(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
      true,
    );
    let img = await win.webContents.capturePage();
    if (img.isEmpty()) {
      await sleep(500);
      img = await win.webContents.capturePage();
    }
    if (img.isEmpty()) {
      console.error(`✗ ${name} 截到空图，跳过`);
      return false;
    }
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log(`shot → docs/assets/${name}`);
    return true;
  };

  const js = (code) => win.webContents.executeJavaScript(code, true);

  // 空态先拍：面板开着、列表是空的（按钮已换图标钮，认 aria-label 不认文案）
  if (!(await js(`(() => {
    const b = document.querySelector('.tools button[aria-label="播放队列"]');
    if (!b) return false;
    b.click();
    return true;
  })()`))) throw new Error("找不到控制台的「播放队列」按钮");
  await sleep(400);
  await shoot("queue-v3-empty.png");
  await js(`document.querySelector(".qp-x")?.click()`);
  await sleep(250);

  // 有内容：先切到「本地」页（加入队列的按钮在曲目行上），造 8 首（不点播，无失败态干扰）
  await js(`(() => {
    const b = document.querySelector('.side-item[data-page="local"]')
      ?? [...document.querySelectorAll(".side-item")].find((x) => x.textContent?.includes("本地"));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(400);
  // 本地页默认落在专辑墙，曲目行在「曲目」tab 里
  await js(
    `[...document.querySelectorAll(".lib-tabs button")].find((x) => x.textContent === "曲目")?.click()`,
  );
  await sleep(300);
  const added = await js(
    `[...document.querySelectorAll('[aria-label^="加入队列"]')].slice(0, 8).length`,
  );
  if (added < 1) {
    const diag = await js(`(() => ({
      onTick: document.querySelector(".side-item.on")?.getAttribute("data-page") ?? "",
      head: document.querySelector(".page-head h1, h1")?.textContent ?? "",
      classes: [...document.querySelectorAll("[class]")].map((n) => (n.getAttribute("class") ?? "").split(" ")[0]).filter((c) => c.startsWith("lib") || c.startsWith("local")).slice(0, 20),
      bodyCls: document.body.className,
    }))()`);
    throw new Error(`本地页找不到「加入队列」按钮：${JSON.stringify(diag)}`);
  }
  await js(`[...document.querySelectorAll('[aria-label^="加入队列"]')].slice(0, 8).forEach((b) => b.click())`);
  await sleep(300);
  // 拍用户实际看到的场景：在线页（live 壳层，右侧榜单 + 控制台——面板最难的背景）
  await js(
    `document.querySelector('.side-item[data-page="online"]')?.click()`,
  );
  await sleep(500);
  if (!(await js(`(() => {
    const b = document.querySelector('.tools button[aria-label="播放队列"]');
    if (!b) return false;
    b.click();
    return true;
  })()`))) throw new Error("找不到控制台的「播放队列」按钮");
  await sleep(400);
  await shoot("queue-v3.png");

  // 面板 1:1 裁切（整图被缩放，细节问题只有 1:1 看得出来）
  {
    const r = await js(`(() => { const b = document.querySelector(".qp").getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
    const c = await win.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) });
    fs.writeFileSync(path.join(OUT, "queue-v3-crop.png"), c.toPNG());
    console.log("crop → docs/assets/queue-v3-crop.png");
    // 3 倍放大看字形（行左侧 190×230 → 570×690）
    const zoom = c.crop({ x: 0, y: 40, width: 190, height: 230 }).resize({ width: 570, quality: "best" });
    fs.writeFileSync(path.join(OUT, "queue-v3-zoom.png"), zoom.toPNG());
    console.log("zoom → docs/assets/queue-v3-zoom.png");
    // 行操作列 3 倍放大（↑↓× 的对齐只能在这个尺度上判断）
    const opsZoom = c
      .crop({ x: Math.max(0, c.getSize().width - 150), y: 36, width: 150, height: 240 })
      .resize({ width: 450, quality: "best" });
    fs.writeFileSync(path.join(OUT, "queue-ops-zoom.png"), opsZoom.toPNG());
    console.log("zoom → docs/assets/queue-ops-zoom.png");
  }

  // 夜色一版：同一进程切主题
  await js(`document.querySelector(".theme-toggle")?.click()`);
  await sleep(800);
  await shoot("queue-v3-dark.png");

  app.quit();
});

/* 失败也要退：不挂一个僵尸 electron 等超时 */
process.on("unhandledRejection", (err) => {
  console.error("✗", err);
  app.quit();
});
