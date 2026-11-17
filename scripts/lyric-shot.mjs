/**
 * 桌面歌词窗截图（验收用）。
 * 跑法：npm run build && npx electron scripts/lyric-shot.mjs
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 720,
    height: 220,
    frame: false,
    transparent: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.resolve("dist/lyric-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.resolve("dist/renderer/lyric.html"));
  win.webContents.send(
    "lyric:state",
    JSON.stringify({
      text: "离开前 请结束我的生命",
      translation: "Before I leave, please end my life",
      lit: 5,
      song: 0.38,
      theme: "light",
      mode: "interactive",
    }),
  );
  await sleep(600);
  const img = await win.webContents.capturePage();
  fs.mkdirSync("docs/assets", { recursive: true });
  fs.writeFileSync("docs/assets/page-lyric-window.png", img.toPNG());

  // 锁定态：小锁 + 「从哪儿解锁」提示（穿透后窗口收不到鼠标，这两样是唯一的线索）
  win.webContents.send(
    "lyric:state",
    JSON.stringify({
      text: "离开前 请结束我的生命",
      translation: "Before I leave, please end my life",
      lit: 5,
      song: 0.38,
      theme: "light",
      mode: "pass",
    }),
  );
  await sleep(350);
  const locked = await win.webContents.capturePage();
  fs.writeFileSync("docs/assets/page-lyric-window-locked.png", locked.toPNG());
  console.log("shot → docs/assets/page-lyric-window.png / -locked.png");
  app.quit();
});
