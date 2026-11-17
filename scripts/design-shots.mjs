/**
 * 设计方向截图（验收用，不是生产代码）。
 * 跑法：npx electron scripts/design-shots.mjs
 *       DESIGN_FILE=docs/design/mini-window/C-variants.html DESIGN_OUT=mini-c-variants DESIGN_NAMES=c1,c2,c3 npx electron scripts/design-shots.mjs
 * 产物：docs/assets/<DESIGN_OUT>.png + 每个方向一张单列图
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FILE = process.env.DESIGN_FILE ?? "docs/design/mini-window/Directions.html";
const OUT = process.env.DESIGN_OUT ?? "mini-window-directions";
const NAMES = (process.env.DESIGN_NAMES ?? "a,b,c").split(",");

app.commandLine.appendSwitch("force-device-scale-factor", "2");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 860,
    show: true,
    backgroundColor: "#171a2a",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await win.loadFile(path.resolve(FILE));
  await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)", true);
  await sleep(600);

  const height = await win.webContents.executeJavaScript("document.documentElement.scrollHeight", true);
  win.setContentSize(1440, Math.ceil(height));
  await sleep(400);

  fs.mkdirSync("docs/assets", { recursive: true });
  const sheet = await win.webContents.capturePage();
  fs.writeFileSync(`docs/assets/${OUT}.png`, sheet.toPNG());

  const rects = await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".dir")].map((el) => {
       const r = el.getBoundingClientRect();
       return { x: r.x, y: r.y, width: r.width, height: r.height };
     })`,
    true,
  );
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    const img = await win.webContents.capturePage({
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
    fs.writeFileSync(`docs/assets/${OUT}-${NAMES[i] ?? i + 1}.png`, img.toPNG());
  }

  console.log(`shot → docs/assets/${OUT}.png（+ 单列）`);
  app.quit();
});
