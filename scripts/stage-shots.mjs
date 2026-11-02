/**
 * 四套预设截图（M6-3c 判据：肉眼可区分、控件不位移）。
 *
 * 跑法：先 npm run build，再 npx electron scripts/stage-shots.mjs
 * 产物：docs/assets/stage-<preset>.png（四张）
 *
 * 做法：加载真实 renderer（不是 mock），切到播放页，逐套点预设按钮，
 * 等过渡结束 capturePage。空态截图（无封面/无歌词数据）——四套的差异
 * 在壁纸纹理、封面形状与阴影、控件布局上肉眼可辨。
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const PRESETS = ["paper", "vinyl", "minimal", "cinema"];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 1100, show: true }); // 可见：隐藏窗口会被节流，React 更新迟一拍
  await win.loadFile(path.resolve("dist/renderer/index.html"));
  await new Promise((r) => setTimeout(r, 800)); // 曲库恢复 / 首帧渲染

  fs.mkdirSync(OUT, { recursive: true });

  // 切到播放页（tab 顺序：本地 / 在线 / 播放页）
  await win.webContents.executeJavaScript(
    `document.querySelectorAll('.lib-tabs button')[2].click()`,
    true,
  );
  // 截图 fixture：收掉 .stage 的 min-height，让控件层入镜（只改活 DOM，不进产品代码）
  await win.webContents.executeJavaScript(
    `document.querySelector('.stage').style.minHeight = '0'`,
    true,
  );
  await new Promise((r) => setTimeout(r, 300));

  const PRESET_NAMES = ["纸面剧场", "黑胶唱机", "极简留白", "电影感"];
  for (let i = 0; i < PRESETS.length; i += 1) {
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('.st-presets button')[${i}].click()`,
      true,
    );
    // 不赌时间：轮询到高亮按钮真的变成目标预设再拍（隐藏/节流窗口下固定 sleep 会迟一拍）
    const ok = await win.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const want = ${JSON.stringify(PRESET_NAMES[i])};
        const deadline = Date.now() + 5000;
        const tick = () => {
          const on = document.querySelector('.st-presets button.on')?.textContent;
          if (on === want) return resolve(true);
          if (Date.now() > deadline) return resolve(false);
          setTimeout(tick, 50);
        };
        tick();
      })`,
      true,
    );
    if (!ok) throw new Error(`预设 ${PRESET_NAMES[i]} 未在 5s 内生效`);
    await new Promise((r) => setTimeout(r, 600)); // --stage-dur 过渡（最长 400ms）走完
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `stage-${PRESETS[i]}.png`), img.toPNG());
    console.log(`shot → docs/assets/stage-${PRESETS[i]}.png`);
  }

  app.quit();
});
