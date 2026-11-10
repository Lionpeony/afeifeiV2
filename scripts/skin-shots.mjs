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
  // corsEnabled 与主进程 MEDIA_SCHEME 对齐：封面取色 crossOrigin 采样需要（fixture 截图才能看见 tint 氛围）
  { scheme: "appmedia", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
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
  /* 深青而非近灰黑：tint 取色量化后 chroma 太低（0.02）混什么都看不出，
     fixture 封面必须自带彩度，色晕链路才验得动 */
  夜行电台: ["#123a4a", "#e8e2d6", "#7fc4d8"],
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
  /* 夜行电台带 6% 白边：detectCoverTrim → scale 反制的可红素材（fixture 全部封面用它）。
     白边 24/400 = 6%，落在 2%-15% 检测窗口内 → trim 必触发，img 必带 scale transform。 */
  if (album === "夜行电台") {
    const pad = 24;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">` +
      `<rect width="400" height="400" fill="#f4f1ea"/>` +
      `<rect x="${pad}" y="${pad}" width="${400 - pad * 2}" height="${400 - pad * 2}" fill="${bg}"/>` +
      `<text x="200" y="206" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="${motif}">${album}</text>` +
      `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  const kind = hashOf(album) % 3;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">` +
    `<rect width="400" height="400" fill="${bg}"/>` +
    coverMotif(kind, motif) +
    `<text x="200" y="352" text-anchor="middle" font-family="Georgia, serif" font-size="32" fill="${fg}">${album}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/* 伪二维码：三个定位角 + 确定性噪声格——看着是码，不真的可扫（登录弹层截图素材）。
   LCG 固定 seed：每次跑图完全一致，diff 友好。 */
const fakeQr = () => {
  const N = 25;
  let s = 20261109;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  let cells = "";
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const inFinder = (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
      if (!inFinder && rnd() < 0.45) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  const finder = (fx, fy) =>
    `<rect x="${fx}" y="${fy}" width="7" height="7"/>` +
    `<rect x="${fx + 1}" y="${fy + 1}" width="5" height="5" fill="#fff"/>` +
    `<rect x="${fx + 2}" y="${fy + 2}" width="3" height="3"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">` +
    `<rect width="${N}" height="${N}" fill="#fff"/>` +
    cells +
    finder(0, 0) +
    finder(N - 7, 0) +
    finder(0, N - 7) +
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
  "[01:33.00]灯还亮着",
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
/* QQ 账号登录态开关（模块级：IPC handler 与主流程都能读写） */
let qqLoggedIn = false;

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
  // QQ 源起来后启动就会问一次 profile；登录态由模块级开关控制（主流程中段未登录，
  // 尾段翻成已登录才能拍到「切换」钮与换台闪变）
  ipcMain.handle("qq:profile", () =>
    qqLoggedIn ? { loggedIn: true, nick: "码头中继站", uid: "qq9528" } : { loggedIn: false, nick: null, uid: null },
  );
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
  ipcMain.handle("qq:login", () => ({ key: "fixture-qr-key", qrImage: fakeQr() }));
  ipcMain.handle("qq:poll", () => ({ code: 801, loggedIn: false, message: "waiting" }));
  ipcMain.handle("qq:logout", () => {
    qqLoggedIn = false; // 退出探针真登出：profile 翻回未登录，行面翻成「登录」
    return { ok: true };
  });
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
      headers: {
        "content-type": "audio/wav",
        "content-length": String(wav.length),
        "accept-ranges": "bytes",
        "access-control-allow-origin": "*",
      },
    });
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  const seeded = process.env.LIVE_EMPTY === "1" ? [] : TRACKS;
  fs.writeFileSync(path.join(PROFILE, "library.json"), JSON.stringify({ v: 1, tracks: seeded, savedAt: Date.now() }));
  registerMinimalIpc();

  // 窗口尺寸可用环境变量覆盖：用户的实机是 1080x604 这类矮窗口，
  // 字号是 cqh 定义的，必须按真实窗口复现才看得见"标题过大/被裁"。
  const SHOT_W = Number(process.env.SHOT_W ?? 1280);
  const SHOT_H = Number(process.env.SHOT_H ?? 800);
  const win = new BrowserWindow({
    width: SHOT_W,
    height: SHOT_H,
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

  /* 瞬态动画专用：跳过 shoot 的双 rAF 等待（那 100-200ms 会把 560ms 的闪变睡过头），
     立刻抓帧。动画帧内会有轻微撕裂风险，换来的是抓得住那一刻。 */
  const quickShot = async (name) => {
    const img = await win.webContents.capturePage();
    if (img.isEmpty()) throw new Error(`${name} 截到空图`);
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log(`shot → docs/assets/mockups/${name}`);
  };

  const click = async (code, label) => {
    const ok = await evalJs(code);
    if (!ok) throw new Error(`点不到：${label}`);
    await sleep(500);
    return ok;
  };


  const alive = await evalJs(`document.querySelector(".live-home") !== null`);
  if (!alive) throw new Error("首页不是直播面：.live-home 不在");

  /* 播放页皮肤遍历（2026-11-10）。
     全程走**真 UI**：点底栏「正在播放」进播放页 → 点「样式」开面板 → 选卡 → 关面板 → 截图。
     不 dispatch 内部 intent：那样截出来的图不能证明用户点得到。 */
  win.setContentSize(SHOT_W, SHOT_H);
  await sleep(400);

  // 先从首页播出带点一首（fixture 的每日推荐），播放页才有曲目/歌词/封面
  await click(
    `(() => { const b = document.querySelectorAll(".cs-tape")[0]; b?.click(); return Boolean(b); })()`,
    "首页播出带第 1 格",
  );
  await sleep(1800);
  const nowPlaying = await evalJs(`document.querySelector(".console .np-title")?.textContent ?? document.querySelector(".np-title")?.textContent ?? ""`);
  console.log(`当前曲目：${nowPlaying}`);

  await click(
    `(() => { const b = document.querySelector(".console .np"); b?.click(); return Boolean(b); })()`,
    "底栏正在播放",
  );
  await sleep(1300);

  const landing = await evalJs(`(() => ({
    stage: Boolean(document.querySelector(".stage")),
    skin: document.querySelector(".stage")?.className ?? "",
    sk: Boolean(document.querySelector(".sk")),
    tape: Boolean(document.querySelector(".sk-rail")),
  }))()`);
  console.log(`播放页：${JSON.stringify(landing)}`);
  if (!landing.stage) throw new Error("没有 .stage 根元素");
  if (!landing.sk) throw new Error("新版式没挂上（.sk 不在）—— 默认皮肤不是 editorial？");
  if (!landing.tape) throw new Error("走带不在（.sk-rail）");

  const openShelf = async () => {
    const ok = await evalJs(`(() => {
      const b = [...document.querySelectorAll(".sk-top-b")].find((x) => x.textContent.trim() === "样式");
      b?.click();
      return Boolean(b);
    })()`);
    if (!ok) throw new Error("找不到「样式」按钮");
    await sleep(360);
  };
  const pickSkin = async (name) => {
    const ok = await evalJs(`(() => {
      const b = [...document.querySelectorAll(".sk-opt")].find((x) => x.textContent.includes(${JSON.stringify(name)}));
      b?.click();
      return Boolean(b);
    })()`);
    if (!ok) throw new Error(`选不到皮肤：${name}`);
    await sleep(420);
  };
  const pickTone = async (label) => {
    const ok = await evalJs(`(() => {
      const b = [...document.querySelectorAll(".sk-seg button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
      b?.click();
      return Boolean(b);
    })()`);
    if (!ok) throw new Error(`选不到明暗：${label}`);
    await sleep(320);
  };
  const closeShelf = async () => {
    const ok = await evalJs(`(() => {
      const b = document.querySelector(".sk-shelf-x") ?? document.querySelector(".sk-shelf-mask");
      b?.click();
      return Boolean(b);
    })()`);
    if (!ok) throw new Error("关不掉样式库");
    await sleep(320);
  };

  // 面板本身要给用户看：先开一次截下来（当前皮肤选中态 + 明暗开关都在）
  await openShelf();
  await shoot("skin-shelf.png");
  await closeShelf();

  const CASES = [
    { id: "sl", name: "封套", tone: "深色", tag: "dark" },
    { id: "sl", name: "封套", tone: "浅色", tag: "light" },
    { id: "tt", name: "唱机", tone: "深色", tag: "dark" },
    { id: "tt", name: "唱机", tone: "浅色", tag: "light" },
    { id: "pf", name: "校样", tone: "深色", tag: "dark" },
    { id: "pf", name: "校样", tone: "浅色", tag: "light" },
    { id: "pr", name: "棱镜", tone: "深色", tag: "dark" },
    { id: "pr", name: "棱镜", tone: "浅色", tag: "light" },
  ];

  for (const item of CASES) {
    await openShelf();
    await pickTone(item.tone);
    await pickSkin(item.name);
    await closeShelf();
    // 进场动画 420ms + 封面/频谱稳定
    await sleep(900);
    const probe = await evalJs(`(() => {
      const sk = document.querySelector(".sk");
      const rail = document.querySelector(".sk-rail");
      const de = document.documentElement;
      return {
        cls: sk?.className ?? "",
        tone: sk?.getAttribute("data-tone") ?? "",
        overflowX: de.scrollWidth > de.clientWidth + 1,
        p: rail ? getComputedStyle(rail).getPropertyValue("--p").trim() : "",
        vu: document.querySelectorAll(".tt-vu .bar i").length,
        wave: document.querySelectorAll(".pr-wave i").length,
        // 逐字结构必须挂在 DOM 上；进度值只记日志（曲目刚开播时当前行可能还没开始）
        kw: document.querySelectorAll(".kw").length,
        sung: [...document.querySelectorAll(".kw")].filter((el) => Number(getComputedStyle(el).getPropertyValue("--p")) > 0.05).length,
        // 字号上限：旧值 15cqh 在 604 高的窗口里算出 71px（标题吃掉半屏）
        titlePx: (() => {
          const el = document.querySelector(".sl-title, .tt-title, .pf-title")
            ?? document.querySelector(".pr-lyr .cur, .pr-lyr .sk-karaoke");
          return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : 0;
        })(),
        // 三栏内容不许溢出容器（溢出就会切在半个字上，用户截图实证）
        colsFits: (() => {
          const cols = document.querySelector(".pf-cols");
          if (!cols) return true;
          return [...cols.children].every((el) => el.scrollHeight <= el.clientHeight + 2);
        })(),
        // 封套黑胶不许压到右列文字（1024 宽时曾压进去 4px）
        vinylClear: (() => {
          const v = document.querySelector(".sl-vinyl");
          const info = document.querySelector(".sl-info");
          if (!v || !info) return true;
          return v.getBoundingClientRect().right <= info.getBoundingClientRect().left + 1;
        })(),
      };
    })()`);
    console.log(`皮肤 ${item.id}-${item.tag}：${JSON.stringify(probe)}`);
    if (!probe.cls.includes(`sk-${item.id}`)) throw new Error(`皮肤没切过去：${probe.cls}`);
    if (probe.tone !== item.tag) throw new Error(`明暗没切过去：${probe.tone} ≠ ${item.tag}`);
    if (probe.overflowX) throw new Error(`${item.id}-${item.tag} 横向溢出`);
    // 可红可绿的判据：唱机的两路电平表、棱镜的 96 根发丝声浪必须真的挂上
    if (item.id === "tt" && probe.vu !== 2) throw new Error(`唱机电平表 ${probe.vu} ≠ 2`);
    if (item.id === "pr" && probe.wave !== 96) throw new Error(`棱镜声浪 ${probe.wave} ≠ 96`);
    // 逐字歌词的判据：DOM 里必须有 .kw（说明接的是逐字结构，不是整行字幕）。
    // 具体进度由 --p 逐帧写，命中哪一句取决于播放位置，不做硬断言。
    // 判据：标题不许超过舞台高度的 12%（旧 15cqh 的回潮会直接红）
    const stageH = Number(await evalJs(`Math.round(document.querySelector(".sk").getBoundingClientRect().height)`));
    if (probe.titlePx > stageH * 0.125) {
      throw new Error(`${item.id}-${item.tag} 标题 ${probe.titlePx}px 超过舞台高 ${stageH} 的 12.5%（字号回涨）`);
    }
    if (!probe.colsFits) throw new Error(`${item.id}-${item.tag} 校样三栏内容溢出容器（会切在半个字上）`);
    if (!probe.vinylClear) throw new Error(`${item.id}-${item.tag} 黑胶压到右列文字`);
    if (probe.kw < 1) {
      // 取词是异步的：切完皮肤立刻测会拿到"还没词"的中间态（假红）。
      // 等 1.5s 再看一次，真的没有才算红。
      let kw = probe.kw;
      for (let i = 0; i < 10 && kw < 1; i += 1) {
        await sleep(150);
        kw = Number(await evalJs(`document.querySelectorAll(".kw").length`));
      }
      if (kw < 1) throw new Error(`${item.id}-${item.tag} 没有逐字歌词节点（kw=0，等 1.5s 仍无）`);
    }
    // 棱镜的"折射"必须是活的：连续两次采样，色带的 transform 必须变化。
    // 只截一张静态图看不出它是不是贴图 —— 用户上一轮就是这么发现它不动的。
    if (item.id === "pr" && Number(probe.p) > 0.02) {
      const tf = () => evalJs(`JSON.stringify(
        [...document.querySelectorAll(".pr-fan i")].map((el) => getComputedStyle(el).transform)
      )`);
      const t1 = await tf();
      await sleep(300);
      const t2 = await tf();
      console.log(`棱镜折射：${t1} → ${t2}`);
      const a = JSON.parse(t1);
      const b = JSON.parse(t2);
      if (!a.some((v, i) => v !== b[i])) {
        throw new Error("棱镜色带没动（五道带两次 transform 全同 = 又成了静态贴图）");
      }
    }
    await shoot(`skin-${item.id}-${item.tag}.png`);
  }

  // 走带可拖：点轨道 40% 处应真的改播放位置（松手才 seek 的语义由 Tape 保证，这里验能拖）
  await openShelf();
  await pickSkin("校样");
  await closeShelf();
  await sleep(600);
  const before = await evalJs(`(() => {
    const r = document.querySelector(".sk-range");
    const rect = r?.getBoundingClientRect();
    return rect ? { x: Math.round(rect.left + rect.width * 0.42), y: Math.round(rect.top + rect.height / 2) } : null;
  })()`);
  if (!before) throw new Error("拿不到走带坐标");
  const posBefore = await evalJs(`(() => window.__afeifeiNow?.() ?? null)()`);
  void posBefore;
  win.webContents.sendInputEvent({ type: "mouseDown", x: before.x, y: before.y, button: "left", clickCount: 1 });
  win.webContents.sendInputEvent({ type: "mouseUp", x: before.x, y: before.y, button: "left", clickCount: 1 });
  await sleep(600);
  const railP = await evalJs(`(() => {
    const r = document.querySelector(".sk-rail");
    return r ? getComputedStyle(r).getPropertyValue("--p").trim() : "";
  })()`);
  console.log(`走带点击后 --p = ${railP}`);
  if (!railP || Number(railP) <= 0.05) throw new Error(`走带点击没生效：--p=${railP}`);

  // 窄窗回归：1024×768 下不能挤爆（字号是 cqh，理论会缩，但要用真机证）
  win.setContentSize(1024, 768);
  await sleep(500);
  for (const name of ["封套", "唱机", "校样", "棱镜"]) {
    await openShelf();
    await pickSkin(name);
    await closeShelf();
    await sleep(700);
    const narrow = await evalJs(`(() => {
      const sk = document.querySelector(".sk");
      if (!sk) return { none: true };
      const box = sk.getBoundingClientRect();
      // 只看"真内容"的盒子：光雾是按 vw/vh 溢出的，被 overflow:hidden 裁掉是设计内行为，
      // 拿 scrollHeight 判会误报（第一版就在棱镜的光雾上误报过）。内容盒子越界才是真的被切
      const keys = [".sk-top", ".sl-grid", ".tt-grid", ".pf-body", ".pr-body", ".sk-rail"];
      const out = [];
      for (const sel of keys) {
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.height < 1) continue;
          if (r.bottom > box.bottom + 1 || r.top < box.top - 1 || r.right > box.right + 1 || r.left < box.left - 1) {
            out.push(sel + ":t" + Math.round(r.top - box.top) + " b" + Math.round(r.bottom - box.bottom) + " l" + Math.round(r.left - box.left) + " r" + Math.round(r.right - box.right));
          }
        }
      }
      return { out, over: document.querySelectorAll(".sk-rail").length };
    })()`);
    console.log(`窄窗 ${name}：${JSON.stringify(narrow)}`);
    await shoot(`skin-narrow-${name === "封套" ? "sl" : name === "唱机" ? "tt" : name === "校样" ? "pf" : "pr"}.png`);
  }


  const openView = async () => {
    const ok = await evalJs(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "视图"); b?.click(); return Boolean(b); })()`);
    if (!ok) throw new Error("找不到「视图」按钮");
    await sleep(320);
  };

  // 旧「视图」浮层在新皮肤上的配色（-stage-* 别名是否落到了自己身上）
  await openShelf();
  await pickSkin("封套");
  await pickTone("深色");
  await closeShelf();
  await openView();
  await sleep(400);
  const menu = await evalJs(`(() => {
    const m = document.querySelector(".st-menu");
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { bg: getComputedStyle(m).backgroundColor, w: Math.round(r.width), h: Math.round(r.height), okIn: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
  })()`);
  console.log(`视图浮层：${JSON.stringify(menu)}`);
  if (!menu) throw new Error("视图浮层没打开");
  if (!menu.okIn) throw new Error("视图浮层超出窗口");
  await shoot("skin-view-menu.png");
  await openView();

  // 回首页，别把播放页状态留给下一次运行
  await evalJs(`(() => { document.querySelector(".console .np")?.click(); return true; })()`);
  await sleep(500);

  win.destroy();
  app.quit();
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
