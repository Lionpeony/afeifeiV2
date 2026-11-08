/**
 * 直播带外壳截图（首页直播面 / 站尺 / 加入直播 / 换房间 / Esc 回落）。
 *
 * 跑法：先 node scripts/build.mjs，再 npx electron scripts/live-shots.mjs
 * 产物：docs/assets/mockups/live-home-<w>.png ×3、live-home-empty-<w>.png ×3、
 *       live-home-playing.png、live-home-onair.png、
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

/* 榜单/歌单曲目 fixture：**不与每日推荐重叠**——ON AIR 判据靠它：
   播一首不在每日推荐里的歌，首页必须整页切到 ON AIR（旧实现左栏钉死在每日推荐）。
   前 6 首固定名（判据引用），后面补到 50 首：播放页右栏队列要滚起来，
   6 首的队列探不到滚动条（用户实况是 QUEUE 3/50）。 */
const CHART_SONGS = [
  ["夜行特快", "夜航局", 221000],
  ["午夜快线", "夜航局", 244000],
  ["雾中信号", "潮汐台", 208000],
  ["频段之外", "潮汐台", 261000],
  ["白噪城市", "夜航局", 236000],
  ["末班电波", "潮汐台", 249000],
  ...Array.from({ length: 44 }, (_, i) => [`加场 ${i + 1}`, "夜航局", 200000 + i * 7000]),
].map(([name, artist, dt], i) => ({
  id: `chart-${i}`,
  name,
  ar: [{ name: artist }],
  al: { name: "夜行电台", picUrl: coverOf("夜行电台") },
  dt,
}));

/* 歌单页 fixture：账号歌单两行。空态那一段会把它清空，验证「两段都没歌单」的文案，
   所以必须是可变的模块级变量，不能写死在 handler 里。 */
let MOCK_PLAYLISTS = [
  { id: 601, name: "夜航精选", trackCount: 42, coverImgUrl: coverOf("叶惠美") },
  { id: 602, name: "深夜循环", trackCount: 18, coverImgUrl: coverOf("夜行电台") },
];

/* 取曲目的失败开关：错误态那一段会把它打开，验证「页面说人话」而不是沉默 */
let MOCK_TRACK_ERROR = false;

/** 上游调用计数：用来证明「切回页面不再重复拉」（会话缓存真的生效了） */
const CALLS = { toplists: 0, tracks: 0, userPlaylists: 0 };

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

/** 窗控三键（titleBarOverlay）的每次同步：用来验「三键跟可见页面走」。
    真窗口里这块是系统绘制的，截图拍不到，只能从 IPC 记录里读。 */
