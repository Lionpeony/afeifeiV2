/**
 * 播放页重设计稿真机截图。
 *
 * 跑法：unset ELECTRON_RUN_AS_NODE && npx electron scripts/stage-demo-shots.mjs design-demos/stage-redesign/a-vinyl-void.html ...
 * 产物：同目录同名 .png
 *
 * 为什么要真机截图：这套稿大量使用 conic/radial 渐变、mask、mix-blend-mode，
 * 只靠脑内推演判断不了"暗部有没有糊成一团"。
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2).filter((f) => f.split("#")[0].endsWith(".html"));
const size = (process.env.SIZE ?? "1334x747").split("x").map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: size[0],
    height: size[1],
    useContentSize: true,
    show: true,
    backgroundColor: "#000000",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.webContents.setZoomFactor(Number(process.env.ZOOM || 1));

  for (const raw of files) {
    /* 支持 "x.html#light"：hash 既交给页面自己的启动脚本，也进文件名，
       这样一稿两皮可以并排出图对照（深/浅不能靠记忆比对） */
    const [f, hash] = raw.split("#");
    await win.loadFile(path.resolve(f), hash ? { hash } : undefined);
    /* hash 不一定能在页面首帧前读到（脚本时机各异），显式再设一次：
       稿子统一用 <html data-theme> 承载皮肤 */
    if (hash) {
      await win.webContents.executeJavaScript(
        `document.documentElement.dataset.theme = ${JSON.stringify(hash)}; true`,
        true,
      );
    }
    /* 等入场动画落定，且两帧合成器提交（Electron 会截到上一个页面） */
    await win.webContents.executeJavaScript(
      `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 900))))`,
      true,
    );
    const img = await win.webContents.capturePage();
    const out = path.resolve(f).replace(/\.html$/, `${hash ? `-${hash}` : ""}.png`);
    fs.writeFileSync(out, img.toPNG());
    console.log(`shot → ${path.relative(process.cwd(), out)}`);
  }
  app.quit();
});
