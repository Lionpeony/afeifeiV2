/**
 * 四页排版截图（docs/09 B3 验收：1334×747）。
 *
 * 跑法：先 npm run build，再 npx electron scripts/page-shots.mjs
 * 产物：docs/assets/page-<id>.png（本地 / 在线 / 歌单 / 下载）
 *
 * 不 spawn 真实 app（那要 CDP），也不复用 main/index.ts（它会自己开窗口）：
 * 这里自己开窗口 + 注册 renderer 启动必需的 IPC handler，userData 指到
 * 临时目录、快照直接落盘——绝不动用户真实索引。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const PROFILE = path.join(os.tmpdir(), `afeifei-shots-${process.pid}`);

app.setPath("userData", PROFILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 截图 fixture：空曲库看不出表头/行的列对齐。 */
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

const PAGES = [
  ["本地", "local"],
  ["在线", "online"],
  ["歌单", "playlists"],
  ["播放页", "stage"],
  ["下载", "downloads"],
];

/**
 * 只补齐 renderer 启动路径会 invoke 的几条。少一条 bootstrap 就整体 reject，
 * 页面只剩空壳——这也是为什么这几行必须和 preload 的通道名逐字对上。
 */
function registerMinimalIpc() {
  const file = (name) => path.join(PROFILE, name);
  const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
  const writeFile = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };

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

app.whenReady().then(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.writeFileSync(path.join(PROFILE, "library.json"), JSON.stringify({ v: 1, tracks: TRACKS, savedAt: Date.now() }));
  registerMinimalIpc();

  const [shotW, shotH] = (process.env.SHOTS_SIZE ?? "1334x747").split("x").map(Number);
  const suffix = process.env.SHOTS_SUFFIX ?? "";

  const win = new BrowserWindow({
    width: shotW,
    height: shotH,
    useContentSize: true, // 尺寸指可绘制区，不含窗口边框
    show: true,
    webPreferences: {
      preload: path.resolve("dist/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.resolve("dist/renderer/index.html"));
  await sleep(900); // 曲库恢复 + 首帧

  fs.mkdirSync(OUT, { recursive: true });

  for (const [label, id] of PAGES) {
    const ok = await win.webContents.executeJavaScript(
      `(() => {
        const b = [...document.querySelectorAll(".rail button")].find((x) => x.textContent === ${JSON.stringify(label)});
        if (!b) return false;
        b.click();
        return true;
      })()`,
      true,
    );
    if (!ok) throw new Error(`找不到导航项「${label}」`);
    await sleep(400); // 切页后一帧
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `page-${id}${suffix}.png`), img.toPNG());
    console.log(`shot → docs/assets/page-${id}${suffix}.png`);
  }

  // 夜间一版（docs/09 B4 证据）：同一进程切主题，不重启、不重排
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".rail button")].find((x) => x.textContent === "本地")?.click()`,
    true,
  );
  await win.webContents.executeJavaScript(`document.querySelector(".theme-toggle")?.click()`, true);
  await sleep(300);
  fs.writeFileSync(path.join(OUT, `page-local-dark${suffix}.png`), (await win.webContents.capturePage()).toPNG());
  console.log(`shot → docs/assets/page-local-dark${suffix}.png`);

  app.quit();
});
