/**
 * 浮窗双件真机截图（2026-11-10 小窗 / 桌面歌词重设计验收）。
 *
 * 跑法：先 node scripts/build.mjs，再 npx electron scripts/float-shots.mjs
 * 产物：docs/assets/float-mini.png / float-mini-dark.png / float-lyric.png / float-lyric-big.png
 *
 * 不复用 main/index.ts（它会自己开主窗）：这里按 miniWindow.ts / lyricWindow.ts
 * 同款参数开窗、用同一份 dist 产物（preload + html + css）加载，
 * 然后直接往窗口 send 投影包 —— 与 mini-bridge / lyric-bridge 推的是同一种 JSON。
 * 桌面歌词的「字号放大 → 窗高自适应」要在真窗上验：这是本轮修的 BUG。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const DIST = path.resolve("dist");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const failures = [];
  process.on("uncaughtException", (err) => {
    failures.push(err);
  });

  /**
   * 拍一张图。空图不写盘（page-shots 同款纪律：0 字节 PNG 长得像证据）。
   */
  const shoot = async (win, name) => {
    await win.webContents.executeJavaScript(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
      true,
    );
    let img = await win.webContents.capturePage();
    if (img.isEmpty()) {
      await sleep(400);
      img = await win.webContents.capturePage();
    }
    if (img.isEmpty()) {
      failures.push(new Error(`${name} 截到空图`));
      return false;
    }
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log(`shot → docs/assets/${name}`);
    return true;
  };

  /* ---------- 迷你窗 ---------- */
  // 假封面：真封面是 dataURL/URL，这里在页面里现画一张（同源 canvas → dataURL）
  const mini = new BrowserWindow({
    width: 420,
    height: 136,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    webPreferences: {
      preload: path.join(DIST, "mini-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await mini.loadFile(path.join(DIST, "renderer", "mini.html"));
  await sleep(400);

  const cover = await mini.webContents.executeJavaScript(
    `(() => {
      const c = document.createElement("canvas");
      c.width = 160; c.height = 160;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 160, 160);
      grad.addColorStop(0, "#1d3a4a");
      grad.addColorStop(1, "#0d1418");
      g.fillStyle = grad;
      g.fillRect(0, 0, 160, 160);
      g.fillStyle = "rgba(255,200,120,0.85)";
      g.beginPath(); g.arc(80, 72, 26, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.lineWidth = 3;
      g.beginPath(); g.arc(80, 72, 40, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.font = "13px sans-serif";
      g.fillText("夜行电台", 56, 136);
      return c.toDataURL("image/png");
    })()`,
    true,
  );

  const pushMini = (payload) => mini.webContents.send("mini:state", JSON.stringify(payload));

  pushMini({
    status: "playing",
    title: "街口的风把夜吹得很薄",
    t: 94000,
    dur: 242000,
    lyric: "路灯把影子拉得很长",
    tr: "Streetlights stretch the shadows long",
    cover,
    theme: "light",
  });
  await sleep(600);
  await shoot(mini, "float-mini.png");

  // 夜间主题（投影包带 theme，验证「小窗不吃主题」这个 BUG 修没修好）
  pushMini({ theme: "dark", status: "playing", lyric: "唱片转到第三圈", t: 172000, dur: 242000 });
  await sleep(500);
  const themed = await mini.webContents.executeJavaScript(
    `document.documentElement.dataset.theme ?? ""`,
    true,
  );
  if (themed !== "dark") failures.push(new Error(`迷你窗主题没跟上：${themed}`));
  await shoot(mini, "float-mini-dark.png");

  /* ---------- 桌面歌词 ---------- */
  // harness 没有 main/lyricWindow.ts，`lyric:resize` 得在这里复刻同款 handler
  // （夹紧 96–420、宽度不变、y 不动）——否则渲染层报了高度也没人接，窗永远 132。
  let lyricWin = null;
  ipcMain.on("lyric:resize", (_e, h) => {
    if (typeof h !== "number" || !Number.isFinite(h) || !lyricWin || lyricWin.isDestroyed()) return;
    const next = Math.min(420, Math.max(96, Math.round(h)));
    const [w] = lyricWin.getSize();
    if (lyricWin.getBounds().height !== next) lyricWin.setSize(w, next);
  });
  const lyric = new BrowserWindow({
    width: 720,
    height: 132,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(DIST, "lyric-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 透明窗截图要能看到底下的"桌面"：抓屏抓到的是窗内合成结果，透明区是黑的 —— 可接受，
  // 重点是胶囊与文字的层次。
  await lyric.loadFile(path.join(DIST, "renderer", "lyric.html"));
  lyricWin = lyric;
  await sleep(400);

  const pushLyric = (payload) => lyric.webContents.send("lyric:state", JSON.stringify(payload));

  const before = lyric.getBounds().height;
  pushLyric({
    text: "街口的风把夜吹得很薄",
    translation: "Streetlights stretch the shadows long",
    lit: 9,
    song: 0.42,
    mode: "interactive",
  });
  await sleep(700);
  const mid = lyric.getBounds().height;
  await shoot(lyric, "float-lyric.png");

  // 字号放大 → 渲染层申请改高 → 窗真的变高（本轮修的「定高裁字」BUG）
  await lyric.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll(".lyric-tools button")].find((x) => x.title === "字号放大"); b?.click(); b?.click(); b?.click(); return true; })()`,
    true,
  );
  await sleep(800);
  const after = lyric.getBounds().height;
  console.log(`歌词窗高：初始 ${before} → 有词 ${mid} → 放大后 ${after}`);
  if (after <= mid) failures.push(new Error(`放大字号后窗高没变：${mid} → ${after}`));
  await shoot(lyric, "float-lyric-big.png");

  // 空态：胶囊缩成台标
  pushLyric({ text: "", mode: "interactive" });
  await sleep(600);
  await shoot(lyric, "float-lyric-idle.png");

  mini.destroy();
  lyric.destroy();
  if (failures.length) {
    console.error(failures.map((e) => `✗ ${e.message}`).join("\n"));
    app.exit(1);
    return;
  }
  console.log("float-shots ok");
  app.quit();
});
