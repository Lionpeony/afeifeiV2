/**
 * 直播带外壳截图（首页直播面 / 站尺 / 加入直播 / 换房间 / Esc 回落）。
 *
 * 跑法：先 node scripts/build.mjs，再 npx electron scripts/live-shots.mjs
 * 产物：docs/assets/mockups/live-home-<w>.png ×3、live-home-empty-<w>.png ×3、
 *       live-stage.png、live-room-local.png、live-room-local-1024x768.png
 *
 * fixture 纪律与 page-shots/stage-shots 一致：自开窗口 + 最小 IPC + 临时 userData，
 * 不动真实索引。曲库用真实形状的 18 首（三张专辑成组，节目表才排得出多档），
 * 音频由脚本现场合成静音 WAV，时长跟着曲目元数据走 —— 截图里控制台读数和表格对得上。
 */
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve("docs/assets/mockups");
const PROFILE = path.join(os.tmpdir(), `afeifei-live-${process.pid}`);

protocol.registerSchemesAsPrivileged([
  { scheme: "appmedia", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setPath("userData", PROFILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 合成一段**有声** WAV：不是音乐，是"有真实波形结构"的测试信号。
 * 目的：analyser 驱动的频谱柱 / 信号表 / 唱片纹路在截图里有内容，不再是平线。
 * 16kHz 单声道 16bit；seed 由曲目下标派生（同曲同波形）。
 */
const SAMPLE_RATE = 16000;
const wavFor = (seconds, seed = 0) => {
  const frames = SAMPLE_RATE * seconds;
  const dataLen = frames * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);

  // mulberry32：确定性伪随机，同 seed 同波形，截图可复现
  let state = (seed * 2654435761) >>> 0;
  const rnd = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // 3–5 个分音，基频在 110–440Hz 之间按 seed 散开
  const partials = Array.from({ length: 3 + (seed % 3) }, (_, i) => ({
    freq: 110 * Math.pow(2, (i * 7 + (seed % 5)) / 12),
    amp: 0.16 / (i + 1),
    phase: rnd() * Math.PI * 2,
  }));
  // 高频"空气感"：让频谱右半也有内容，不是一条只亮左端的低音线
  const air = Array.from({ length: 4 }, () => ({
    freq: 1200 + rnd() * 5000,
    amp: 0.045 + rnd() * 0.035,
    phase: rnd() * Math.PI * 2,
  }));
  const beatPeriod = 0.44 + (seed % 5) * 0.04; // 0.44–0.60s，约 100–136 BPM
  const barPeriod = beatPeriod * 8; // 每 8 拍抬一次，模拟副歌起伏

  for (let i = 0; i < frames; i += 1) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const p of partials) v += Math.sin(2 * Math.PI * p.freq * t + p.phase) * p.amp;
    for (const p of air) v += Math.sin(2 * Math.PI * p.freq * t + p.phase) * p.amp;
    // 节拍：底鼓式指数衰减 + 低频扫弦
    const bt = t % beatPeriod;
    v += Math.exp(-bt * 14) * 0.42 * Math.sin(2 * Math.PI * (48 + (seed % 4) * 6) * t);
    // 副歌段：每 8 拍的前两拍整体抬 35%
    const barT = t % barPeriod;
    if (barT < beatPeriod * 2) v *= 1.35;
    // 低幅噪声垫底（约 -34dB），避免频谱过于干净
    v += (rnd() * 2 - 1) * 0.02;
    // 4 秒淡入淡出：截图时不会爆音，也不会一上来就满幅
    const fade = Math.min(1, t / 4, (seconds - t) / 4);
    v *= Math.max(0, fade);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  return buf;
};

const TRACKS = [
  // 三张专辑、每张 6 首：真实曲库里节目按专辑成档，标题才会跟着换
  ["以父之名", "周杰伦", "叶惠美", 342000],
  ["懦夫", "周杰伦", "叶惠美", 210000],
  ["晴天", "周杰伦", "叶惠美", 269000],
  ["三年二班", "周杰伦", "叶惠美", 280000],
  ["东风破", "周杰伦", "叶惠美", 315000],
  ["你听得到", "周杰伦", "叶惠美", 240000],
  ["江南", "林俊杰", "第二天堂", 268000],
  ["第二天堂", "林俊杰", "第二天堂", 260000],
  ["子弹列车", "林俊杰", "第二天堂", 243000],
  ["起床了", "林俊杰", "第二天堂", 249000],
  ["美人鱼", "林俊杰", "第二天堂", 253000],
  ["距离", "林俊杰", "第二天堂", 254000],
  ["浮夸", "陈奕迅", "U87", 285000],
  ["夕阳无限好", "陈奕迅", "U87", 264000],
  ["阿牛", "陈奕迅", "U87", 272000],
  ["葡萄成熟时", "陈奕迅", "U87", 274000],
  ["烂", "陈奕迅", "U87", 252000],
  ["怕死", "陈奕迅", "U87", 243000],
].map(([title, artist, album, durationMs], i) => ({
  id: `c:/live/${i}.wav`,
  path: `C:/live/${i}.wav`,
  title,
  artist,
  album,
  durationMs,
  size: 400000,
  mtimeMs: 1000 + i,
  hasCover: true,
}));

/* 封面同样是现场合成的：真实曲库有内嵌封面，fixture 给每张专辑一张 SVG 封套，
   直播间的白盘/唱片才不会是一块空白。构图按专辑名散开——三张专辑不该长得一样。 */
const COVER_ART = {
  叶惠美: ["#d8c7a0", "#3b2f1c", "#9a7734"],
  第二天堂: ["#1d3a52", "#e6e1d4", "#5aa0c8"],
  U87: ["#3b2333", "#eee2dc", "#b46f8a"],
  夜行电台: ["#101820", "#e8e2d6", "#5f7f9a"],
};

const hashOf = (s) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/** 三种构图：同心圆 / 斜切条 / 网格。同一专辑名永远同一张。 */
const coverMotif = (kind, motif) => {
  if (kind === 0) {
    return (
      `<circle cx="200" cy="168" r="118" fill="none" stroke="${motif}" stroke-width="2"/>` +
      `<circle cx="200" cy="168" r="86" fill="none" stroke="${motif}" stroke-width="1" opacity="0.7"/>` +
      `<circle cx="200" cy="168" r="8" fill="${motif}"/>`
    );
  }
  if (kind === 1) {
    const bars = [0, 1, 2, 3, 4, 5]
      .map((i) => `<rect x="${60 + i * 48}" y="${70 + ((i * 37) % 90)}" width="28" height="200" fill="${motif}" opacity="${0.35 + i * 0.1}"/>`)
      .join("");
    return bars;
  }
  const grid = [];
  for (let x = 0; x < 4; x += 1) {
    for (let y = 0; y < 4; y += 1) {
      if ((x * 5 + y * 3) % 4 === 0) continue;
      grid.push(`<rect x="${62 + x * 72}" y="${52 + y * 72}" width="58" height="58" fill="none" stroke="${motif}" stroke-width="1.5"/>`);
    }
  }
  return grid.join("");
};

const coverOf = (album) => {
  const [bg, fg, motif] = COVER_ART[album] ?? ["#2a2c30", "#e8e4da", "#8a8f98"];
  const kind = hashOf(album) % 3;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">` +
    `<rect width="400" height="400" fill="${bg}"/>` +
    coverMotif(kind, motif) +
    `<text x="200" y="352" text-anchor="middle" font-family="Georgia, serif" font-size="32" fill="${fg}">${album}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/* 每日推荐 fixture：8 首，第 2 档（「玻璃海」）是首页那条判据的目标——
   点它之后左栏大字必须换成它，换的时候还要有一次切档动画。 */
const DAILY = [
  ["平交道", "陆声", 214000],
  ["玻璃海", "陆声", 236000],
  ["慢速快门", "方续", 198000],
  ["三号站台", "方续", 245000],
  ["潮汐表", "陆声", 262000],
  ["远光灯", "方续", 187000],
  ["冷启动", "陆声", 221000],
  ["末班车", "方续", 253000],
].map(([name, artist, dt], i) => ({
  id: `daily-${i}`,
  name,
  ar: [{ name: artist }],
  al: { name: "夜行电台", picUrl: coverOf("夜行电台") },
  dt,
}));

/* 原创示例词（不是这几首歌的真词）：只为让播放页的台词本有内容可排。
   时间轴铺到 2:18，三分钟左右的曲目都够用。 */
const DEMO_LRC = [
  "[00:06.00]灯一盏一盏亮起",
  "[00:13.00]街口的风把夜吹得很薄",
  "[00:20.00]有人推门进来 带一身潮气",
  "[00:27.50]点了一首没听过的歌",
  "[00:35.00]唱片转到第三圈",
  "[00:42.00]窗外的雨刚好停",
  "[00:49.00]我们把白天关在门外",
  "[00:56.00]只说今晚不散",
  "[01:04.00]收音机里有人在报时",
  "[01:11.00]三点的城市像一张旧照片",
  "[01:18.00]谁把音量调小了一点",
  "[01:25.00]让呼吸也变成节拍",
  "[01:33.00]不夜台 灯还亮着",
  "[01:40.00]下一档节目在等你",
  "[01:48.00]如果你也路过这里",
  "[01:55.00]就坐下来听完这一首",
  "[02:10.00]唱片转到最后一圈",
  "[02:18.00]天亮之前 谁都不许走",
].join("\n");

/** 每条路径按自己的时长现做一个 WAV；多给 2 秒，接驳点落在曲尾也还有余量。 */
const WAV_BY_PATH = new Map();
const wavOf = (p) => {
  if (!WAV_BY_PATH.has(p)) {
    const idx = TRACKS.findIndex((t) => t.path === p);
    const ms = idx >= 0 ? TRACKS[idx].durationMs : 240000;
    WAV_BY_PATH.set(p, wavFor(Math.ceil(ms / 1000) + 2, Math.max(0, idx)));
  }
  return WAV_BY_PATH.get(p);
};

function registerMinimalIpc() {
  const file = (name) => path.join(PROFILE, name);
  const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
  const writeFile = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };

  ipcMain.handle("library:loadIndex", () => readFile(file("library.json")));
  ipcMain.handle("library:saveIndex", (_e, json) => writeFile(file("library.json"), json));
  ipcMain.handle("library:readLog", () => "");
  ipcMain.handle("library:appendLog", () => undefined);
  ipcMain.handle("library:clearLog", () => undefined);
  ipcMain.handle("library:cover", (_e, p) => {
    const track = TRACKS.find((t) => t.path === p);
    return track ? coverOf(track.album) : null;
  });
  ipcMain.handle("library:localLyric", () => ({ text: DEMO_LRC, source: "local" }));
  ipcMain.handle("media:grant", (_e, p) => (typeof p === "string" ? Buffer.from(p, "utf8").toString("hex") : null));
  ipcMain.handle("store:read", (_e, key) => readFile(file(`store-${String(key)}.json`)));
  ipcMain.handle("store:write", (_e, key, json) => writeFile(file(`store-${String(key)}.json`), json));
  ipcMain.handle("app-state:load", () => null);
  ipcMain.handle("app-state:save", () => undefined);
  ipcMain.handle("app:lastCrash", () => null);
  ipcMain.handle("download:usage", () => 0);
  ipcMain.handle("download:dir", () => PROFILE);
  ipcMain.handle("library:roots", () => ["D:\\Music\\华语"]);
  ipcMain.handle("app:autoLaunch", () => false);
  ipcMain.handle("notify:show", () => true);
  // 账号态：首页左栏要「正在播放的那一档」，没有每日推荐就整块不出现，
  // 所以 fixture 给一个已登录账号 + 8 首固定推荐（放在这里才发现得早）
  ipcMain.handle("netease:profile", () => ({ loggedIn: true, nick: "夜航测试", uid: 9527 }));
  ipcMain.handle("netease:call", (_e, method) => {
    if (method === "recommend_songs") return { data: { dailySongs: DAILY } };
    // 搜索：给前 3 首，够验「结果落地」
    if (method === "cloudsearch") return { result: { songs: DAILY.slice(0, 3), songCount: 3 } };
    // 榜单：3 个榜够验「目录 → 下钻 → 选中态」，不用 65 个
    if (method === "toplist") {
      return {
        list: [
          { id: 901, name: "夜航飙升榜", trackCount: 100, coverImgUrl: coverOf("夜行电台") },
          { id: 902, name: "夜航新歌榜", trackCount: 100, coverImgUrl: coverOf("叶惠美") },
          { id: 903, name: "夜航热歌榜", trackCount: 50, coverImgUrl: coverOf("第二天堂") },
        ],
      };
    }
    // 6 首才够让「前三名台柱 + 第 4 名起列表」两段都吃到数据
    if (method === "playlist_track_all") return { songs: DAILY.slice(0, 6), total: 6 };
    // 取流：给一条假地址，media:grant 会把它换成 appmedia:// 的本地 WAV
    if (method === "song_url" || method === "song_url_v1") {
      return { data: [{ url: "http://fixture.local/track.wav", fee: 0 }] };
    }
    if (method === "likelist") return { ids: [] };
    return {};
  });
  // QQ 源起来后启动就会问一次 profile；fixture 不登录，给空账号免得刷红字
  ipcMain.handle("qq:profile", () => ({ loggedIn: false, nick: null, uid: null }));
  ipcMain.handle("qq:call", () => ({}));
  // 外壳订阅了这两个 IPC；fixture 不跑主进程那套主题/轮询，给空实现免得刷红字
  ipcMain.handle("win:overlayTheme", () => undefined);
  ipcMain.handle("scheme:poll", () => null);

  protocol.handle("appmedia", async (request) => {
    const host = new URL(request.url).hostname;
    let requested;
    try {
      requested = Buffer.from(host, "hex").toString("utf8");
    } catch {
      return new Response("bad token", { status: 400 });
    }
    const wav = wavOf(requested);
    return new Response(wav, {
      status: 200,
      headers: { "content-type": "audio/wav", "content-length": String(wav.length), "accept-ranges": "bytes" },
    });
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  const seeded = process.env.LIVE_EMPTY === "1" ? [] : TRACKS;
  fs.writeFileSync(path.join(PROFILE, "library.json"), JSON.stringify({ v: 1, tracks: seeded, savedAt: Date.now() }));
  registerMinimalIpc();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,
    show: true,
    webPreferences: {
      preload: path.resolve("dist/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.resolve("dist/renderer/index.html"));
  await sleep(900);

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`✗ 渲染进程结束：${details.reason}（exitCode ${details.exitCode}）`);
  });
  win.webContents.on("console-message", (_e, level, message, lineNo, sourceId) => {
    if (level >= 2) console.error(`  renderer: ${message} @ ${sourceId}:${lineNo}`);
  });

  fs.mkdirSync(OUT, { recursive: true });

  const shoot = async (name) => {
    // 光标停在窗口里会触发 :hover（队列行会浮出上移/移除按钮压住时长），截图前挪到角落
    win.webContents.sendInputEvent({ type: "mouseMove", x: 4, y: 4 });
    await win.webContents.executeJavaScript(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
      true,
    );
    let img = await win.webContents.capturePage();
    if (img.isEmpty()) {
      await sleep(500);
      img = await win.webContents.capturePage();
    }
    if (img.isEmpty()) {
      console.error(`✗ ${name} 截到空图，跳过`);
      return false;
    }
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log(`shot → docs/assets/mockups/${name}`);
    return true;
  };

  const evalJs = (code) => win.webContents.executeJavaScript(code, true);
  const click = async (code, label) => {
    const ok = await evalJs(code);
    if (!ok) throw new Error(`点不到：${label}`);
    await sleep(500);
    return ok;
  };

  const alive = await evalJs(`document.querySelector(".live-home") !== null`);
  if (!alive) throw new Error("首页不是直播面：.live-home 不在（shell 默认被切成了 plain？）");

  const sfx = process.env.LIVE_EMPTY === "1" ? "-empty" : "";

  // 站尺排版判据（三档都跑）：整页不横滚、刻度不折行、搜索槽不压到右端信息组、
  // 账号只占一个头像。放在首页这一轮里跑——后面直播/切房间失败也不会把这几条带下去。
  const probeRuler = async (w, h) => {
    const probe = await evalJs(`(() => {
      const de = document.documentElement;
      const clock = document.querySelector(".ruler-clock");
      const acct = document.querySelector(".ruler-acct");
      const search = document.querySelector(".ruler-search");
      const ticks = [...document.querySelectorAll(".ruler-tick")];
      const clockRect = clock?.getBoundingClientRect();
      const searchRect = search?.getBoundingClientRect();
      return {
        w: innerWidth,
        overflowX: de.scrollWidth > de.clientWidth + 1,
        wrapped: ticks.some((t) => (t.querySelector("span")?.getBoundingClientRect().height ?? 0) > 22),
        tickRight: ticks.length ? Math.round(Math.max(...ticks.map((t) => t.getBoundingClientRect().right))) : 0,
        searchW: searchRect ? Math.round(searchRect.width) : 0,
        searchOverlap: searchRect && clockRect ? searchRect.right > clockRect.left + 1 : false,
        acctW: acct ? Math.round(acct.getBoundingClientRect().width) : 0,
        clockBorder: clock ? getComputedStyle(clock).borderTopWidth : "",
      };
    })()`);
    console.log(`排版 ${w}x${h}：${JSON.stringify(probe)}`);
    if (probe.overflowX) throw new Error(`${w} 宽横向溢出`);
    if (probe.wrapped) throw new Error(`${w} 宽站尺刻度折行`);
    if (probe.searchOverlap) throw new Error(`${w} 宽搜索槽压到右端信息组`);
    if (probe.searchW < 160) throw new Error(`${w} 宽搜索槽被压到 ${probe.searchW}px`);
    if (probe.acctW > 40) throw new Error(`${w} 宽账号入口 ${probe.acctW}px（应只剩头像）`);
    if (probe.clockBorder !== "0px") throw new Error(`${w} 宽右端信息组还在画边框面板`);
  };

  // 三档分辨率：只动内容尺寸，拍同一面
  for (const [w, h] of [
    [1024, 768],
    [1280, 800],
    [1440, 900],
  ]) {
    win.setContentSize(w, h);
    await sleep(500);
    await shoot(`live-home${sfx}-${w}x${h}.png`);
    await probeRuler(w, h);
    if (process.env.LIVE_EMPTY !== "1") {
      const tapes = await evalJs(`document.querySelectorAll(".cs-tape").length`);
      console.log(`播出带 ${w}x${h}：${tapes} 档`);
    }
  }

  if (process.env.LIVE_EMPTY !== "1") {
    /* 左栏跟着播放走：点播出带第 2 格 → 大字换成那一首，且换上来那一下封套与文案各播一次。
       旧实现把左栏锁死在 songs[0]，这条必红。 */
    const heroBefore = await evalJs(`document.querySelector(".cs-title")?.textContent ?? ""`);
    const tapeTitle = await evalJs(`(() => {
      const b = document.querySelectorAll(".cs-tape")[1];
      if (!b) return null;
      const t = b.querySelector(".cs-tape-title")?.textContent ?? "";
      window.__swapAnim = [];
      const t0 = performance.now();
      /* 只认阶段内的元素：页面上还有一个同名 .cs-cover（别处），
         只查 .cs-stage 才拿得到真正换档的那两张。
         只认 running：初始挂载那条早已结束（fill: both 会留在列表里）。 */
      const tick = () => {
        for (const sel of [".cs-stage .cs-copy", ".cs-stage .cs-cover"]) {
          const el = document.querySelector(sel);
          if (!el) continue;
          for (const a of el.getAnimations()) {
            const name = String(a.animationName);
            if (a.playState === "running" && !window.__swapAnim.includes(name)) window.__swapAnim.push(name);
          }
        }
        if (window.__swapAnim.length >= 2 || performance.now() - t0 > 3000) return;
        requestAnimationFrame(tick);
      };
      b.click();
      tick();
      return t;
    })()`);
    if (!tapeTitle) throw new Error("播出带没有第 2 格：fixture 的每日推荐没生效");
    await sleep(1800);
    const hero = await evalJs(`(() => ({
      title: document.querySelector(".cs-title")?.textContent ?? "",
      kicker: document.querySelector(".cs-kicker")?.textContent ?? "",
      idx: document.querySelector(".cs-idx")?.textContent ?? "",
      ord: document.querySelector(".cs-ord")?.textContent ?? "",
      liveTape: document.querySelectorAll(".cs-tape.is-live").length,
      anim: window.__swapAnim ?? [],
    }))()`);
    console.log(
      `首页换档：点播出带第 2 格「${tapeTitle}」→ 大字「${hero.title}」·${hero.idx.trim()}·在播标记 ${hero.liveTape}·动画 ${JSON.stringify(hero.anim)}`,
    );
    if (heroBefore === tapeTitle) throw new Error("第 1 档与第 2 格同名，这条判据没有意义");
    if (hero.title !== tapeTitle) throw new Error(`左栏没跟着切：期望「${tapeTitle}」，实际「${hero.title}」`);
    if (!hero.kicker.includes("ON AIR")) throw new Error("换档后眉标没变成「正在播出」");
    if (hero.liveTape < 1) throw new Error("播出带没有标记正在播的那一档");
    if (!hero.anim.some((n) => String(n).startsWith("cs-swap"))) {
      throw new Error(`换档没有播动画：${JSON.stringify(hero.anim)}`);
    }
    for (const want of ["cs-swap-copy", "cs-swap-cover"]) {
      if (!hero.anim.includes(want)) throw new Error(`换档缺 ${want}：${JSON.stringify(hero.anim)}`);
    }
    await shoot("live-home-playing.png");

    /* 不在这里验「暂停/继续」：fixture 的在线曲目是假地址（services.resolveOnlineUrl 直出
       CDN URL，不走本地协议），音轨永远卡在 buffering，player/toggle 会被重试链路顶回 playing。
       暂停分支只有真实曲目能验，留给真机手测。 */
  }

  if (process.env.LIVE_EMPTY === "1" || process.env.HOME_ONLY === "1") {
    if (process.env.HOME_ONLY === "1") {
      /* 在线页：搜索入口只在顶栏 —— 页内不许再有输入框，关键词要看得见，结果要落地。
         放在这一段是因为再往下的直播/切房间在离线 fixture 下本来就跑不通。 */
      await click(
        `(() => {
          const t = [...document.querySelectorAll(".ruler-tick")].find((b) => b.textContent?.includes("在线"));
          t?.click();
          return Boolean(t);
        })()`,
        "站尺「在线」",
      );
      await sleep(700);

      /* 默认落榜单：进「在线」时没有关键词，落结果视图只会是一片空地。
         顺带确认页内不再有搜索输入框（搜索只走顶栏）。 */
      const landing = await evalJs(`(() => ({
        charts: document.querySelectorAll(".pl-item.chart-item").length,
        inPageInput: Boolean(document.querySelector(".lib-head input, .lib-head.search, .lib-head .search")),
        rail: Boolean(document.querySelector(".chart-rail")),
      }))()`);
      console.log(`进在线页：榜单 ${landing.charts} 个·页内输入框 ${landing.inPageInput}·旧横排 ${landing.rail}`);
      if (landing.inPageInput) throw new Error("在线页里还留着搜索输入框（与顶栏重复）");
      if (landing.rail) throw new Error("榜单还是旧的横排 chip（.chart-rail）");
      if (landing.charts < 3) throw new Error(`默认没落在榜单：只拿到 ${landing.charts} 个榜`);

      /* 进页就该有内容：第一个榜自动选中，前三名已抬成台柱，第 4 名起进列表。
         旧实现是一整片空白 + 「左栏点一个榜」，这一条必红。 */
      const landed = await evalJs(`(() => ({
        on: document.querySelector(".pl-item.chart-item.on .pl-name")?.textContent ?? "",
        hero: document.querySelectorAll(".chart-hero-cell").length,
        rows: document.querySelectorAll(".lib-row.online-row").length,
        thead: Boolean(document.querySelector(".lib-thead")),
      }))()`);
      console.log(
        `进榜单页：自动选中「${landed.on}」·台柱 ${landed.hero} 格·列表 ${landed.rows} 行·表头 ${landed.thead}`,
      );
      if (!landed.on) throw new Error("进榜页没有自动选中任何榜，右半屏还是空的");
      if (landed.hero !== 3) throw new Error(`前三名台柱不是 3 格：${landed.hero}`);
      if (landed.rows < 1) throw new Error("第 4 名起的列表没渲染");
      if (!landed.thead) throw new Error("列表有行却没有表头");
      await shoot("charts-landing.png");

      const picked = await evalJs(`(() => {
        const items = [...document.querySelectorAll(".pl-item.chart-item")];
        const b = items[1];
        if (!b) return null;
        const name = b.querySelector(".pl-name")?.textContent ?? "";
        b.click();
        return name;
      })()`);
      await sleep(1200);
      const charts = await evalJs(`(() => ({
        on: document.querySelector(".pl-item.chart-item.on .pl-name")?.textContent ?? "",
        hero: document.querySelectorAll(".chart-hero-cell").length,
        rows: document.querySelectorAll(".lib-row.online-row").length,
        head: document.querySelector(".lib-list .list-now")?.textContent ?? "",
        ranks: [...document.querySelectorAll(".lib-row.online-row .lib-no")].map((n) => n.textContent),
      }))()`);
      console.log(
        `榜单下钻：点「${picked}」→ 选中「${charts.on}」·抬头「${charts.head.trim()}」·台柱 ${charts.hero}·列表 ${charts.rows} 行·名次 ${JSON.stringify(charts.ranks)}`,
      );
      if (charts.on !== picked) throw new Error(`选中态没跟上点击：点「${picked}」，选中「${charts.on}」`);
      if (!charts.head.includes(picked)) throw new Error(`右栏抬头没写榜名：${charts.head}`);
      if (charts.hero !== 3) throw new Error(`换榜后台柱不是 3 格：${charts.hero}`);
      if (charts.rows < 1) throw new Error("榜单曲目没落地");
      // 前三名在台柱上，列表名次必须从 04 起，且与行数一致
      if (charts.ranks.length !== charts.rows) throw new Error(`名次列缺行：${charts.ranks.length} 格 / ${charts.rows} 行`);
      if (charts.ranks[0] !== "04") throw new Error(`列表名次没从 04 起：${JSON.stringify(charts.ranks.slice(0, 3))}`);
      await shoot("charts-two-column.png");

      /* 最坏数据（break-ui）：超长中文歌名 / 超长英文专辑 / emoji。
         判据是横向不许溢出——列定宽的地方最容易在这里破。 */
      if (process.env.STRESS === "1") {
        await evalJs(`(() => {
          const rows = [...document.querySelectorAll(".lib-row.online-row")];
          const long = "这是一个非常非常长的歌名用来测试标题列在窄窗口下会不会把专辑列挤掉并且溢出";
          rows[0].querySelector(".lib-title").textContent = long;
          const arts = rows[0].querySelectorAll(".lib-artist");
          arts[0].textContent = "一个名字同样很长的独立音乐人组合";
          arts[1].textContent = "Extremely Long Album Name That Nobody Would Ever Type Out In Full (Deluxe Edition)";
          return rows.length;
        })()`);
        await sleep(300);
        const over = await evalJs(`(() => {
          const l = document.querySelector(".lib-list");
          return { scrollW: l.scrollWidth, clientW: l.clientWidth };
        })()`);
        console.log(`榜单最坏数据：scrollW ${over.scrollW} / clientW ${over.clientW}`);
        if (over.scrollW > over.clientW + 1) throw new Error(`榜单窄窗横向溢出：${JSON.stringify(over)}`);
        await shoot("charts-stress.png");
      }

      await evalJs(`(() => {
        const i = document.querySelector(".ruler-search input");
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(i, "晴天");
        i.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector(".ruler-search").requestSubmit();
        return true;
      })()`);
      await sleep(1600);
      const online = await evalJs(`(() => ({
        query: document.querySelector(".list-now b")?.textContent ?? "",
        rows: document.querySelectorAll(".online-row").length,
        rail: Boolean(document.querySelector(".result-rail")),
        tabs: [...document.querySelectorAll(".lib-tabs button")].map((b) => (b.textContent ?? "").trim()),
      }))()`);
      console.log(`在线页：关键词格「${online.query}」·结果 ${online.rows} 行·页头按钮 ${JSON.stringify(online.tabs)}`);
      if (online.query !== "晴天") throw new Error(`关键词格没显示当前搜索词：${JSON.stringify(online)}`);
      if (online.rows < 1) throw new Error(`顶栏提交后结果没落地：${JSON.stringify(online)}`);
      // 结果带与表格是同一批数据画两遍：删掉之后这里必须为 false
      if (online.rail) throw new Error("在线页还挂着与表格重复的结果带（.result-rail）");
      // 页头不许再出现「搜索」入口：搜索只走顶栏，页头只留「榜单」这个分支
      if (online.tabs.includes("搜索")) throw new Error(`页头还挂着一个搜索入口：${JSON.stringify(online.tabs)}`);
      if (online.tabs.length !== 1) throw new Error(`页头按钮应只剩榜单一颗：${JSON.stringify(online.tabs)}`);
      await shoot("online-search.png");

      /* 最坏数据（break-ui）：长标题 / 长专辑 / emoji。在线页比榜单少一列排名，
         但下载按钮是定宽，横向溢出要在这里当场抓住。 */
      if (process.env.STRESS === "1") {
        await evalJs(`(() => {
          const rows = [...document.querySelectorAll(".lib-row.online-row")];
          rows[0].querySelector(".lib-title").textContent =
            "这是一个非常非常长的歌名用来测试标题列在窄窗口下会不会把乐队和专辑一起挤爆并且溢出边界";
          const arts = rows[0].querySelectorAll(".lib-artist");
          arts[0].textContent = "一个名字同样很长的独立音乐人组合";
          arts[1].textContent = "Extremely Long Album Name That Nobody Would Ever Type Out In Full (Deluxe Edition)";
          rows[1].querySelector(".lib-title").textContent = "🎵🎵🎵 emoji 标题 🎵🎵🎵";
          return rows.length;
        })()`);
        await sleep(300);
        const over = await evalJs(`(() => {
          const l = document.querySelector(".lib-list");
          return { scrollW: l.scrollWidth, clientW: l.clientWidth };
        })()`);
        console.log(`在线最坏数据：scrollW ${over.scrollW} / clientW ${over.clientW}`);
        if (over.scrollW > over.clientW + 1) throw new Error(`在线窄窗横向溢出：${JSON.stringify(over)}`);
        await shoot("online-stress.png");
      }

      // 清空：关键词格消失、结果清掉、空态说明「去顶栏搜」
      await click(`(() => { const b = document.querySelector(".list-now-x"); b?.click(); return Boolean(b); })()`, "结果抬头清空");
      await sleep(400);
      const cleared = await evalJs(`(() => ({
        query: Boolean(document.querySelector(".list-now")),
        rows: document.querySelectorAll(".online-row").length,
        empty: document.querySelector(".lib-empty")?.textContent ?? "",
      }))()`);
      console.log(`清空后：关键词格 ${cleared.query}·结果 ${cleared.rows} 行·空态「${cleared.empty.trim()}」`);
      if (cleared.query) throw new Error("清空后关键词格还在");
      if (cleared.rows > 0) throw new Error(`清空后结果没清掉：${cleared.rows} 行`);
      if (!cleared.empty.includes("顶栏")) throw new Error(`空态没指向顶栏：${cleared.empty}`);
      await shoot("online-empty.png");
    }
    win.destroy();
    app.quit();
    return;
  }

  win.setContentSize(1280, 800);
  await sleep(400);

  // 动作一：加入直播 → 落在 stage（r4 引擎的直播壳）
  await click(
    `(() => {
      const b = [...document.querySelectorAll(".live-actions .live-btn")].find((x) => x.textContent.trim() === "加入直播");
      b?.click();
      return Boolean(b);
    })()`,
    "加入直播",
  );
  await sleep(1200);
  await shoot("live-stage.png");

  // 直播间是旧引擎嵌进壳里：量一下有没有元素顶出板面（右缘被裁=排版坏了，不是风格）
  const stageProbe = await evalJs(`(() => {
    const body = document.querySelector(".live-plate-body");
    const br = body?.getBoundingClientRect();
    if (!br) return { error: "no body" };
    const out = [];
    for (const el of body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > br.right + 1 || r.left < br.left - 1) {
        out.push({
          cls: (el.className && String(el.className).slice(0, 60)) || el.tagName,
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
        });
      }
    }
    return {
      body: { left: Math.round(br.left), right: Math.round(br.right), w: Math.round(br.width) },
      scrollW: body.scrollWidth, clientW: body.clientWidth,
      over: out.slice(0, 8), count: out.length,
    };
  })()`);
  console.log(`直播间溢出：${JSON.stringify(stageProbe)}`);
  if (stageProbe.scrollW > stageProbe.clientW + 1) {
    throw new Error(`直播间横向溢出：scrollWidth ${stageProbe.scrollW} > clientWidth ${stageProbe.clientW}`);
  }

  // 版式探针：播出条 / 正文 / 提词器必须全部落在舞台里，正文不能被挤没
  const stageLayout = await evalJs(`(() => {
    const rect = (el) => (el ? { top: Math.round(el.getBoundingClientRect().top), bottom: Math.round(el.getBoundingClientRect().bottom), h: Math.round(el.getBoundingClientRect().height) } : null);
    return {
      stage: rect(document.querySelector(".live-plate-body > .stage")),
      air: rect(document.querySelector(".st-air")),
      body: rect(document.querySelector(".st-body")),
      script: rect(document.querySelector(".st-script")),
    };
  })()`);
  console.log(`直播间版式：${JSON.stringify(stageLayout)}`);
  if (!stageLayout.script || !stageLayout.body) throw new Error("直播间缺少提词器或正文");
  if (stageLayout.script.bottom > stageLayout.stage.bottom + 1) throw new Error("提词器顶出舞台底边");
  if (stageLayout.body.h < 200) throw new Error(`直播间正文只剩 ${stageLayout.body.h}px`);

  // 点第 6 句（00:42）让歌词主视觉上屏，才能拍到曲中的播出面
  // 点一句歌词让主视觉上屏。播放时间在走，目标句可能已滚出提词器——
  // 找不到就退到当前句 / 首行，截图要的是「有一句在大屏」，不是某一句。
  await click(
    `(() => {
      const rows = [...document.querySelectorAll(".st-srow")];
      const b = rows.find((x) => x.textContent.includes("窗外的雨刚好停"))
        ?? rows.find((x) => x.classList.contains("cur"))
        ?? rows[0];
      b?.click();
      return Boolean(b);
    })()`,
    "提词器任一句",
  );
  await sleep(700);

  // 直播间三档：每档重新点一次第 6 句（曲目可能在这几秒里换档，重拍才能保证歌词主视觉在屏）
  for (const [w, h] of [
    [1024, 768],
    [1280, 800],
    [1440, 900],
  ]) {
    win.setContentSize(w, h);
    await sleep(500);
    await click(
      `(() => {
        const rows = [...document.querySelectorAll(".st-srow")];
        const b = rows.find((x) => x.textContent.includes("窗外的雨刚好停"))
          ?? rows.find((x) => x.classList.contains("cur"))
          ?? rows[0];
        b?.click();
        return Boolean(b);
      })()`,
      "提词器任一句",
    );
    await sleep(700);
    await shoot(`live-stage-${w}x${h}.png`);
  }

  // 视图浮层：灯位命名 + 深色面
  win.setContentSize(1280, 800);
  await sleep(400);
  await click(
    `(() => {
      const b = [...document.querySelectorAll(".st-air-tools .st-viewbtn")].find((x) => x.textContent.trim() === "视图");
      b?.click();
      return Boolean(b);
    })()`,
    "视图",
  );
  await sleep(400);
  await shoot("live-stage-menu.png");
  await evalJs(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(300);

  // 动作二：Esc 回落（stage 的 onBack 在 live 壳里指回上一间房）
  await evalJs(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);  await sleep(600);
  const backHome = await evalJs(`document.querySelector(".live-home") !== null`);
  if (!backHome) throw new Error("Esc 没回落首页直播面");

  // 动作三：站尺切房间（本地）
  await click(
    `(() => {
      const b = document.querySelector('.ruler-tick[data-page="local"]');
      b?.click();
      return Boolean(b);
    })()`,
    "站尺 · 本地",
  );
  await sleep(700);
  await shoot("live-room-local.png");

  // 站尺在 1024 宽下的排布（溢出检查的视觉证据）
  win.setContentSize(1024, 768);
  await sleep(400);
  await shoot("live-room-local-1024x768.png");

  // 归档带证据：先给当前曲目点一颗红心，再截「喜欢 / 最近」两间房
  win.setContentSize(1280, 800);
  await sleep(300);
  await click(`(() => { const b = document.querySelector(".tools .like"); b?.click(); return Boolean(b); })()`, "底栏红心");
  await sleep(400);
  for (const [page, name] of [
    ["liked", "live-room-liked"],
    ["recent", "live-room-recent"],
  ]) {
    await click(`(() => { const b = document.querySelector('.ruler-tick[data-page="${page}"]'); b?.click(); return Boolean(b); })()`, `站尺 · ${page}`);
    await sleep(600);
    await shoot(`${name}.png`);
  }

  // 排版判据（三档）已在首页那一轮跑过，这里不再重复——同一组断言只留一处

  win.destroy();
  app.quit();
}).catch((err) => {
  console.error(err);
  app.quit();
  process.exitCode = 1;
});
