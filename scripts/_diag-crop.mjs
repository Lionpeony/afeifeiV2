#!/usr/bin/env node
/* 诊断：把已有整页截图的局部放大 3 倍出图，肉眼验收 B 清单手感（切膜/赛璐璐/kira 静帧）。
   跑法：Remove-Item Env:\ELECTRON_RUN_AS_NODE; npx electron scripts/_diag-crop.mjs
   产物：docs/assets/zoom-<name>.png */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, "docs", "assets");

/* [源图, 输出名, x, y, w, h]（1334x747 坐标系） */
const CROPS = [
  ["page-settings.png", "zoom-settings-palette", 150, 610, 700, 137],
];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { offscreen: true, sandbox: true } });
  for (const [src, name, x, y, w, h] of CROPS) {
    const b64 = fs.readFileSync(path.join(OUT, src)).toString("base64");
    await win.loadURL(`data:text/html,<body style="margin:0"></body>`);
    const data = await win.webContents.executeJavaScript(
      `(() => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const S = 3, c = document.createElement("canvas");
          c.width = ${w} * S; c.height = ${h} * S;
          const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
          g.drawImage(img, ${x}, ${y}, ${w}, ${h}, 0, 0, ${w} * S, ${h} * S);
          res(c.toDataURL("image/png"));
        };
        img.src = "data:image/png;base64,${b64}";
      }))()`,
    );
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data.split(",")[1], "base64"));
    console.log(`ok ${name}.png`);
  }
  app.quit();
});