const OVERLAY_CALLS = [];

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
      CALLS.toplists += 1;
      return {
        list: [
          { id: 901, name: "夜航飙升榜", trackCount: 100, coverImgUrl: coverOf("夜行电台") },
          { id: 902, name: "夜航新歌榜", trackCount: 100, coverImgUrl: coverOf("叶惠美") },
          { id: 903, name: "夜航热歌榜", trackCount: 50, coverImgUrl: coverOf("第二天堂") },
        ],
      };
    }
    // 歌单：账号歌单两行 + 导入详情。歌单页要「进页就有内容」，账号歌单必须给
    if (method === "user_playlist") {
      CALLS.userPlaylists += 1;
      return { playlist: MOCK_PLAYLISTS };
    }
    if (method === "playlist_detail") {
      return {
        code: 200,
        playlist: { id: 701, name: "导入的歌单 · 测试", trackCount: 6, coverImgUrl: coverOf("第二天堂") },
      };
    }
    // 6 首才够让「前三名台柱 + 第 4 名起列表」两段都吃到数据
    if (method === "playlist_track_all") {
      if (MOCK_TRACK_ERROR) throw new Error("fixture：上游这次没给曲目");
      CALLS.tracks += 1;
      return { songs: CHART_SONGS, total: CHART_SONGS.length };
    }
    // 取流：直连本地合成的 WAV（appmedia 协议 handler 在本脚本里）。
    // 以前给打不开的假地址，音轨永远卡在 buffering，「暂停/继续」判据没法真验；
    // 现在能真走到 playing，界面的播放状态、频谱、暂停文案都是真的。
    if (method === "song_url" || method === "song_url_v1") {
      const token = Buffer.from("C:/live/fixture-online.wav", "utf8").toString("hex");
      return { data: [{ url: `appmedia://${token}`, fee: 0 }] };
    }
    // 歌词：在线曲目也要有词，播放页的主视觉/提词器才能复现真实内容高度（探滚动条用）
    if (method === "lyric" || method === "lyric_new") {
      return { lrc: { lyric: DEMO_LRC } };
    }
    if (method === "likelist") return { ids: [] };
    return {};
  });
  // QQ 源起来后启动就会问一次 profile；fixture 不登录，给空账号免得刷红字
  ipcMain.handle("qq:profile", () => ({ loggedIn: false, nick: null, uid: null }));
  // 我的歌单（2026-11-06 补的 /user/playlist）：给一条，验证歌单页能切到 QQ
  ipcMain.handle("qq:call", (_e, method) => {
    if (method === "userPlaylists") {
      // 字段名照真号实测的回包：dirName / songNum（大写 N）/ bigpicUrl
      return {
        code: 200,
        playlist: [{ tid: 9001, dirId: 12, dirName: "QQ 上的歌单", songNum: 24, bigpicUrl: coverOf("小王") }],
      };
    }
    if (method === "ownedPlaylist") {
      // QQ 的曲目是 mid/singer[]/album/interval，不是网易云的 id/ar/al/dt
      const songs = DAILY.slice(0, 4).map((s, i) => ({
        mid: `qqmid${i}0000`,
        name: s.name,
        singer: s.ar.map((a) => ({ name: a.name })),
        // 不给 album.mid：拼出来的假封面地址会 404，落成破图；留空走占位块
        album: { name: s.al.name },
        interval: Math.round(s.dt / 1000),
      }));
      return { code: 200, songs, total: songs.length, more: false };
    }
    return {};
  });
  // 外壳订阅了这两个 IPC；fixture 不跑主进程那套主题/轮询，给空实现免得刷红字
  ipcMain.handle("win:overlayTheme", (_e, bg, fg) => {
    OVERLAY_CALLS.push({ bg, fg });
    return true;
  });
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
    if (!hero.kicker.includes("正在播出")) throw new Error("换档后眉标没变成「正在播出」");
    if (hero.liveTape < 1) throw new Error("播出带没有标记正在播的那一档");
    if (!hero.anim.some((n) => String(n).startsWith("cs-swap"))) {
      throw new Error(`换档没有播动画：${JSON.stringify(hero.anim)}`);
    }
    for (const want of ["cs-swap-copy", "cs-swap-cover"]) {
      if (!hero.anim.includes(want)) throw new Error(`换档缺 ${want}：${JSON.stringify(hero.anim)}`);
    }

    /* 完整播出单（cs-more 展开）：一体式队列列表——行数 = 节目单总数、
       缩略图与在播标记就位。列表空或缩略图缺失都是列表坏了。 */
    await evalJs(`document.querySelector(".cs-more")?.click()`);
    await sleep(500);
    const allList = await evalJs(`(() => {
      const rows = [...document.querySelectorAll(".cs-all-row")];
      const arts = [...document.querySelectorAll(".cs-all-art")];
      const okArt = arts.filter((el) => el.tagName !== "IMG" || el.naturalWidth > 0).length;
      return {
        rows: rows.length,
        liveRow: rows.filter((r) => r.classList.contains("is-live")).length,
        arts: arts.length,
        okArt,
        artW: arts[0]?.getBoundingClientRect().width ?? 0,
      };
    })()`);
    console.log(`完整播出单：${JSON.stringify(allList)}`);
    if (allList.rows < 1) throw new Error("展开后播出单是空的");
    if (allList.liveRow !== 1) throw new Error(`播出单在播标记应 1 行，实际 ${allList.liveRow}`);
    if (allList.okArt < Math.min(6, allList.rows)) throw new Error(`播出单缩略图不足：${JSON.stringify(allList)}`);
    if (allList.artW < 20) throw new Error(`缩略图塌了（宽 ${allList.artW}）`);
    await shoot("live-home-all-list.png");
    await evalJs(`document.querySelector(".cs-more")?.click()`);
    await sleep(400);

    /* 播出带格子 = 真封面：img 直接做格子中段，fixture 至少 1 格加载成功且真的画出来了（宽>0）。 */
    const covers = await evalJs(`(() => {
      const arts = [...document.querySelectorAll(".cs-tape-art")];
      const imgs = arts.filter((el) => el.tagName === "IMG");
      const vinyl = arts.filter((el) => el.classList.contains("cs-tape-vinyl")).length;
      const r = imgs[0]?.getBoundingClientRect();
      return { total: arts.length, img: imgs.length, vinyl, ok: imgs.filter((i) => i.naturalWidth > 0).length, w: r?.width ?? 0, h: r?.height ?? 0 };
    })()`);
    console.log(`播出带封面：${JSON.stringify(covers)}`);
    if (covers.ok < 1 || covers.w < 10) throw new Error(`播出带真封面没画出来：${JSON.stringify(covers)}`);
    if (covers.vinyl > 0) throw new Error(`有封面数据却落到了黑胶垫底（${covers.vinyl} 格）——失败态误判`);

    /* 信号条 = 真频谱：在播时柱子应该跳起来（几何量测：柱高/容器高），贴底就是死数据。 */
    await sleep(400);
    const vu = await evalJs(`(() => {
      const bars = [...document.querySelectorAll(".cs-vu i")];
      const box = document.querySelector(".cs-vu").getBoundingClientRect().height;
      const ratio = Math.max(...bars.map((b) => b.getBoundingClientRect().height / box));
      return { bars: bars.length, max: ratio.toFixed(3) };
    })()`);
    console.log(`信号条：${JSON.stringify(vu)}`);
    if (vu.bars === 0) throw new Error("信号条一根柱子都没有");
    if (Number(vu.max) < 0.05) throw new Error(`在播时信号条全贴底（${vu.max}）—— 还是死数据`);

    await shoot("live-home-playing.png");

    /* 同一份节目单里跳档：队列已就位时再点一格走的是光标跳转（不重建队列）——
       hero 仍要跟着切、换档动画仍要播。队列已被上一次点击装好，这条必走跳转路径。 */
    const swapTitle = await evalJs(`(() => {
      const b = document.querySelectorAll(".cs-tape")[2];
      if (!b) return null;
      const t = b.querySelector(".cs-tape-title")?.textContent ?? "";
      window.__swapAnim = [];
      const t0 = performance.now();
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
    await sleep(1800);
    const jumped = await evalJs(`(() => {
      const b = document.querySelector(".cs-artist b");
      const cs = getComputedStyle(b);
      const note = document.querySelector(".cs-note");
      const nc = getComputedStyle(note);
      const copy = document.querySelector(".cs-copy");
      const stage = document.querySelector(".cs-stage");
      const cover = document.querySelector(".cs-cover");
      const home = document.querySelector(".cs-home");
      const hc = getComputedStyle(home);
      return {
        title: document.querySelector(".cs-title")?.textContent ?? "",
        anim: window.__swapAnim ?? [],
        artist: b?.textContent ?? "",
        color: cs.color,
        h: b?.getBoundingClientRect().height ?? 0,
        note: note?.textContent.slice(0, 16) ?? "",
        noteOpacity: nc.opacity,
        noteRect: note?.getBoundingClientRect().toJSON(),
        copyRect: copy?.getBoundingClientRect().toJSON(),
        copyPos: getComputedStyle(copy).position,
        stageRect: stage?.getBoundingClientRect().toJSON(),
        coverRect: cover?.getBoundingClientRect().toJSON(),
        stagePos: stage ? getComputedStyle(stage).position : "",
        stageDisp: stage ? getComputedStyle(stage).display : "",
        home: {
          disp: hc.display,
          rows: hc.gridTemplateRows,
          h: Math.round(home.getBoundingClientRect().height),
          cls: home.className,
        },
        chain: (() => {
          const out = [];
          let el = document.querySelector(".cs-home")?.parentElement;
          while (el && out.length < 6) {
            const cs = getComputedStyle(el);
            out.push(`${el.tagName}.${String(el.className).split(" ")[0]}:${Math.round(el.getBoundingClientRect().height)}(${cs.height}/${cs.overflow})`);
            el = el.parentElement;
          }
          return out;
        })(),
      };
    })()`);
    console.log(
      `同队列跳档：点第 3 格「${swapTitle}」→ 大字「${jumped.title}」·艺人「${jumped.artist}」(${jumped.color} h=${jumped.h})` +
        `·note「${jumped.note}」op=${jumped.noteOpacity} y=${Math.round(jumped.noteRect?.y ?? -1)}` +
        `·copy pos=${jumped.copyPos} y=${Math.round(jumped.copyRect?.y ?? -1)} h=${Math.round(jumped.copyRect?.height ?? 0)}` +
        `·stage pos=${jumped.stagePos} disp=${jumped.stageDisp} y=${Math.round(jumped.stageRect?.y ?? -1)} h=${Math.round(jumped.stageRect?.height ?? 0)}` +
        `·cover y=${Math.round(jumped.coverRect?.y ?? -1)} h=${Math.round(jumped.coverRect?.height ?? 0)}` +
        `·home disp=${jumped.home.disp} rows=[${jumped.home.rows}] h=${jumped.home.h}` +
        `·链 ${jumped.chain.join(" <- ")}` +
        `·动画 ${JSON.stringify(jumped.anim)}`,
    );
    if (!swapTitle) throw new Error("播出带没有第 3 格");
    if (jumped.title !== swapTitle) throw new Error(`跳档后 hero 没跟上：期望「${swapTitle}」，实际「${jumped.title}」`);
    if (!jumped.artist) throw new Error("hero 艺人名为空");
    if (jumped.h < 10) throw new Error(`hero 艺人行塌了（h=${jumped.h}）`);
    if (Number(jumped.noteOpacity) < 0.5) throw new Error(`note 透明（op=${jumped.noteOpacity}）`);
    if (!jumped.anim.includes("cs-swap-copy")) throw new Error(`跳档没播动画：${JSON.stringify(jumped.anim)}`);

    /* 「暂停/继续」的判据放在下面 ON AIR 段做（fixture 现在出真声，这里按下暂停
       会影响后续直播段的现场；ON AIR 段验的是同一套 live 分支，验一次就够）。 */

    /* ON AIR：播一首**不在每日推荐里**的歌（榜单列表第一行）→ 回首页。
       判据：hero 换成那首歌、文案标来源、右栏整栏切「正在播出 · 来自当前队列」、
       播出带换成榜单队列且标出在播档。旧实现左栏永远钉死在每日推荐，这条必红。 */
    await click(
      `(() => { const t = document.querySelector('.ruler-tick[data-page="online"]'); t?.click(); return Boolean(t); })()`,
      "站尺「在线」",
    );
    await sleep(1000);
    const chartPick = await evalJs(`(() => {
      const row = document.querySelector(".charts-page .lib-row.online-row");
      if (!row) return null;
      const title = row.querySelector(".lib-title")?.textContent ?? "";
      row.click();
      return title;
    })()`);
    await sleep(1200);
    await click(
      `(() => { const t = document.querySelector('.ruler-tick[data-page="home"]'); t?.click(); return Boolean(t); })()`,
      "站尺「首页」",
    );
    await sleep(800);
    const onAir = await evalJs(`(() => ({
      title: document.querySelector(".cs-title")?.textContent ?? "",
      kicker: document.querySelector(".cs-kicker")?.textContent ?? "",
      note: document.querySelector(".cs-note")?.textContent ?? "",
      feed: document.querySelector(".cs-feed-kicker")?.textContent ?? "",
      meta: document.querySelector(".cs-feed-meta")?.textContent ?? "",
      tapes: document.querySelectorAll(".cs-tape").length,
      liveTape: document.querySelectorAll(".cs-tape.is-live").length,
    }))()`);
    console.log(
      `首页 ON AIR：播榜单「${chartPick}」→ 大字「${onAir.title}」·文案「${onAir.note.trim()}」·右栏「${onAir.feed}·${onAir.meta.trim()}」·播出带 ${onAir.tapes} 档·在播标记 ${onAir.liveTape}`,
    );
    if (chartPick === null || chartPick === "") throw new Error("榜单页没有可点的曲目行");
    if (onAir.title !== chartPick) throw new Error(`ON AIR 后 hero 没换成在播歌：期望「${chartPick}」，实际「${onAir.title}」`);
    if (!onAir.kicker.includes("正在播出")) throw new Error(`ON AIR 后眉标没变成「正在播出」：${onAir.kicker}`);
    if (!onAir.note.includes("来自")) throw new Error(`ON AIR 文案没标来源：${onAir.note}`);
    if (!onAir.feed.includes("正在播出")) throw new Error(`右栏没切到 ON AIR：${onAir.feed}`);
    if (!onAir.meta.includes("当前队列")) throw new Error(`右栏没写明节目单来自当前队列：${onAir.meta}`);
    if (onAir.tapes < 4) throw new Error(`ON AIR 播出带没换成榜单队列：只有 ${onAir.tapes} 档`);
    if (onAir.liveTape < 1) throw new Error("ON AIR 播出带没有标记正在播的一档");
    await shoot("live-home-onair.png");

    /* 暂停态：fixture 出真声之后这条能真验了（以前永远卡 buffering）——
       眉标换「暂停中 · STANDBY」、按钮换「继续」，不许再谎称「正在播出」。 */
    await click(
      `(() => { const b = document.querySelector(".cs-actions .cs-play"); b?.click(); return Boolean(b); })()`,
      "hero 播放/暂停",
    );
    await sleep(500);
    const paused = await evalJs(`(() => ({
      kicker: document.querySelector(".cs-kicker")?.textContent ?? "",
      note: document.querySelector(".cs-note")?.textContent ?? "",
      btn: document.querySelector(".cs-actions .cs-play-label")?.textContent ?? "",
    }))()`);
    console.log(`首页暂停：眉标「${paused.kicker.trim()}」·按钮「${paused.btn.trim()}」·文案「${paused.note.trim()}」`);
    if (!paused.kicker.includes("暂停中")) throw new Error(`暂停后眉标没换：${paused.kicker}`);
    if (!paused.btn.includes("继续")) throw new Error(`暂停后按钮没换「继续」：${paused.btn}`);
    if (!paused.note.includes("停在半路")) throw new Error(`暂停文案没换：${paused.note}`);
    await shoot("live-home-onair-paused.png");
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

      /* 会话缓存：切走再切回，曲目接口不该被再打一次 —— 那 0.3–0.6s 的等待就是它 */
      // 切到「本地」这种不联网的页：切到歌单页会让它自己发一次曲目请求，把计数搅浑
      const tracksBefore = CALLS.tracks;
      await click(
        `(() => { const t = [...document.querySelectorAll(".ruler-tick")].find((b) => b.textContent?.includes("本地")); t?.click(); return Boolean(t); })()`,
        "站尺「本地」",
      );
      await sleep(600);
      await click(
        `(() => { const t = [...document.querySelectorAll(".ruler-tick")].find((b) => b.textContent?.includes("在线")); t?.click(); return Boolean(t); })()`,
        "站尺「在线」",
      );
      await sleep(1000);
      const backRows = await evalJs(`document.querySelectorAll(".charts-page .lib-row.online-row").length`);
      console.log(`切回榜单：曲目接口 ${tracksBefore} → ${CALLS.tracks} 次·列表 ${backRows} 行`);
      if (CALLS.tracks !== tracksBefore) throw new Error(`切回榜单重新拉了曲目：${tracksBefore} → ${CALLS.tracks}`);
      if (backRows < 1) throw new Error("切回榜单后曲目没从缓存恢复");

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

      /* 歌单页：进页自动选中一个歌单（右栏不许空着）、曲目带序号与封面、
         收藏只出现一次（旧版顶部封面墙 + 左栏列表把同一批画了两遍）。 */
      await click(
        `(() => {
          const t = [...document.querySelectorAll(".ruler-tick")].find((b) => b.textContent?.includes("歌单"));
          t?.click();
          return Boolean(t);
        })()`,
        "站尺「歌单」",
      );
      await sleep(1200);
      const plLanding = await evalJs(`(() => ({
        on: document.querySelector(".pl-item.pl-line-item.on .pl-name")?.textContent ?? "",
        rows: document.querySelectorAll(".playlists-page .lib-row.online-row").length,
        covers: document.querySelectorAll(".playlists-page .lib-row.online-row .row-cover").length,
        ranks: [...document.querySelectorAll(".playlists-page .lib-row.online-row .lib-no")].map((n) => n.textContent),
        thead: Boolean(document.querySelector(".playlists-page .lib-thead")),
        wall: document.querySelectorAll(".pl-card").length,
        sects: [...document.querySelectorAll(".pl-sect")].map((n) => n.textContent?.trim()).join("|"),
        acts: document.querySelectorAll(".playlists-page .pl-act").length,
        nowAct: document.querySelector(".playlists-page .now-act")?.textContent?.trim() ?? "",
      }))()`);
      console.log(
        `进歌单页：选中「${plLanding.on}」·列表 ${plLanding.rows} 行·封面 ${plLanding.covers}·名次 ${JSON.stringify(plLanding.ranks.slice(0, 2))}·段落「${plLanding.sects}」`,
      );
      await shoot("playlists-landing.png");
      if (!plLanding.on) throw new Error("进歌单页没有自动选中，右半屏空着");
      if (plLanding.rows < 1) throw new Error("自动选中的歌单没取到曲目");
      if (plLanding.covers !== plLanding.rows) {
        throw new Error(`曲目行缺封面列：${plLanding.covers} 封面 / ${plLanding.rows} 行`);
      }
      if (plLanding.ranks[0] !== "01") throw new Error(`歌单名次没从 01 起：${JSON.stringify(plLanding.ranks.slice(0, 3))}`);
      if (plLanding.wall > 0) throw new Error("收藏歌单还在顶部封面墙上重复出现（.pl-card）");
      if (!plLanding.thead) throw new Error("曲目列表没有表头");
      // 收藏动作从 240px 左栏挪到右栏抬头：左栏不许再挂行内小图标
      if (plLanding.acts > 0) throw new Error(`左栏还有 ${plLanding.acts} 个行内收藏按钮（.pl-act）`);
      if (!plLanding.nowAct.includes("收藏")) throw new Error(`抬头没有收藏按钮：「${plLanding.nowAct}」`);

      /* 音源切换：歌单页不该只有网易云（2026-11-06 补了 QQ 的 /user/playlist） */
      const plChips = await evalJs(`[...document.querySelectorAll(".playlists-page .seg button")].map((b) => b.textContent.trim())`);
      console.log(`歌单音源切换：${plChips.join(" / ")}`);
      if (!plChips.some((c) => c.includes("QQ"))) throw new Error(`歌单页只有 ${plChips.join("/")}，QQ 缺席`);
      await click(
        `(() => {
          const b = [...document.querySelectorAll(".playlists-page .seg button")].find((x) => x.textContent.includes("QQ"));
          b?.click();
          return Boolean(b);
        })()`,
        "切到 QQ",
      );
      await sleep(1000);
      const plQq = await evalJs(`(() => ({
        sect: [...document.querySelectorAll(".playlists-page .pl-sect")].map((p) => p.textContent.trim()).join("|"),
        items: document.querySelectorAll(".playlists-page .pl-item").length,
        rows: document.querySelectorAll(".playlists-page .lib-row.online-row").length,
        name: document.querySelector(".playlists-page .pl-item .pl-name")?.textContent ?? "",
        count: document.querySelector(".playlists-page .pl-item .pl-count")?.textContent ?? "",
      }))()`);
      console.log(`QQ 歌单：「${plQq.name}」${plQq.count}·段落「${plQq.sect}」·左栏 ${plQq.items} 项·曲目 ${plQq.rows} 行`);
      if (!plQq.sect.includes("QQ 音乐")) throw new Error(`切到 QQ 后段落没换：${plQq.sect}`);
      if (plQq.items < 1) throw new Error("切到 QQ 后左栏没有歌单");
      if (plQq.rows < 1) throw new Error("切到 QQ 后曲目没取到");
      // 回包字段名读错时这里会退成「未命名歌单 · —」，是上一版的真实 bug
      if (plQq.name.includes("未命名")) throw new Error(`QQ 歌单名没读到：${plQq.name}`);
      if (plQq.count.trim() === "—") throw new Error("QQ 歌单曲目数没读到（songNum）");
      await shoot("playlists-qq.png");

      // 切回网易云：后面的收藏 / 导入判据要它的数据
      await click(
        `(() => {
          const b = [...document.querySelectorAll(".playlists-page .seg button")].find((x) => x.textContent.includes("网易云"));
          b?.click();
          return Boolean(b);
        })()`,
        "切回网易云",
      );
      await sleep(1200);

      // 曲目行必须是真按钮（旧版是 div + onClick，Tab 摸不到）
      const plKeys = await evalJs(`(() => {
        const row = document.querySelector(".playlists-page .lib-row.online-row");
        return row ? { tag: row.tagName, tab: row.tabIndex } : null;
      })()`);
      if (!plKeys || plKeys.tag !== "BUTTON" || plKeys.tab < 0) {
        throw new Error(`曲目行不是可键盘操作的按钮：${JSON.stringify(plKeys)}`);
      }

      /* 导入：页头一枚按钮 → 展开一行输入（低频操作不常驻工具行）。
         导入完成后右栏直接落这首新歌单，不用再点一次。 */
      await click(`(() => { const b = document.querySelector(".pl-import-open"); b?.click(); return Boolean(b); })()`, "页头「导入」");
      await sleep(300);
      const typed = await evalJs(`(() => {
        const i = document.querySelector(".pl-import input");
        if (!i) return false;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(i, "https://music.163.com/playlist?id=701");
        i.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      if (!typed) throw new Error("导入条展开后没有输入框");
      await click(`(() => { const b = document.querySelector(".pl-import button"); b?.click(); return Boolean(b); })()`, "导入提交");
      await sleep(1500);
      const plImported = await evalJs(`(() => {
        const names = [...document.querySelectorAll(".playlists-page .pl-name")].map((n) => n.textContent?.trim() ?? "");
        return {
          items: names.length,
          dup: names.filter((n, i) => names.indexOf(n) !== i),
          on: document.querySelector(".pl-item.pl-line-item.on .pl-name")?.textContent ?? "",
          rows: document.querySelectorAll(".playlists-page .lib-row.online-row").length,
          sects: [...document.querySelectorAll(".pl-sect")].map((n) => n.textContent?.trim()).join("|"),
          stillOpen: Boolean(document.querySelector(".pl-import")),
        };
      })()`);
      console.log(
        `导入歌单：左栏 ${plImported.items} 项·选中「${plImported.on}」·列表 ${plImported.rows} 行·段落「${plImported.sects}」·导入条收起 ${!plImported.stillOpen}`,
      );
      if (plImported.items < 3) throw new Error(`导入后左栏应有 3 项（2 账号 + 1 收藏），实际 ${plImported.items}`);
      if (plImported.dup.length > 0) throw new Error(`同一歌单在左栏出现两次：${JSON.stringify(plImported.dup)}`);
      if (!plImported.sects.includes("我收藏的")) throw new Error(`左栏没有「我收藏的」分组：${plImported.sects}`);
      if (!plImported.on.includes("导入的歌单")) throw new Error(`导入后没落在这首新歌单：选中「${plImported.on}」`);
      if (plImported.rows < 1) throw new Error("导入的歌单没取到曲目");
      if (plImported.stillOpen) throw new Error("导入成功后输入条没收起");
      await shoot("playlists-imported.png");

      /* 歌单页同样走会话缓存：切走再切回，账号歌单与曲目都不该重拉 */
      const plCalls = { lists: CALLS.userPlaylists, tracks: CALLS.tracks };
      await click(
        `(() => { const t = [...document.querySelectorAll(".ruler-tick")].find((b) => b.textContent?.includes("本地")); t?.click(); return Boolean(t); })()`,
        "站尺「本地」",
      );
      await sleep(700);
      await click(
        `(() => { const t = [...document.querySelectorAll(".ruler-tick")].find((b) => b.textContent?.includes("歌单")); t?.click(); return Boolean(t); })()`,
        "站尺「歌单」",
      );
      await sleep(1000);
      const plBack = await evalJs(`(() => ({
        items: document.querySelectorAll(".playlists-page .pl-item").length,
        rows: document.querySelectorAll(".playlists-page .lib-row.online-row").length,
      }))()`);
      console.log(
        `切回歌单：账号歌单 ${plCalls.lists} → ${CALLS.userPlaylists} 次·曲目 ${plCalls.tracks} → ${CALLS.tracks} 次·左栏 ${plBack.items} 项·右栏 ${plBack.rows} 行`,
      );
      if (CALLS.userPlaylists !== plCalls.lists) {
        throw new Error(`切回歌单重新拉了账号歌单：${plCalls.lists} → ${CALLS.userPlaylists}`);
      }
      if (CALLS.tracks !== plCalls.tracks) throw new Error(`切回歌单重新拉了曲目：${plCalls.tracks} → ${CALLS.tracks}`);
      if (plBack.items < 1 || plBack.rows < 1) throw new Error("切回歌单后内容没从缓存恢复");

      /* 错误态：取曲目失败要落一句人话，不能沉默，也不能把错误码甩给用户。
         先点刷新让曲目缓存失效 —— 否则「换个歌单」会命中旧曲目，压根不会发请求。 */
      MOCK_TRACK_ERROR = true;
      await click(
        `(() => { const b = document.querySelector('.head-tools button[aria-label="刷新"]'); b?.click(); return Boolean(b); })()`,
        "页头刷新（清缓存）",
      );
      await sleep(900);
      await click(
        `(() => {
          const other = [...document.querySelectorAll(".playlists-page .pl-item")].find(
            (b) => !b.classList.contains("on"),
          );
          other?.click();
          return Boolean(other);
        })()`,
        "换一个歌单",
      );
      await sleep(900);
      const plError = await evalJs(`(() => ({
        note: document.querySelector(".playlists-page .lib-note")?.textContent ?? "",
        right: document.querySelector(".playlists-page .lib-empty")?.textContent ?? "",
        rows: document.querySelectorAll(".playlists-page .lib-row.online-row").length,
      }))()`);
      console.log(
        `歌单错误态：提示「${plError.note.trim()}」·右栏「${plError.right.trim()}」·列表 ${plError.rows} 行`,
      );
      if (!plError.note.trim()) throw new Error("取曲目失败时页面没有提示");
      if (/\b(code|undefined|null|Error:)\b/i.test(plError.note)) throw new Error(`提示里混进了代码味：${plError.note}`);
      // 加载失败不能写成「这个歌单是空的」——那是在说歌单本身没歌
      if (!plError.right.includes("没取到")) throw new Error(`加载失败被说成了空歌单：${plError.right}`);
      await shoot("playlists-error.png");
      // 关掉失败开关，再点一次同一个歌单把曲目拿回来（后面的最坏数据段要有行可改）
      MOCK_TRACK_ERROR = false;
      await click(
        `(() => {
          const b = document.querySelector(".playlists-page .pl-item.on");
          b?.click();
          return Boolean(b);
        })()`,
        "重试当前歌单",
      );
      await sleep(900);

      /* 最坏数据（break-ui）：超长歌单名 / 超长歌名 / 超长专辑 / emoji。
         两栏各自不许横向溢出：左栏靠省略号，右栏靠网格 minmax(0,1fr)。 */
      if (process.env.STRESS === "1") {
        await evalJs(`(() => {
          const names = [...document.querySelectorAll(".playlists-page .pl-name")];
          names[0].textContent =
            "这是一个非常非常长的歌单名字用来测试左栏在窄窗口下会不会把首数挤掉并且溢出边界";
          const rows = [...document.querySelectorAll(".playlists-page .lib-row.online-row")];
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
          const list = document.querySelector(".playlists-page .lib-list");
          const idx = document.querySelector(".playlists-page .pl-list");
          const page = document.querySelector(".playlists-page");
          return {
            list: list.scrollWidth - list.clientWidth,
            idx: idx.scrollWidth - idx.clientWidth,
            page: page.scrollWidth - page.clientWidth,
          };
        })()`);
        console.log(`歌单最坏数据：列表 +${over.list} / 左栏 +${over.idx} / 整页 +${over.page}`);
        if (over.list > 1 || over.idx > 1 || over.page > 1) throw new Error(`歌单窄窗横向溢出：${JSON.stringify(over)}`);
        await shoot("playlists-stress.png");
      }

      // 最小窗口（1160×740，主进程定的下限）再验一次：两栏必须还读得下去
      win.setContentSize(1160, 740);
      await sleep(600);
      const plNarrow = await evalJs(`(() => {
        const page = document.querySelector(".playlists-page");
        const idx = document.querySelector(".playlists-page .pl-list");
        return { page: page.scrollWidth - page.clientWidth, idx: idx.scrollWidth - idx.clientWidth };
      })()`);
      console.log(`歌单窄窗 1160：整页 +${plNarrow.page} / 左栏 +${plNarrow.idx}`);
      if (plNarrow.page > 1 || plNarrow.idx > 1) throw new Error(`1160 宽歌单页横向溢出：${JSON.stringify(plNarrow)}`);
      await shoot("playlists-narrow.png");
      win.setContentSize(1440, 900);
      await sleep(400);

      /* 空态：账号没有歌单 + 一个收藏都没有。两段都空时左栏要说清「怎么才能有」，
         右栏要指向左栏，不能只是两片空白。 */
      MOCK_PLAYLISTS = [];
      await click(`(() => { const b = document.querySelector('.head-tools button[aria-label="刷新"]'); b?.click(); return Boolean(b); })()`, "页头刷新");
      await sleep(1200);
      // 账号歌单清空后自动选中落到收藏项，点抬头「已收藏 · 取消」把它删掉
      await click(
        `(() => {
          const x = document.querySelector(".playlists-page .now-act");
          x?.click();
          return Boolean(x);
        })()`,
        "取消收藏",
      );
      await sleep(600);
      const plEmpty = await evalJs(`(() => ({
        items: document.querySelectorAll(".playlists-page .pl-item").length,
        left: document.querySelector(".playlists-page .pl-empty")?.textContent ?? "",
        right: document.querySelector(".playlists-page .lib-empty")?.textContent ?? "",
      }))()`);
      console.log(`歌单空态：左栏 ${plEmpty.items} 项·左「${plEmpty.left.trim()}」·右「${plEmpty.right.trim()}」`);
      if (plEmpty.items > 0) throw new Error(`清空后左栏还剩 ${plEmpty.items} 项`);

      /* 清单落盘：冷启动首帧能不能直接有内容，全靠这份快照（hydrate 逻辑另有单测）。
         debounce 800ms，这里等一拍再读。 */
      await sleep(1200);
      const cachePath = path.join(PROFILE, "store-net-cache.json");
      if (!fs.existsSync(cachePath)) throw new Error("清单没落盘：store-net-cache.json 不存在");
      const cacheText = fs.readFileSync(cachePath, "utf8");
      console.log(`清单落盘：${cacheText.length} 字节`);
      if (!cacheText.includes("charts:toplists:netease")) throw new Error("落盘快照缺榜单清单");
      if (!cacheText.includes("playlists:list:netease")) throw new Error("落盘快照缺歌单清单");
      if (cacheText.includes("account:")) throw new Error("账号数据不该落盘（只存清单类）");
      if (!plEmpty.left.includes("还没有歌单")) throw new Error(`左栏空态没告诉用户怎么开始：${plEmpty.left}`);
      if (!plEmpty.right.includes("左边选一个歌单")) throw new Error(`右栏空态没指向左栏：${plEmpty.right}`);
      await shoot("playlists-empty.png");

      // 还回账号歌单，后面的步骤不该继承这个空状态
      MOCK_PLAYLISTS = [
        { id: 601, name: "夜航精选", trackCount: 42, coverImgUrl: coverOf("叶惠美") },
        { id: 602, name: "深夜循环", trackCount: 18, coverImgUrl: coverOf("夜行电台") },
      ];
      await click(`(() => { const b = document.querySelector('.head-tools button[aria-label="刷新"]'); b?.click(); return Boolean(b); })()`, "页头刷新");
      await sleep(800);

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

  // 动作一：底栏「正在播放」整块可点 → 播放页（旧壳的「加入直播」随版式退役）
  await click(
    `(() => { const b = document.querySelector(".console .np"); b?.click(); return Boolean(b); })()`,
    "底栏正在播放",
  );
  await sleep(1200);
  await shoot("live-stage.png");

  // 播放页探针：.stage 根元素在、整页不横向溢出（右缘被裁 = 排版坏了，不是风格）
  const stageProbe = await evalJs(`(() => {
    const de = document.documentElement;
    return {
      hasStage: document.querySelector(".stage") !== null,
      scrollW: de.scrollWidth, clientW: de.clientWidth,
    };
  })()`);
  console.log(`播放页探针：${JSON.stringify(stageProbe)}`);
  if (!stageProbe.hasStage) throw new Error("播放页没有 .stage 根元素");
  if (stageProbe.scrollW > stageProbe.clientW + 1) {
    throw new Error(`播放页横向溢出：scrollWidth ${stageProbe.scrollW} > clientWidth ${stageProbe.clientW}`);
  }

  /* 导播走带（播出条）：三键在、底边进度是可拖 range、主键能切换播放态。
     舞台是主播出面，这组键失灵就等于舞台不能控制播出。 */
  const desk = await evalJs(`(() => {
    const keys = [...document.querySelectorAll(".st-air-tools .st-tb")];
    const main = keys.find((b) => b.classList.contains("main"));
    const before = main?.querySelector(".tb-ic")?.className ?? "";
    main?.click();
    return {
      count: keys.length,
      bar: Boolean(document.querySelector("input.st-air-progress[type=range]")),
      icBefore: before,
    };
  })()`);
  await sleep(700);
  const deskAfter = await evalJs(
    `document.querySelector(".st-air-tools .st-tb.main .tb-ic")?.className ?? ""`,
  );
  console.log(`导播走带：${JSON.stringify(desk)} → 主键图标 ${deskAfter}`);
  if (desk.count !== 3) throw new Error(`播出条走带应 3 键，实际 ${desk.count}`);
  if (!desk.bar) throw new Error("播出条底边不是可拖进度（input range 丢了）");
  if (deskAfter === desk.icBefore) throw new Error(`走带主键没切换播放态：${desk.icBefore} → ${deskAfter}`);
  // 拨回去，别把播放态带给后面的「首页暂停」截图
  await evalJs(`document.querySelector(".st-air-tools .st-tb.main")?.click()`);
  await sleep(700);

  /* 拖拽 seek 判据：先等引擎 metadata 就绪（在线流加载期总时长显示 --:--，
     那个窗口里 range 的 max 还是 1，拖了也没有区分度），再拖到中点断言 clock。
     同时验证加载期显示的是 --:-- 而不是假的 0:00。 */
  const waitReady = async () => {
    for (let i = 0; i < 40; i++) {
      const text = await evalJs(`document.querySelector(".st-air-clock")?.textContent ?? ""`);
      if (/\/ [1-9]/.test(text)) return text;
      await sleep(250);
    }
    return null;
  };
  const readyClock = await waitReady();
  if (!readyClock) throw new Error("播出条总时长 10s 内没就绪（引擎 duration 一直 0）");
  const seeked = await evalJs(`(() => {
    const bar = document.querySelector("input.st-air-progress");
    if (!bar) return null;
    const clock = document.querySelector(".st-air-clock");
    const before = clock?.textContent ?? "";
    bar.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, bubbles: true }));
    bar.value = String(Math.round(Number(bar.max) / 2));
    bar.dispatchEvent(new Event("input", { bubbles: true }));
    bar.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
    return { before, max: bar.max };
  })()`);
  await sleep(400);
  const seekClock = await evalJs(`document.querySelector(".st-air-clock")?.textContent ?? ""`);
  console.log(`播出条拖拽：${JSON.stringify(seeked)} → clock "${seekClock}"`);
  if (!seeked) throw new Error("播出条进度不在");
  const halfSec = Math.round(Number(seeked.max) / 2000);
  const half = `${Math.floor(halfSec / 60)}:${String(halfSec % 60).padStart(2, "0")}`;
  if (!seekClock.startsWith(half)) {
    throw new Error(`播出条拖到中点后 clock 应从 ${half} 起，实际 "${seekClock}"`);
  }

  /* 窗控三键（titleBarOverlay）跟「可见页面」走：播放页恒定深色（LIVE_PRESETS），
     三键必须读场景层 --stage-bg。全局是浅色时若还读结构层 --bg，深底右上角就是一块白——
     用户报的「只有右上角会变色」正是这一处。判据取两层的实际值比对，不写死色号。 */
  const layerTokens = await evalJs(`(() => {
    const stage = document.querySelector(".stage");
    const s = getComputedStyle(stage);
    const de = getComputedStyle(document.documentElement);
    return {
      stageBg: s.getPropertyValue("--stage-bg").trim(),
      globalBg: de.getPropertyValue("--bg").trim(),
    };
  })()`);
  const overlayInStage = OVERLAY_CALLS.at(-1);
  console.log(`播放页三键：${JSON.stringify(overlayInStage)}（场景层 ${layerTokens.stageBg} / 结构层 ${layerTokens.globalBg}）`);
  if (!overlayInStage) throw new Error("切进播放页后没同步窗控三键");
  if (overlayInStage.bg.toLowerCase() !== layerTokens.stageBg.toLowerCase()) {
    throw new Error(`播放页三键读错了层：${overlayInStage.bg} ≠ --stage-bg ${layerTokens.stageBg}`);
  }
  if (layerTokens.stageBg.toLowerCase() === layerTokens.globalBg.toLowerCase()) {
    throw new Error("场景层与结构层同色，这条判据没有区分度（换一套预设再跑）");
  }

  // 三档分辨率各拍一张（在线曲目在 fixture 里没有歌词，提词器空态照拍，不编数据）
  for (const [w, h] of [
    [1024, 768],
    [1440, 900],
  ]) {
    win.setContentSize(w, h);
    await sleep(500);
    /* 控制台在窄窗下不许溢出也不许折行：工具排 8 钮 + 分隔线必须在一条基线上
       （nowrap 溢出 scrollWidth 测不出，offsetTop 分布才抓得住） */
    const consoleFit = await evalJs(`(() => {
      const fit = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.scrollWidth - el.clientWidth : -1;
      };
      const tops = [...document.querySelectorAll(".console .tools button")].map((b) => b.getBoundingClientRect().top);
      const rows = [...new Set(tops.map((t) => Math.round(t)))];
      return {
        tools: fit(".console .tools"),
        mid: fit(".console .mid"),
        np: fit(".console .np-zone"),
        rows: rows.length,
      };
    })()`);
    console.log(`控制台 ${w}x${h} 溢出探针：${JSON.stringify(consoleFit)}`);
    if (consoleFit.tools > 1 || consoleFit.mid > 1 || consoleFit.np > 1) {
      throw new Error(`控制台窄窗溢出 ${w}x${h}：${JSON.stringify(consoleFit)}`);
    }
    if (consoleFit.rows > 1) {
      throw new Error(`工具排 ${w}x${h} 折成 ${consoleFit.rows} 行，不在一条基线`);
    }
    await shoot(`live-stage-${w}x${h}.png`);
  }

  /* 矮窗自适应探针（125% 缩放的笔记本视口更小）：窗口下限 740 / 125% 缩放的 700 两档，
     播放页**不该出现任何滚动**——「有滑动条、没有自适应」就是用户报的那个问题。
     `.st-script` 靠 -28px 负 margin 通栏（正好铺满 .stage 的左右 padding），
     它会让 .st-page 的 scrollWidth 多出 28px，那是设计不是溢出，豁免掉。 */
  for (const [w, h] of [
    [1160, 740], // 主进程窗口下限
    [1536, 700], // 125% 缩放 + 更矮的窗口
    [1280, 790], // 矮窗档（max-height: 780）切换点上方：相纸不压缩，靠剩余空间也得放得下
  ]) {
    win.setContentSize(w, h);
    await sleep(500);
    const spill = await evalJs(`(() => {
      const out = [];
      for (const el of [document.documentElement, document.body, ...document.querySelectorAll(".live-plate, .live-plate-body, .stage, .stage *")]) {
        const cs = getComputedStyle(el);
        const overY = el.scrollHeight - el.clientHeight;
        const overX = el.scrollWidth - el.clientWidth;
        if (overY > 1 && el.clientHeight > 0) {
          out.push({ el: String(el.className).slice(0, 44) || el.tagName, y: overY, can: cs.overflowY !== "visible" && cs.overflowY !== "hidden" });
        }
        // 提词器通栏（stage 里的 -28px margin）不算：它铺的是 .stage 的 padding
        if (overX > 1 && el.clientWidth > 0 && !el.classList.contains("st-page")) {
          out.push({ el: "X:" + (String(el.className).slice(0, 38) || el.tagName), x: overX, can: cs.overflowX !== "visible" && cs.overflowX !== "hidden" });
        }
      }
      return out.slice(0, 12);
    })()`);
    console.log(`播放页矮窗 ${w}x${h} 溢出：${JSON.stringify(spill)}`);
    const scrolling = spill.filter((item) => item.y > 1);
    if (scrolling.length) throw new Error(`播放页矮窗 ${w}x${h} 还在滚：${JSON.stringify(scrolling)}`);

    /* 细探针：.st-page 横向越界到底是哪个元素撑的。
       只测 scrollWidth 不够——那告诉你「超了 28px」，不告诉你「谁超的」。 */
    const wide = await evalJs(`(() => {
      const page = document.querySelector(".st-page");
      if (!page) return [];
      const box = page.getBoundingClientRect();
      const out = [];
      for (const el of page.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const overRight = r.right - box.right;
        const overLeft = box.left - r.left;
        if (overRight > 1 || overLeft > 1) {
          out.push({
            el: (String(el.className).slice(0, 40) || el.tagName) + ">" + (el.textContent ?? "").trim().slice(0, 18),
            over: Math.round(Math.max(overRight, overLeft)),
            right: Math.round(r.right),
          });
        }
      }
      return { pageRight: Math.round(box.right), items: out.sort((a, b) => b.over - a.over).slice(0, 8) };
    })()`);
    console.log(`播放页矮窗 ${w}x${h} 横向越界：${JSON.stringify(wide)}`);
    await shoot(`live-stage-short-${w}x${h}.png`);
  }

  /* 滚动条样式证据：矮窗两档已经不滚了，把窗口再压低逼出滚动条，确认它是场景色细条
     而不是原生亮条（用户截图那根）。这一档低于窗口下限 740，只验样式，不进零滚动断言。 */
  win.setContentSize(1536, 620);
  await sleep(500);
  const scrollbar = await evalJs(`(() => {
    const el = document.querySelector(".st-side-scroll");
    if (!el) return null;
    return { over: el.scrollHeight - el.clientHeight, thumb: getComputedStyle(el).getPropertyValue("--stage-line").trim() };
  })()`);
  console.log(`滚动条证据 1536x620：${JSON.stringify(scrollbar)}`);
  if (!scrollbar || scrollbar.over <= 1) throw new Error("620 高没逼出滚动条，这条证据无效（相纸收过头了）");
  await shoot("live-stage-scrollbar.png");
  win.setContentSize(1280, 800);
  await sleep(400);

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

  // 动作二：Esc 回落（stage 的 onBack 指回上一间房）
  await evalJs(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);  await sleep(600);
  const backHome = await evalJs(`document.querySelector(".live-home") !== null`);
  if (!backHome) throw new Error("Esc 没回落首页直播面");

  // 出播放页三键要读回**控制室**的底（壳把 --bg 重映射成 --live-bg，两者差一档）
  const homeTokens = await evalJs(`(() => {
    const shell = document.querySelector(".shell.live");
    const css = getComputedStyle(shell);
    return {
      liveBg: css.getPropertyValue("--live-bg").trim(),
      rootBg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
      hasStage: document.querySelector(".stage") !== null,
    };
  })()`);
  const overlayBackHome = OVERLAY_CALLS.at(-1);
  console.log(`回首页三键：${JSON.stringify(overlayBackHome)}（壳 ${homeTokens.liveBg} / 结构层 ${homeTokens.rootBg}·stage ${homeTokens.hasStage}）`);
  if (homeTokens.hasStage) throw new Error("回到首页后 .stage 还在，三键没法回落");
  if (!overlayBackHome || overlayBackHome.bg.toLowerCase() !== homeTokens.liveBg.toLowerCase()) {
    throw new Error(`回首页后三键没读回控制室：${JSON.stringify(overlayBackHome)} ≠ --live-bg ${homeTokens.liveBg}`);
  }
  if (homeTokens.liveBg.toLowerCase() === homeTokens.rootBg.toLowerCase()) {
    throw new Error("壳与结构层同色，这条判据没区分度");
  }

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
  await click(`(() => { const b = document.querySelector(".np-like"); b?.click(); return Boolean(b); })()`, "底栏红心");
  await sleep(400);
  for (const [page, name] of [
    ["liked", "live-room-liked"],
    ["recent", "live-room-recent"],
  ]) {
    await click(`(() => { const b = document.querySelector('.ruler-tick[data-page="${page}"]'); b?.click(); return Boolean(b); })()`, `站尺 · ${page}`);
    await sleep(600);
    await shoot(`${name}.png`);
  }

  /* 四档全局配色：控制室跟着换灯，舞台恒暗（2026-11-08「深浅要能看出区别」）。
     判据取 --live-bg 的实际值：改前四档完全相同（--live-bg 是固定值），这条会红。
     第二条判据取首页封面台的 --live-bg：它必须四档都等于 --night-bg。 */
  const themeProbe = () => evalJs(`(() => {
    const shell = document.querySelector(".shell.live");
    const hero = document.querySelector(".cs-stage");
    return {
      theme: document.documentElement.dataset.theme ?? "light",
      shellBg: shell ? getComputedStyle(shell).getPropertyValue("--live-bg").trim() : null,
      heroBg: hero ? getComputedStyle(hero).getPropertyValue("--live-bg").trim() : null,
    };
  })()`);

  const themeBg = new Map();
  for (const [id, name] of [["light", "纸色"], ["dark", "墨色"], ["sepia", "旧档"], ["forest", "夜航"]]) {
    await click(
      `(() => { const b = document.querySelector('.ruler-tick[data-page="settings"]'); b?.click(); return Boolean(b); })()`,
      "站尺 · 设置",
    );
    await sleep(400);
    await click(
      `(() => {
        const b = [...document.querySelectorAll(".seg button")].find((x) => x.textContent.trim() === "${name}");
        b?.click(); return Boolean(b);
      })()`,
      `配色 · ${name}`,
    );
    await sleep(300);
    // 用户就是在这里点的：选中态本身也要跟着换（设置页是唯一能一眼看出"点了有反应"的地方）
    await shoot(`live-theme-settings-${id}.png`);
    await click(
      `(() => { const b = document.querySelector('.ruler-tick[data-page="local"]'); b?.click(); return Boolean(b); })()`,
      "站尺 · 本地",
    );
    await sleep(600);
    await shoot(`live-theme-room-${id}.png`);
    await click(
      `(() => { const b = document.querySelector('.ruler-tick[data-page="home"]'); b?.click(); return Boolean(b); })()`,
      "站尺 · 首页",
    );
    await sleep(600);
    const got = await themeProbe();
    console.log(`配色 ${id}：${JSON.stringify(got)}`);
    if (got.theme !== id) throw new Error(`配色 ${id} 没切生效：${JSON.stringify(got)}`);
    if (got.heroBg !== "#0a0e13") throw new Error(`配色 ${id} 把首页封面台也点亮了（舞台应恒暗）：${got.heroBg}`);
    themeBg.set(id, String(got.shellBg));
    await shoot(`live-theme-home-${id}.png`);
  }
  if (new Set(themeBg.values()).size !== 4) {
    throw new Error(`四档控制室底色没全部区分开：${JSON.stringify([...themeBg])}`);
  }

  // 回到日间，给后续脚本一个确定状态
  await click(`(() => { const b = document.querySelector('.ruler-tick[data-page="settings"]'); b?.click(); return Boolean(b); })()`, "站尺 · 设置");
  await sleep(400);
  await click(`(() => {
    const b = [...document.querySelectorAll(".seg button")].find((x) => x.textContent.trim() === "纸色");
    b?.click(); return Boolean(b);
  })()`, "配色 · 纸色");
  await sleep(300);

  // 排版判据（三档）已在首页那一轮跑过，这里不再重复——同一组断言只留一处

  win.destroy();
  app.quit();
}).catch((err) => {
  console.error(err);
  // app.exit 强制带码退出：app.quit() 会跟 process.exitCode 竞态，失败也能退出码 0（坑过一回）
  app.exit(1);
});
