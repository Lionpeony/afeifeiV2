/**
 * 播放页截图（stage-v10 a2 重排的验收证据）。
 *
 * 跑法：先 node scripts/build.mjs，再 npx electron scripts/stage-shots.mjs
 * 产物：docs/assets/page-stage.png（纸面剧场主图）、stage-<preset>.png ×4、stage-menu.png（视图浮层）
 *
 * 与 page-shots 同一套 fixture 纪律：自开窗口 + 最小 IPC + 临时 userData，
 * 绝不动真实索引。**少一条 IPC 就等于没数据**（bootstrap 整体 reject → 空壳）。
 *
 * 截图里的曲库是 C:\Windows\Media 的真实 wav：点第一行真的会播，
 * 队列因此有 8 条真数据；本地曲目没有歌词，左侧活字区显示空态文案（不造假歌词）。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const PROFILE = path.join(os.tmpdir(), `afeifei-stage-${process.pid}`);
const MEDIA = "C:\\Windows\\Media";

app.setPath("userData", PROFILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACKS = [
  ["老人と海", "ヨルシカ", "老人と海", 321000],
  ["打上花火", "Daoko / 米津玄師", "打上花火", 268000],
  ["Daisy", "Aimer", "Daisy", 284000],
  ["Lay Down", "Caravan Palace", "Lay Down", 207000],
  ["夜的第七章", "周杰伦", "依然范特西", 297000],
  ["青花瓷", "周杰伦", "我很忙", 239000],
  ["富士山下", "陈奕迅", "What's Going On…?", 258000],
  ["浮夸", "陈奕迅", "U87", 285000],
].map(([title, artist, album, durationMs], i) => {
  const p = path.join(MEDIA, `Alarm0${(i % 9) + 1}.wav`);
  return {
    id: p.replace(/\\/g, "/").toLowerCase(),
    path: p,
    title,
    artist,
    album,
    durationMs,
    size: 400000,
    mtimeMs: 1000 + i,
    hasCover: false,
  };
});

/** 在线态 fixture：让播放页走到「有歌词」的分支（本地 wav 永远没有歌词）。 */
const LRC = [
  "[00:00.00]他梦见狮子回到沙滩上。",
  "[00:04.00]马林鱼把小船拖进深蓝",
  "[00:08.00]群鲨来的那晚星星很低",
  "[00:12.00]而帆在盐粒里慢慢变旧",
  "[00:16.00]老人把星辰缝进补丁",
  "[00:20.00]海流把名字冲成传说",
  "[00:24.00]灯塔数着回港的次数",
  "[00:28.00]浪把誓言写在沙上又收走",
  "[00:32.00]他与海交换一生的沉默",
  "[00:36.00]天亮时渔线还在手中。",
  "[00:40.00]汽笛在梦的第三段靠岸",
  "[00:44.00]八十五天的清晨没有鱼",
].join("\n");

function registerMinimalIpc() {
  const file = (name) => path.join(PROFILE, name);
  const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
  const writeFile = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };

  // 音源自带的通用转发口：只认截图需要的三个方法，别的原样回落
  ipcMain.handle("netease:call", (_e, method) => {
    if (method === "cloudsearch") {
      return {
        result: {
          songCount: 1,
          songs: [
            {
              id: 1901371647,
              name: "老人と海",
              ar: [{ name: "ヨルシカ" }],
              al: { name: "老人と海" },
              dt: 321000,
            },
          ],
        },
      };
    }
    if (method === "song_url_v1") {
      // 地址本身无效（截图不验声音），但歌词/队列/封面分支都是真的
      return { data: [{ url: "https://example.invalid/laoren.mp3", code: 200 }] };
    }
    if (method === "lyric") return { lrc: { lyric: LRC } };
    return {};
  });
  ipcMain.handle("netease:profile", () => ({ loggedIn: true, nick: "阿飞飞", uid: "1" }));

  ipcMain.handle("library:loadIndex", () => readFile(file("library.json")));
  ipcMain.handle("library:saveIndex", (_e, json) => writeFile(file("library.json"), json));
  // readLog 必须给 ""：真主进程读不到文件也返回空串，parseLog 对 null 会崩
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
}

