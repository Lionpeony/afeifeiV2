#!/usr/bin/env node
/**
 * 图标渲染：build/icon.svg → build/icon-{size}.png（16..512）→ build/icon.ico。
 * 跑法：electron scripts/render-icon.mjs（要用 electron 本体跑，不是 node——
 * 渲染靠离屏 BrowserWindow + canvas，尺寸像素级精确，不吃系统 DPR）。
 * ICO 打包用 PNG 条目格式（Vista+），零依赖。
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const SIZES = [16, 32, 48, 64, 128, 256, 512];
const ROOT = path.resolve(path.join(process.cwd()));
const BUILD = path.join(ROOT, "build");
const svg = fs.readFileSync(path.join(BUILD, "icon.svg"), "utf8");

const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 600, height: 600, useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true },
  });
  await win.loadURL(
    `data:text/html;charset=utf8,${encodeURIComponent(
      `<!doctype html><body style="margin:0"><img id="i" src="${dataUrl}" style="display:block"></body>`,
    )}`,
  );
  // 等 SVG 图像解码完成
  await win.webContents.executeJavaScript(
    `new Promise((r) => { const i = document.getElementById("i"); i.complete ? r(1) : i.addEventListener("load", () => r(1)); })`,
  );

  const pngs = [];
  for (const size of SIZES) {
    const data = await win.webContents.executeJavaScript(
      `(() => {
        const img = document.getElementById("i");
        const c = document.createElement("canvas");
        c.width = ${size}; c.height = ${size};
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, ${size}, ${size});
        return c.toDataURL("image/png");
      })()`,
    );
    const file = path.join(BUILD, `icon-${size}.png`);
    fs.writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
    pngs.push(file);
    console.log(`✓ icon-${size}.png`);
  }

  /* 托盘用：去奶油底板的透明拨片（16px 下托盘底色不可控，透明才干净）——
     16/32 两档写进 src/renderer/ui/af/assets/，build.mjs 会拷进 dist/renderer/assets，
     主进程 tray.ts 按 scaleFactor 1x/2x 装载。 */
  const traySvg = svg.replace(/<rect id="plate"[^>]*\/>/, "");
  const trayUrl = `data:image/svg+xml;base64,${Buffer.from(traySvg).toString("base64")}`;
  const trayDir = path.join(ROOT, "src", "renderer", "ui", "af", "assets");
  fs.mkdirSync(trayDir, { recursive: true });
  for (const [size, name] of [[16, "tray-pick@1x.png"], [32, "tray-pick@2x.png"]]) {
    const data = await win.webContents.executeJavaScript(
      `(() => {
        const img = new Image();
        img.src = ${JSON.stringify(trayUrl)};
        return new Promise((done) => {
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = ${size}; c.height = ${size};
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, ${size}, ${size});
            done(c.toDataURL("image/png"));
          };
        });
      })()`,
    );
    fs.writeFileSync(path.join(trayDir, name), Buffer.from(data.split(",")[1], "base64"));
    console.log(`✓ ${name}`);
  }
  win.destroy();

  /* ICO：6 字节头 + 每图 16 字节目录项 + PNG 数据（256 用 0 表示边长） */
  const images = pngs.map((f) => ({ size: Number(f.match(/(\d+)\.png$/)[1]), data: fs.readFileSync(f) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  fs.writeFileSync(path.join(BUILD, "icon.ico"), Buffer.concat([header, ...entries, ...images.map((i) => i.data)]));
  console.log(`✓ icon.ico（${images.length} 个尺寸，${offset} 字节）`);
  app.quit();
});
