#!/usr/bin/env node
/* 诊断：E27 corner 剪影双姿态（wave 挥别 / peek 探身）离屏渲染出 PNG，肉眼验收。
   跑法：在工程根目录 `electron scripts/_diag-corner.mjs`。
   路径数据手工镜像自 icons.tsx Silhouette（pose 分支），改组件后要同步。 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, "docs", "assets");

const BODY = `
  <path d="M31 5c8.6 0 14.6 6.2 14.6 14.2S39.6 33 31 33s-14.4-5.8-14.4-13.8S22.4 5 31 5z"/>
  <path d="M15.6 9.4C19 3.6 26 1.2 32.4 2.4c6.4 1.2 11 6 12 12-6 1.8-11 .8-15-1.2-4.6-2.4-9.4-2.8-13.8-3.8z"/>
  <path d="M44.8 17.4c3.4 5.6 2.4 12-2 16.4-.9.9-.2 2.4 1 2.2 5.6-1.6 9-8 8-14.4z"/>
  <path d="M29.6 34c10.4 0 16.6 6.2 17.6 16.6l3.8 26.2c.9 6-3 10.6-9 10.6H16.8c-6 0-9.9-4.6-9-10.6l3.8-26.2C12.6 40.2 18.8 34 29.6 34z"/>
  <path d="M13.4 46.4c-4 6.6-5.8 14.4-4.8 22.2.2 3 2 4.6 4.2 4.4 2-.2 3.4-2 3.2-4.4-.8-7 .4-13 3.4-18.8z"/>`;
const RAISED_ARM = `<g><rect x="43" y="22" width="6.4" height="28" rx="3.2" transform="rotate(16 46 50)"/><circle cx="56" cy="23.5" r="4"/></g>`;
const LEGS = `<path d="M24.6 84.4 21 101.6h5.4l4-15z"/><path d="M36.4 84.4 33 101.6h5.4l4-15z"/>`;
const GUITAR = `<g><ellipse cx="50" cy="72" rx="14.6" ry="11.4" transform="rotate(-20 50 72)"/><rect x="55" y="38" width="4" height="32" rx="2" transform="rotate(22 57 54)"/></g>`;

const frame = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 104" width="168" height="208" fill="#4A4356">${inner}</svg>`;
const wave = frame(`<g>${BODY}${RAISED_ARM}${LEGS}${GUITAR}</g>`);
const peek = frame(`<g transform="rotate(-12 30 102)">${BODY}${RAISED_ARM}${LEGS}${GUITAR}</g>`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 240, height: 260, webPreferences: { offscreen: true, sandbox: true } });
  for (const [name, svg] of [["diag-corner-wave", wave], ["diag-corner-peek", peek]]) {
    const url = `data:text/html;charset=utf8,${encodeURIComponent(
      `<body style="margin:0;background:#fff"><img id="i" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`,
    )}`;
    await win.loadURL(url);
    await win.webContents.executeJavaScript(
      `new Promise((r) => { const i = document.getElementById("i"); i.complete ? r(1) : i.addEventListener("load", () => r(1)); })`,
    );
    const data = await win.webContents.executeJavaScript(
      `(() => { const c = document.createElement("canvas"); c.width = 168; c.height = 208;
        const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
        x.drawImage(document.getElementById("i"), 0, 0, 168, 208); return c.toDataURL("image/png"); })()`,
    );
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data.split(",")[1], "base64"));
    console.log(`ok ${name}.png`);
  }
  app.quit();
});
