/**
 * 播放页右上角月亮按钮的回归验证（2026-11-10 用户实测 BUG）。
 *
 * BUG：舞台配色吃独立的 stage.tone（样式库左下的明暗对），不消费全局 data-theme，
 * 所以在播放页点右上角月亮「看起来没反应」。修法：舞台上让舞台领先——先翻
 * stage.tone（外壳经 :has 跟着翻纸），再把全局主题同步成同一个值。
 *
 * 本脚本复刻 page-shots 的最小 IPC 桩，走真 UI：
 * 首页 → 点 .np 进播放页 → 点 .theme-toggle → 断言 .stage data-tone 与
 * html[data-theme] 一起翻 → 截前后两张图。
 *
 * 跑法：先 node scripts/build.mjs，再 npx electron scripts/tone-toggle-check.mjs
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const PROFILE = path.join(os.tmpdir(), `afeifei-tone-${process.pid}`);

app.setPath("userData", PROFILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACKS = [
  ["夜的第七章", "周杰伦", "依然范特西", 297000],
  ["青花瓷", "周杰伦", "我很忙", 239000],
  ["东风破", "周杰伦", "叶惠美", 315000],
  ["江南", "林俊杰", "第二天堂", 268000],
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
  ipcMain.handle("library:roots", () => []);
  ipcMain.handle("app:autoLaunch", () => false);
  ipcMain.handle("notify:show", () => true);
  ipcMain.handle("netease:profile", () => ({ loggedIn: false, nick: "", uid: "" }));
  ipcMain.handle("netease:call", () => ({ code: 200 }));
}

app.whenReady().then(async () => {
  const failures = [];
  const fail = (msg) => {
    failures.push(new Error(msg));
    console.error(`✗ ${msg}`);
  };

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
      await sleep(400);
      img = await win.webContents.capturePage();
    }
    if (img.isEmpty()) {
      fail(`${name} 截到空图`);
      return;
    }
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log(`shot → docs/assets/${name}`);
  };

  const readState = () =>
    win.webContents.executeJavaScript(
      `(() => ({
        tone: document.querySelector(".stage")?.getAttribute("data-tone") ?? null,
        global: document.documentElement.dataset.theme ?? "light",
        onStage: !!document.querySelector(".stage"),
      }))()`,
      true,
    );
  const clickMoon = () =>
    win.webContents.executeJavaScript(
      `(() => { const b = document.querySelector(".ruler .theme-toggle"); if (!b) return false; b.click(); return true; })()`,
      true,
    );

  /* 1. 进播放页（真 UI：控制台的「正在播放」按钮）。
     toneAuto 默认开：舞台明暗必须跟随全局主题——全局浅色进播放页却翻黑就是 BUG 本体 */
  await win.webContents.executeJavaScript(`document.querySelector(".np")?.click()`, true);
  await sleep(600);
  const s0 = await readState();
  console.log(`进播放页：stage=${s0.onStage} tone=${s0.tone} global=${s0.global}`);
  if (!s0.onStage) fail("没进播放页（.stage 不存在）");
  if (s0.tone !== s0.global) fail(`舞台明暗没跟随全局主题：tone=${s0.tone} global=${s0.global}`);
  await shoot("tone-toggle-before.png");

  /* 2. 点右上角月亮（toneAuto）：全局翻、舞台跟着翻 */
  if (!(await clickMoon())) fail("右上角找不到 .theme-toggle");
  await sleep(500);
  const s1 = await readState();
  console.log(`第一次点月亮：tone=${s1.tone} global=${s1.global}`);
  if (s1.global === s0.global) fail(`全局主题没翻：${s0.global} → ${s1.global}`);
  if (s1.tone !== s1.global) fail(`舞台没跟随：tone=${s1.tone} global=${s1.global}`);
  await shoot("tone-toggle-after.png");

  /* 3. 再点一次：翻回来 */
  await clickMoon();
  await sleep(500);
  const s2 = await readState();
  console.log(`第二次点月亮：tone=${s2.tone} global=${s2.global}`);
  if (s2.tone !== s0.tone || s2.global !== s0.global) {
    fail(`第二次没翻回初始：tone ${s0.tone}→${s2.tone} global ${s0.global}→${s2.global}`);
  }

  /* 4. 样式库里点「深色」= 用户表态，锁成手动档：之后舞台领先、全局跟着舞台走 */
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".sk-top-b")].find((b) => b.textContent.trim() === "样式")?.click()`,
    true,
  );
  await sleep(300);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".sk-seg button")].find((b) => b.textContent.trim() === "深色")?.click()`,
    true,
  );
  await sleep(300);
  await win.webContents.executeJavaScript(`document.querySelector(".sk-shelf-x")?.click()`, true);
  await sleep(300);
  const s3 = await readState();
  console.log(`样式库锁深色：tone=${s3.tone} global=${s3.global}`);
  if (s3.tone !== "dark") fail(`样式库点深色没生效：${s3.tone}`);
  await clickMoon();
  await sleep(500);
  const s4 = await readState();
  console.log(`手动档点月亮（舞台领先）：tone=${s4.tone} global=${s4.global}`);
  if (s4.tone !== "light") fail(`手动档舞台没领先翻亮：${s4.tone}`);
  if (s4.global !== "light") fail(`手动档全局没跟着舞台走：${s4.global}`);

  win.destroy();
  if (failures.length) {
    app.exit(1);
    return;
  }
  console.log("tone-toggle-check ok");
  app.quit();
});
