/**
 * 迷你/悬浮窗截图（验收用）。
 * 跑法：npm run build && npx electron scripts/mini-shot.mjs
 * 输出两张：静止态 / 鼠标移上来（灯泡亮起、走带翻出）。
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 验收用的假封面：抽象色块，不是任何真实专辑封面 */
const COVER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFB3D1"/><stop offset=".55" stop-color="#D63384"/><stop offset="1" stop-color="#5E49B8"/>
        </linearGradient>
      </defs>
      <rect width="180" height="180" fill="url(#g)"/>
      <circle cx="58" cy="64" r="34" fill="#FFF8F5" opacity=".82"/>
      <circle cx="58" cy="64" r="12" fill="#3D2B39" opacity=".55"/>
      <path d="M0 132c34-26 62-26 90 0s56 26 90 0v48H0z" fill="#2A2438" opacity=".35"/>
      <path d="M22 150h136" stroke="#FFF8F5" stroke-width="3" opacity=".55"/>
    </svg>`,
  );

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 440,
    height: 132,
    frame: false,
    transparent: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.resolve("dist/mini-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.resolve("dist/renderer/mini.html"));
  // 等 React 挂载完再推状态：提前推的包会被丢掉（套壳无桥时没人补推）
  await sleep(400);
  win.webContents.send(
    "mini:state",
    JSON.stringify({
      status: "playing",
      title: "夜の練習",
      artist: "AFEIFEI",
      source: "netease",
      index: 7,
      count: 30,
      t: 83000,
      dur: 245000,
      lyric: "把耳机调到最大声",
      tr: "Turn it up all the way",
      lit: 5,
      liked: true,
      cover: COVER,
      theme: "light",
    }),
  );
  /** 等一帧再拍：resize / 状态刚落地时 capturePage 会拿到上一帧（文字会凭空消失） */
  const snap = async (file) => {
    await win.webContents.executeJavaScript(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
      true,
    );
    const img = await win.webContents.capturePage();
    fs.writeFileSync(`docs/assets/${file}`, img.toPNG());
  };

  await sleep(700);
  fs.mkdirSync("docs/assets", { recursive: true });
  await snap("page-mini-window.png");

  // 鼠标移到卡片上：文字淡出、走带翻上来（QQ 音乐节奏）
  win.webContents.sendInputEvent({ type: "mouseMove", x: 300, y: 64 });
  await sleep(60);
  win.webContents.sendInputEvent({ type: "mouseMove", x: 302, y: 62 });
  await sleep(700);
  await snap("page-mini-window-hover.png");

  // 熄灯：同一张便签在暗色下的纸色与灯泡
  win.webContents.sendInputEvent({ type: "mouseMove", x: 2, y: 2 });
  win.webContents.send(
    "mini:state",
    JSON.stringify({ status: "playing", theme: "dark", liked: true, cover: COVER, lyric: "把耳机调到最大声", tr: "Turn it up all the way", lit: 5 }),
  );
  await sleep(500);
  await snap("page-mini-window-dark.png");

  // 空态：没选歌、没封面、没词时镜子也要说得清楚
  win.webContents.send(
    "mini:state",
    JSON.stringify({
      status: "idle",
      theme: "light",
      title: "还没选歌",
      artist: "",
      source: "",
      index: 0,
      count: 0,
      t: 0,
      dur: 0,
      lyric: "",
      tr: "",
      liked: false,
      cover: null,
    }),
  );
  await sleep(500);
  await snap("page-mini-window-empty.png");

  console.log("shot → docs/assets/page-mini-window[-hover|-dark|-empty].png");
  app.quit();
});
