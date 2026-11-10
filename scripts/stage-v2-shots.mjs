/**
 * 播放页「演出升级」概念图截屏：把 design-demos/stage-v2/index.html 里每个
 * 画板（[data-shot]）按 1:1 裁出来存进 docs/assets/mockups/next-*.png。
 *
 * 跑法：unset ELECTRON_RUN_AS_NODE && npx electron scripts/stage-v2-shots.mjs
 *
 * 与 stage-demo-shots.mjs 的分工：那个整窗截一页（一页一稿），
 * 这个按元素裁（一页三稿，方便三张图并排看差异）。
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? "design-demos/stage-v2/index.html";
const prefix = process.env.PREFIX ?? "next";
const OUT = path.join(root, "docs/assets/mockups");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 560,
    useContentSize: true,
    show: true,
    backgroundColor: "#12100f",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.webContents.setZoomFactor(1);
  await win.loadFile(path.join(root, target));
  await sleep(600);

  const names = await win.webContents.executeJavaScript(
    `[...document.querySelectorAll("[data-shot]")].map((el) => el.dataset.shot)`,
    true,
  );

  fs.mkdirSync(OUT, { recursive: true });
  for (const name of names) {
    /* 一次只留一块画板、窗口正好 1080x560：
       早先的做法是整页滚动 + capturePage(rect)，但 rect 与滚动量的坐标口径不一致，
       截出来会带上标题和下一块画板（实测偏 60px）。 */
    await win.webContents.executeJavaScript(
      `(() => {
        document.body.style.padding = "0";
        document.body.style.margin = "0";
        for (const c of document.querySelectorAll(".cap")) c.style.display = "none";
        for (const b of document.querySelectorAll(".board")) {
          const keep = Boolean(b.querySelector('[data-shot="${name}"]'));
          b.style.display = keep ? "block" : "none";
          b.style.margin = "0";
        }
        window.scrollTo(0, 0);
        return true;
      })()`,
      true,
    );
    // 两帧合成器提交再截：窗口刚 show 出来时 capturePage 会拿到空 buffer（0 字节，实测）
    await win.webContents.executeJavaScript(
      "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 320))))",
      true,
    );
    let png = (await win.webContents.capturePage()).toPNG();
    if (png.length < 1000) {
      await sleep(500);
      png = (await win.webContents.capturePage()).toPNG();
    }
    const file = path.join(OUT, `${prefix}-${name}.png`);
    fs.writeFileSync(file, png);
    console.log(`shot → ${path.relative(root, file)} (${png.length} bytes)`);
  }

  win.destroy();
  app.quit();
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
