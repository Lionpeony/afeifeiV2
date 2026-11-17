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
    width: 320,
    height: 140,
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
  await sleep(700);
  fs.mkdirSync("docs/assets", { recursive: true });
  const idle = await win.webContents.capturePage();
  fs.writeFileSync("docs/assets/page-mini-window.png", idle.toPNG());

  // 鼠标移到便签上：灯泡亮、走带翻出（hover 态是这个小窗的主要工作状态）
  win.webContents.sendInputEvent({ type: "mouseMove", x: 280, y: 92 });
  await sleep(600);
  const hover = await win.webContents.capturePage();
  fs.writeFileSync("docs/assets/page-mini-window-hover.png", hover.toPNG());

  // 熄灯：同一张镜子在暗色下的纸色与灯泡
  win.webContents.sendInputEvent({ type: "mouseMove", x: 2, y: 2 });
  win.webContents.send(
    "mini:state",
    JSON.stringify({ status: "playing", theme: "dark", liked: true, cover: COVER, lyric: "把耳机调到最大声", tr: "Turn it up all the way", lit: 5 }),
  );
  await sleep(500);
  const dark = await win.webContents.capturePage();
  fs.writeFileSync("docs/assets/page-mini-window-dark.png", dark.toPNG());

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
  const empty = await win.webContents.capturePage();
  fs.writeFileSync("docs/assets/page-mini-window-empty.png", empty.toPNG());

  console.log("shot → docs/assets/page-mini-window[-hover|-dark|-empty].png");
  app.quit();
});