const PRESETS = ["paper", "vinyl", "minimal", "cinema"];
const PRESET_NAMES = ["纸面剧场", "黑胶唱机", "极简留白", "电影感"];

app.whenReady().then(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.writeFileSync(path.join(PROFILE, "library.json"), JSON.stringify({ v: 1, tracks: TRACKS, savedAt: Date.now() }));
  registerMinimalIpc();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,
    show: true, // 隐藏窗口会被节流，React 更新迟一拍
    webPreferences: {
      preload: path.resolve("dist/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.resolve("dist/renderer/index.html"));
  await sleep(900);

  fs.mkdirSync(OUT, { recursive: true });

  // 点第一行真播：队列 = 8 首，右栏「接下来」与「台词本」才有数据可截
  const played = await win.webContents.executeJavaScript(
    `(() => { const r = document.querySelector('.lib-row'); if (!r) return false; r.click(); return true; })()`,
    true,
  );
  if (!played) throw new Error("曲库没有行，fixture 未生效");
  await sleep(700);

  // console 左端「正在播放」整块 = 进播放页
  const entered = await win.webContents.executeJavaScript(
    `(() => { const b = document.querySelector('.np'); if (!b) return false; b.click(); return true; })()`,
    true,
  );
  if (!entered) throw new Error("找不到 console 的 .np 入口");

  const shot = async (name) => {
    await sleep(500);
    fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
    console.log(`shot → docs/assets/${name}`);
  };

  await shot("page-stage.png"); // 主图：纸面剧场（默认预设）

  // 四套预设：先开「视图」浮层，再逐套点；轮询到高亮真的变了才拍
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  await sleep(200);

  for (let i = 0; i < PRESETS.length; i += 1) {
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('.st-presets button')[${i}].click()`,
      true,
    );
    const ok = await win.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const want = ${JSON.stringify(PRESET_NAMES[i])};
        const deadline = Date.now() + 5000;
        const tick = () => {
          const on = document.querySelector('.st-presets button.on')?.textContent;
          if (on === want) return resolve(true);
          if (Date.now() > deadline) return resolve(false);
          setTimeout(tick, 50);
        };
        tick();
      })`,
      true,
    );
    if (!ok) throw new Error(`预设 ${PRESET_NAMES[i]} 未在 5s 内生效`);
    await shot(`stage-${PRESETS[i]}.png`);
  }

  /* ---- 在线态：本地 wav 没有歌词，只有走在线才验得到田字格与台词本 ---- */
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true); // 收浮层
  const navOk = await win.webContents.executeJavaScript(
    `(() => { const n = [...document.querySelectorAll('.rail button')].find(b => b.textContent === '在线'); n?.click(); return !!n; })()`,
    true,
  );
  if (!navOk) throw new Error("找不到导航项「在线」");
  await sleep(300);

  await win.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector('.search');
      if (!input) return false;
      // React 受控输入：走原生 setter + input 事件，直接赋 value 不会触发 onChange
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '老人と海');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
    true,
  );
  await sleep(200);
  await win.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('.lib-head button')].find(x => x.textContent === '搜索'); b?.click(); return !!b; })()`,
    true,
  );
  await sleep(700);
  const rowOk = await win.webContents.executeJavaScript(
    `(() => { const r = document.querySelector('.online-row'); if (!r) return false; r.click(); return true; })()`,
    true,
  );
  if (!rowOk) throw new Error("在线搜索结果为空（netease:call mock 未生效）");
  await sleep(900);

  await win.webContents.executeJavaScript(`document.querySelector('.np')?.click()`, true);
  await sleep(600);
  // fixture：音频地址是假的，状态栏会显示 loading/error —— 不属本次验收，只藏状态字（不改产品代码）
  await win.webContents.executeJavaScript(
    `document.querySelector('.tbar .status')?.style.setProperty('visibility','hidden')`,
    true,
  );
  await shot("page-stage-lyric.png");

  app.quit();
});
