/**
 * 设计稿真机截图：加载 docs 下的 mockup HTML，按样式逐个截。
 *
 * 跑法：npx electron scripts/mockup-shots.mjs docs/mockup-20-six-styles.html
 * 产物：docs/assets/mockups/<view>.png（默认 1334×747）
 *
 * 为什么必须有这个脚本：
 *   15 号交付闸要求"95 分才能输出"，但 2026-11-03 出现过
 *   **靠想象打 96 分、真实渲染却是重叠/浑浊** 的事故。
 *   评分前必须先出图，看不下去就是没到 95。
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const target = process.argv[2] ?? "docs/mockup-20-six-styles.html";
const outDir = path.resolve("docs/assets/mockups");
const views = (process.env.VIEWS ?? "g,s,w,c,p,l").split(",");
const size = (process.env.SIZE ?? "1334x747").split("x").map(Number);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: size[0],
    height: size[1],
    useContentSize: true,
    show: true, // 隐藏窗口会被节流，动画停在第一帧
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  await win.loadFile(path.resolve(target));
  /* ZOOM=2 模拟 200% 系统缩放：字变大而盒子不变，是最常见的真实崩坏。
     **必须每次显式设置**：Electron 的 zoomFactor 按 origin 持久化，
     设过一次 2 之后，不设就会一直带着 2 倍 —— 我因此误判过好几张"崩了"的图。*/
  win.webContents.setZoomFactor(Number(process.env.ZOOM || 1));
  await sleep(700);

  fs.mkdirSync(outDir, { recursive: true });

  /* DATA=worst：截图前先切到"最差数据"（压测用），dev-only 开关 */
  const dataState = process.env.DATA;
  if (dataState) {
    await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelector('#dt [data-d="${dataState}"]'); if (b) { b.click(); return true; } return false; })()`,
      true,
    );
    await sleep(500);
    console.log(`data=${dataState}`);
  }

  /* 单页设计稿（没有 #switch）：直接截一张，文件名用 html 的 basename */
  const hasSwitch = await win.webContents.executeJavaScript(
    `!!document.querySelector('#switch')`,
    true,
  );
  if (!hasSwitch) {
    /* 等 1.6s：单页稿常带入场/换句动画，太早截会截到"句与句之间的空档" */
    await win.webContents.executeJavaScript(
      `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 1600))))`,
      true,
    );
    const img = await win.webContents.capturePage();
    const base = path.basename(target, ".html");
    fs.writeFileSync(path.join(outDir, `${base}.png`), img.toPNG());
    console.log(`shot → docs/assets/mockups/${base}.png`);
    app.quit();
    return;
  }

  for (const v of views) {
    /* 点完必须回读"当前显示的是哪一个"，否则会截到上一条（假截图比没截更糟） */
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
      await win.webContents.executeJavaScript(
        `(() => {
          const b = document.querySelector('#switch button[data-v="${v}"]')
                || document.querySelector('[data-v="${v}"]');
          if (!b) return false;
          b.click();
          return true;
        })()`,
        true,
      );
      await sleep(420);
      ok = await win.webContents.executeJavaScript(
        `(() => {
          const b = document.querySelector('#switch button[data-v="${v}"]')
                || document.querySelector('nav button[data-v="${v}"]')
                || document.querySelector('[data-v="${v}"]');
          return !!(b && b.classList.contains('on'));
        })()`,
        true,
      );
      if (!ok) console.log(`retry ${v}（当前不是它）`);
    }
    /* DOM 切了不等于画面切了：合成器可能还停在上一条。
       等两帧 + 再睡 260ms，否则会截到上一个样式的画面（这个坑真踩过）。 */
    await win.webContents.executeJavaScript(
      `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 700))))`,
      true,
    );
    if (!ok) {
      console.log(`FAIL ${v}（切换未生效，已跳过，不当成功）`);
      continue;
    }
    const shown = await win.webContents.executeJavaScript(
      `document.querySelector('.view.on')?.dataset.view`,
      true,
    );
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${v}.png`), img.toPNG());
    console.log(`shot → docs/assets/mockups/${v}.png  (on=${shown})`);
  }

  app.quit();
});
