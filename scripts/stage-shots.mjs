/**
 * 播放页截图（stage-v10 a2 重排的验收证据）。
 *
 * **分工**（2026-11-03 定）：本脚本是 **fixture**（离线、快、可供 CI）——
 * 布局截图 + 只能靠 mock 做的判据（A-03 缓存要数歌词接口调用次数，真机数不了）。
 * 权威判据在 `scripts/real-shots.mjs`（真登录 / 真音频 / 真歌词）——
 * 这里的 fixture 判据绿了不算数，只当回归烟测。
 *
 * 跑法：先 node scripts/build.mjs，再 npx electron scripts/stage-shots.mjs
 * 产物：docs/assets/page-stage.png（纸面剧场主图）、stage-<preset>.png ×4、stage-menu.png（视图浮层）
 *
 * 与 page-shots 同一套 fixture 纪律：自开窗口 + 最小 IPC + 临时 userData，
 * 绝不动真实索引。**少一条 IPC 就等于没数据**（bootstrap 整体 reject → 空壳）。
 *
 * 曲库优先读真实索引（%APPDATA% 只读拷贝，过滤 missing），空了才退到系统 wav 并告警——
 * 假数据验出来的"能播"不算数（2026-11-03 教训：fixture 缺 appmedia 时音频从来没响过）。
 */
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const PROFILE = path.join(os.tmpdir(), `afeifei-stage-${process.pid}`);
const MEDIA = "C:\\Windows\\Media";

/*
 * fixture 必须有 appmedia：渲染层只拿 `appmedia://<token>`（50 §11），
 * 缺这条协议 → <audio> 永远 0:00 / LOADING → analyser 无数据 →
 * 「频谱与音量同步」这类判据只能靠猜。必须在 ready 之前一次性注册。
 */
protocol.registerSchemesAsPrivileged([
  { scheme: "appmedia", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// executeJavaScript 里的 el.click() 不是受信任手势，默认策略下 play() 会被拦成
// NotAllowedError（表现就是"点了但一直在 0:00 / 播放态"）。截图脚本要的是真实播放。
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

app.setPath("userData", PROFILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 曲库用**真实索引**（`%APPDATA%/Afeifei 阿飞飞/library.json`），只读拷贝。
 *
 * 上一版是自己编的歌名 + C:\Windows\Media\Alarm0x.wav 凑数：
 * 元数据是假的、时长是假的、封面是假的，频谱也就永远是空态——
 * 拿假数据去证明"真实播放"，等于自己给自己发证据。真实曲库里有歌就用歌。
 */
const REAL_LIBRARY = path.join(process.env.APPDATA ?? "", "Afeifei 阿飞飞", "library.json");

function realTracks() {
  try {
    const parsed = JSON.parse(fs.readFileSync(REAL_LIBRARY, "utf8"));
    return (parsed.tracks ?? []).filter((t) => !t.missing && fs.existsSync(t.path));
  } catch {
    return [];
  }
}

/** 真实曲库为空时才退到系统 wav（冷机器/CI 上仍要能出图，但会在日志里喊一声）。 */
function fallbackTracks() {
  console.warn(`真实曲库不可用（${REAL_LIBRARY}），退回系统 wav —— 这张图不代表真实数据`);
  return [
    ["老人と海", "ヨルシカ", "老人と海", 321000],
    ["打上花火", "Daoko / 米津玄師", "打上花火", 268000],
    ["Daisy", "Aimer", "Daisy", 284000],
    ["Lay Down", "Caravan Palace", "Lay Down", 207000],
  ].map(([title, artist, album, durationMs], i) => {
    const p = path.join(MEDIA, `Alarm0${i + 1}.wav`);
    return {
      id: p.replace(/\\/g, "/").toLowerCase(),
      path: p,
      title,
      artist,
      album,
      durationMs,
      size: 400000,
      mtimeMs: 1000 + i,
      hasCover: false,
    };
  });
}

const TRACKS = (() => {
  const real = realTracks();
  return real.length > 0 ? real : fallbackTracks();
})();

/**
 * 本机 http 小服务：把真实曲库的第一首原样喂给"在线"那一路。
 * 在线播放走 appstream 代理（主进程 net.fetch + Range 透传），给假地址就会 502，
 * 播放页整个 error —— 上一版就是这样，只好用 CSS 把状态栏藏起来。这里给真字节。
 */
let ONLINE_URL = "";
function startOnlineServer() {
  const src = TRACKS[0]?.path;
  const server = http.createServer((req, res) => {
    if (!src || !fs.existsSync(src)) return res.writeHead(404).end();
    const size = fs.statSync(src).size;
    const m = req.headers.range ? /bytes=(\d*)-(\d*)/.exec(req.headers.range) : null;
    if (!m) {
      res.writeHead(200, { "content-type": "audio/mpeg", "content-length": String(size), "accept-ranges": "bytes" });
      return res.end(fs.readFileSync(src));
    }
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : size - 1;
    res.writeHead(206, {
      "content-type": "audio/mpeg",
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": String(end - start + 1),
      "accept-ranges": "bytes",
    });
    return fs.createReadStream(src, { start, end }).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      ONLINE_URL = `http://127.0.0.1:${server.address().port}/online.mp3`;
      resolve(server);
    });
  });
}

/** 在线态 fixture：让播放页走到「有歌词」的分支（本地 wav 永远没有歌词）。 */
const LRC = [
  "[00:00.00]他梦见狮子回到沙滩上。",
  "[00:04.00]马林鱼把小船拖进深蓝",
  "[00:08.00]群鲨来的那晚星星很低",
  "[00:12.00]而帆在盐粒里慢慢变旧",
  "[00:16.00]老人把星辰缝进补丁",
  "[00:20.00]海流把名字冲成传说",
  "[00:24.00]灯塔数着回港的次数",
  "[00:28.00]浪把誓言写在沙上又收走",
  "[00:32.00]他与海交换一生的沉默",
  "[00:36.00]天亮时渔线还在手中。",
  "[00:40.00]汽笛在梦的第三段靠岸",
  "[00:44.00]八十五天的清晨没有鱼",
].join("\n");

/** 歌词接口被调了几次：A-03「缓存到本地」判据要数这个数（重启后应不增）。 */
let lyricCalls = 0;

function registerMinimalIpc() {
  const file = (name) => path.join(PROFILE, name);
  const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
  const writeFile = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };

  // 音源自带的通用转发口：只认截图需要的三个方法，别的原样回落
  ipcMain.handle("netease:call", (_e, method) => {
    if (method === "cloudsearch") {
      return {
        result: {
          songCount: 1,
          songs: [
            {
              id: 1901371647,
              name: "老人と海",
              ar: [{ name: "ヨルシカ" }],
              al: { name: "老人と海" },
              dt: 321000,
            },
          ],
        },
      };
    }
    if (method === "song_url_v1") {
      // 播放地址指向本机 http 小服务，**放的是真实曲库里的真音频**：
      // 上一版给 example.invalid，于是播放页永远 error、状态栏得靠 CSS 藏起来——
      // 等于把"没声"这一个缺陷伪装成"有数据"。用完记得 close 掉。
      return { data: [{ url: ONLINE_URL, code: 200 }] };
    }
    // 2026-11-03：源侧已改调 lyric_new（要 yrc 逐字）；老 lyric 分支留作回落
    if (method === "lyric" || method === "lyric_new") {
      lyricCalls += 1; // A-03 缓存判据要数调用次数
      const T = LRC.split("\n")
        .map((l) => l.replace(/^(\[[^\]]+\])(.*)$/, "$1译·$2"))
        .join("\n");
      return { lrc: { lyric: LRC }, tlyric: { lyric: T } };
    }
    return {};
  });
  ipcMain.handle("netease:profile", () => ({ loggedIn: true, nick: "阿飞飞", uid: "1" }));

  ipcMain.handle("library:loadIndex", () => readFile(file("library.json")));
  ipcMain.handle("library:saveIndex", (_e, json) => writeFile(file("library.json"), json));
  // readLog 必须给 ""：真主进程读不到文件也返回空串，parseLog 对 null 会崩
  ipcMain.handle("library:readLog", () => "");
  ipcMain.handle("library:appendLog", () => undefined);
  ipcMain.handle("library:clearLog", () => undefined);
  ipcMain.handle("library:cover", () => null);
  ipcMain.handle("store:read", (_e, key) => readFile(file(`store-${String(key)}.json`)));
  ipcMain.handle("store:write", (_e, key, json) => writeFile(file(`store-${String(key)}.json`), json));
  ipcMain.handle("app-state:load", () => null);
  ipcMain.handle("app-state:save", () => undefined);
  ipcMain.handle("download:usage", () => 0);
  ipcMain.handle("download:dir", () => PROFILE);
  // 这两个不注册的话渲染层会抛 Uncaught (in promise)，真实报错会被淹在这两条噪音下面
  ipcMain.handle("scheme:poll", () => []);
  ipcMain.handle("app:lastCrash", () => null);

  /*
   * 音频：令牌用 hex(路径)。
   * 不能用裸路径 —— URL 的 hostname 会被转小写且不能带反斜杠，
   * C:\Windows\Media\Alarm01.wav 会直接变非法 URL。hex 全小写安全（同 appstream 的取舍）。
   */
  ipcMain.handle("media:grant", (_e, p) => (typeof p === "string" ? Buffer.from(p, "utf8").toString("hex") : null));
  protocol.handle("appmedia", async (request) => {
    const host = new URL(request.url).hostname;
    let file = "";
    try {
      file = Buffer.from(host, "hex").toString("utf8");
    } catch {
      return new Response("bad token", { status: 400 });
    }
    let body;
    try {
      body = await fs.promises.readFile(file);
    } catch {
      return new Response("not found", { status: 404 });
    }
    return new Response(body, {
      status: 200,
      headers: { "content-type": "audio/wav", "content-length": String(body.length), "accept-ranges": "bytes" },
    });
  });
}

const PRESETS = ["paper", "vinyl", "minimal", "cinema"];
const PRESET_NAMES = ["纸面剧场", "黑胶唱机", "极简留白", "电影感"];

app.whenReady().then(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.writeFileSync(path.join(PROFILE, "library.json"), JSON.stringify({ v: 1, tracks: TRACKS, savedAt: Date.now() }));
  console.log(`曲库：${TRACKS.length} 首（${TRACKS[0] ? TRACKS[0].title : "空"} …）`);
  const server = await startOnlineServer();
  console.log(`在线音频代理：${ONLINE_URL}`);
  registerMinimalIpc();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,
    show: true, // 隐藏窗口会被节流，React 更新迟一拍
    webPreferences: {
      preload: path.resolve("dist/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) console.log("RENDER|", message);
  });
  await win.loadFile(path.resolve("dist/renderer/index.html"));
  await sleep(900);

  fs.mkdirSync(OUT, { recursive: true });

  // 点第一行真播：队列 = 8 首，右栏「接下来」与「台词本」才有数据可截
  const played = await win.webContents.executeJavaScript(
    `(() => { const r = document.querySelector('.lib-row'); if (!r) return false; r.click(); return true; })()`,
    true,
  );
  if (!played) throw new Error("曲库没有行，fixture 未生效");
  await sleep(700);

  // console 左端「正在播放」整块 = 进播放页
  const entered = await win.webContents.executeJavaScript(
    `(() => { const b = document.querySelector('.np'); if (!b) return false; b.click(); return true; })()`,
    true,
  );
  if (!entered) throw new Error("找不到 console 的 .np 入口");

  const shot = async (name) => {
    await sleep(500);
    fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
    console.log(`shot → docs/assets/${name}`);
  };

  await shot("page-stage.png"); // 主图：纸面剧场（默认预设）

  /*
   * A-07 三条判据（fixture 现在有 appmedia，wav 真的会响，analyser 才有数据）：
   * ① 频谱不再专属电影感 —— 纸面预设下 canvas 存在（上一版 `preset === "cinema"` 时这里是 0 个），
   *    且**正在播时有像素**；
   * ② 与音量同步 —— 暂停后柱高全 0，画布必须**全空**（旧实现每条 `Math.max(2, …)` 会留一排地板线）；
   * ③ 低端机可关 —— 视图里取消「频谱」，canvas 元素直接不渲染，每帧绘制整段不跑。
   */
  const countCanvas = `document.querySelectorAll(".st-spectrum").length`;
  const litPixels = `(() => {
    const c = document.querySelector(".st-spectrum");
    if (!c) return -1;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit += 1;
    return lit;
  })()`;

  // 先确认真的在放：引擎用的是 detached `new Audio()`（不在 DOM 里），
  // 只能按 console 播放键的状态 + 走动的计时判断
  const playing = await win.webContents.executeJavaScript(
    `new Promise((resolve) => {
      const deadline = Date.now() + 6000;
      const label = () => document.querySelector("button.tb.main")?.getAttribute("aria-label");
      const clock = () => (document.querySelector(".seek .tm")?.textContent || "").trim();
      const t0 = clock();
      const tick = () => {
        if (label() === "暂停" && clock() !== t0 && clock() !== "" && clock() !== "0:00") return resolve(true);
        if (Date.now() > deadline) return resolve("label=" + label() + " clock=" + clock());
        setTimeout(tick, 100);
      };
      tick();
    })`,
    true,
  );
  if (playing !== true) throw new Error(`fixture 没在放音（${playing}）：appmedia 没生效，频谱判据不成立`);
  await sleep(500);

  const inPaper = await win.webContents.executeJavaScript(countCanvas, true);
  if (inPaper !== 1) throw new Error(`纸面预设下频谱 canvas 应有 1 个，实际 ${inPaper}`);
  const litPlaying = await win.webContents.executeJavaScript(litPixels, true);
  if (litPlaying <= 0) throw new Error(`正在播但频谱一个像素都没画（lit=${litPlaying}）`);
  await shot("page-stage-spectrum.png");

  await win.webContents.executeJavaScript(`document.querySelector("button.tb.main")?.click()`, true);
  await sleep(600);
  const litPaused = await win.webContents.executeJavaScript(litPixels, true);
  if (litPaused !== 0) throw new Error(`暂停后频谱还剩 ${litPaused} 个像素：静音该画空，不画假波形`);
  await win.webContents.executeJavaScript(`document.querySelector("button.tb.main")?.click()`, true); // 继续放
  await sleep(400);

  // 图层那一行有三个复选框（壁纸/频谱/歌词），必须按 label 文案取，不能取行内第一个
  const clickSpectrumBox = `(() => {
    const label = [...document.querySelectorAll(".st-menu-row label")].find(
      (l) => l.textContent.trim() === "频谱",
    );
    const box = label?.querySelector('input[type="checkbox"]');
    if (!box) return false;
    box.click();
    return true;
  })()`;
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  await sleep(250);
  if (!(await win.webContents.executeJavaScript(clickSpectrumBox, true))) {
    throw new Error("视图浮层里找不到「频谱」开关");
  }
  await sleep(250);
  const afterOff = await win.webContents.executeJavaScript(countCanvas, true);
  if (afterOff !== 0) throw new Error(`关掉频谱后 canvas 仍在（${afterOff} 个）：低端机开关没生效`);
  await win.webContents.executeJavaScript(clickSpectrumBox, true);
  await sleep(250);
  const afterOn = await win.webContents.executeJavaScript(countCanvas, true);
  if (afterOn !== 1) throw new Error(`重新打开频谱后 canvas 没回来（${afterOn} 个）`);
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true); // 收浮层
  await sleep(250);
  console.log(
    `A-07 OK：纸面预设也有频谱（在播 ${litPlaying} px → 暂停 0 px）· 关掉后 canvas 消失 · 再开恢复`,
  );

  /*
   * b2 沉浸态（fixture 回归烟测；权威判据在 real-shots 的真登录链路末尾）：
   * 点「沉浸」→ 覆盖层出现 + 盘转 → 暂停停转（一个状态一个表现）→ Esc 退回；
   * 再把窗口压到 800 宽验证降级文案（b2 稿的 ≥900px 线）。
   */
  const immerSpin = `(() => {
    const disc = document.querySelector(".st-immer .im-disc .disc");
    return disc ? disc.getAnimations().some((a) => a.playState === "running") : null;
  })()`;
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.st-viewbtn')].find((b) => b.textContent.trim() === '沉浸')?.click()`,
    true,
  );
  await sleep(300);
  let spinning = await win.webContents.executeJavaScript(immerSpin, true);
  if (spinning !== true) throw new Error(`沉浸态盘没在转（${spinning}）：播放中旋转动画应 running`);
  await shot("stage-immer.png");
  await win.webContents.executeJavaScript(`document.querySelector('.st-immer .im-tb button.main')?.click()`, true);
  await sleep(300);
  const stalled = await win.webContents.executeJavaScript(
    `(() => {
      const d = document.querySelector(".st-immer .im-disc");
      if (!d) return null;
      const paused = d.classList.contains("stalled");
      const anim = d.querySelector(".disc")?.getAnimations().every((a) => a.playState !== "running");
      return paused && anim;
    })()`,
    true,
  );
  if (stalled !== true) throw new Error(`暂停后盘没停（stalled+动画=${stalled}）：暂停态表现不一致`);
  await win.webContents.executeJavaScript(`document.querySelector('.st-immer .im-tb button.main')?.click()`, true); // 复原播放
  await sleep(250);
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`,
    true,
  );
  await sleep(250);
  if ((await win.webContents.executeJavaScript(`document.querySelector('.st-immer') !== null`, true))) {
    throw new Error("按 Esc 没有退出沉浸态");
  }
  console.log("b2 沉浸态 OK：覆盖层 · 盘转/停跟播放态 · Esc 退回");

  // 窄窗降级（b2 稿 ≥900px 线）：800 宽下只留提示文案，正文与走带整块不渲染
  const oldBounds = win.getBounds();
  win.setBounds({ width: 800, height: oldBounds.height });
  await sleep(350);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.st-viewbtn')].find((b) => b.textContent.trim() === '沉浸')?.click()`,
    true,
  );
  await sleep(300);
  const narrow = await win.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector(".st-immer");
      if (!el) return "no .st-immer";
      const tip = el.querySelector(".im-narrow");
      const body = el.querySelector(".im-body");
      const tipShown = tip ? getComputedStyle(tip).display !== "none" : false;
      const bodyGone = body ? getComputedStyle(body).display === "none" : true;
      return tipShown && bodyGone && (tip?.textContent || "").includes("900px")
        ? true
        : "tip=" + tipShown + " body=" + bodyGone;
    })()`,
    true,
  );
  if (narrow !== true) throw new Error(`窄窗没有降级提示（${narrow}）：应有 .st-immer.narrow + 900px 文案 + 正文隐藏`);
  await shot("stage-immer-narrow.png");
  win.setBounds(oldBounds);
  await sleep(250);
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`,
    true,
  );
  console.log("b2 沉浸态窄窗 OK：800 宽降级为提示，正文隐藏");

  // 四套预设：先开「视图」浮层，再逐套点；轮询到高亮真的变了才拍
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  await sleep(200);

  for (let i = 0; i < PRESETS.length; i += 1) {
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('.st-presets button')[${i}].click()`,
      true,
    );
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
    await shot(`stage-${PRESETS[i]}.png`);
  }

  /* ---- 在线态：本地 wav 没有歌词，只有走在线才验得到田字格与台词本 ---- */
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true); // 收浮层
  const navOk = await win.webContents.executeJavaScript(
    `(() => { const n = [...document.querySelectorAll('.rail button')].find(b => b.textContent === '在线'); n?.click(); return !!n; })()`,
    true,
  );
  if (!navOk) throw new Error("找不到导航项「在线」");
  await sleep(300);

  // 音源默认选第一个（示例源），示例源不给播放地址 → 必须显式切到网易云
  const srcOk = await win.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('.seg button')].find(x => x.textContent.includes('网易云')); b?.click(); return !!b; })()`,
    true,
  );
  if (!srcOk) throw new Error("找不到网易云音源 chip");
  await sleep(300);

  await win.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector('.search');
      if (!input) return false;
      // React 受控输入：走原生 setter + input 事件，直接赋 value 不会触发 onChange
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '老人と海');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
    true,
  );
  await sleep(200);
  // 搜索按钮在搜索栏里（`.lib-head` 那头是页面标题），按文案找，别绑位置
  const searchOk = await win.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === '搜索'); b?.click(); return !!b; })()`,
    true,
  );
  if (!searchOk) throw new Error("找不到搜索按钮");
  await sleep(700);
  const rowOk = await win.webContents.executeJavaScript(
    `(() => { const r = document.querySelector('.online-row'); if (!r) return false; r.click(); return true; })()`,
    true,
  );
  if (!rowOk) throw new Error("在线搜索结果为空（netease:call mock 未生效）");
  await sleep(900);

  await win.webContents.executeJavaScript(`document.querySelector('.np')?.click()`, true);
  await sleep(600);
  // 预设循环停在 cinema（暗底），台词本验收要回到纸面剧场才看得清
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  await sleep(250);
  await win.webContents.executeJavaScript(`document.querySelectorAll('.st-presets button')[0]?.click()`, true);
  await sleep(400);
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  await sleep(300);
  // 在线曲目也必须真的在放：上一版给了 example.invalid 的假地址，只好把状态栏藏起来，
  // 等于把"没声"伪装成"有数据"。现在真字节，验它，不藏它。
  const onlinePlaying = await win.webContents.executeJavaScript(
    `new Promise((resolve) => {
      const deadline = Date.now() + 8000;
      const label = () => document.querySelector("button.tb.main")?.getAttribute("aria-label");
      const clock = () => (document.querySelector(".seek .tm")?.textContent || "").trim();
      const t0 = clock();
      const tick = () => {
        if (label() === "暂停" && clock() !== t0 && clock() !== "" && clock() !== "0:00") return resolve(true);
        if (Date.now() > deadline) return resolve("label=" + label() + " clock=" + clock());
        setTimeout(tick, 100);
      };
      tick();
    })`,
    true,
  );
  if (onlinePlaying !== true) {
    throw new Error(`在线曲目没在放（${onlinePlaying}）：appstream 代理或本机 http 服务没通`);
  }
  await shot("page-stage-lyric.png");

  /*
   * A-10 判据「播放页样式与主题独立」：切夜间后播放页的计算样式必须**逐字节相同**。
   * 探针挑的是最容易被结构层串味的四处：整页底/字、田字格、译文注、视图浮层。
   * 同时验外壳确实换了（--bg 变），否则"两边都一样"可能只是主题没生效。
   */
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  await sleep(300);
  /*
   * 采样取"稳定值"：`.st-kb` 有 0.18s 颜色过渡，歌词每点亮一格都会重启动画，
   * 一次性采样可能落在中间色（实测拿到过 oklab 半透明）。原来想注入 <style> 冻过渡，
   * 但 CSP `style-src 'self'` 直接拒绝，那段冻的是空气 —— 改成轮询到连续两次读数一致。
   */
  const PROBE = `(async () => {
    const read = () => {
      const pick = (sel, props) => {
        const el = document.querySelector(sel);
        if (!el) return "MISSING";
        const cs = getComputedStyle(el);
        return props.map((p) => cs.getPropertyValue(p)).join("|");
      };
      return {
        stage: pick(".stage", ["background-color", "color"]),
        kb: pick(".st-kb", ["color", "border-top-color"]),
        trans: pick(".st-trans", ["color"]),
        menu: pick(".st-menu", ["background-color", "border-top-color", "color"]),
        accent: pick(".stage", ["--accent"]),
        shellBg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
      };
    };
    let prev = read();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 60));
      const cur = read();
      if (JSON.stringify(cur) === JSON.stringify(prev)) return cur; // 连续两次一致 = 过渡已结束
      prev = cur;
    }
    return prev;
  })()`;
  const lightTheme = await win.webContents.executeJavaScript(PROBE, true);
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = "dark"`, true);
  const darkTheme = await win.webContents.executeJavaScript(PROBE, true);

  for (const key of ["stage", "kb", "trans", "menu", "accent"]) {
    if (lightTheme[key] === "MISSING" || darkTheme[key] === "MISSING") {
      throw new Error(`A-10 探针找不到元素：${key}`);
    }
    if (lightTheme[key] !== darkTheme[key]) {
      throw new Error(`播放页跟着主题变了（${key}）：亮 ${lightTheme[key]} ≠ 暗 ${darkTheme[key]}`);
    }
  }
  if (lightTheme.shellBg === darkTheme.shellBg) {
    throw new Error("外壳底色没变：主题没真正切换，独立性判据不成立");
  }
  await shot("page-stage-dark.png");
  console.log(
    `A-10 OK：播放页在夜间完全不变（整页 ${lightTheme.stage}）· 外壳 --bg ${lightTheme.shellBg} → ${darkTheme.shellBg}`,
  );
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = "light"`, true);
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  await sleep(250);

  /*
   * A-03 判据「可切」+「持久化」：这三条都是真的会红的断言
   * ① 双语并排：在线歌词必须渲染出非空的 .st-trans
   * ② 切原文：视图浮层里关掉「译文」后，面板与台词本都不再有 .st-trans
   * ③ 落盘：stage-ui 的 500ms 合并写之后，存档里 translation === false
   */
  const hadTrans = await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".st-trans")].some((p) => p.textContent.trim().length > 0)`,
    true,
  );
  if (!hadTrans) throw new Error("在线歌词没有渲染出译文行：A-03 双语并排未生效");

  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  await sleep(250);
  const toggled = await win.webContents.executeJavaScript(
    `(() => {
      const row = [...document.querySelectorAll('.st-menu-row')].find((r) => r.textContent.includes('译文'));
      const box = row?.querySelector('input[type=checkbox]');
      if (!box) return false;
      box.click();
      return true;
    })()`,
    true,
  );
  if (!toggled) throw new Error("视图浮层里找不到「译文」开关");
  await sleep(300);
  await win.webContents.executeJavaScript(`document.querySelector('.st-viewbtn')?.click()`, true);
  const transGone = await win.webContents.executeJavaScript(
    `document.querySelector('.st-trans') === null`,
    true,
  );
  if (!transGone) throw new Error("关掉译文后 .st-trans 仍在");
  await shot("page-stage-lyric-raw.png");

  await sleep(700); // 等 stage-ui 的 500ms 合并写盘
  const stageJson = JSON.parse(fs.readFileSync(path.join(PROFILE, "store-stage-ui.json"), "utf8"));
  if (stageJson.translation !== false) throw new Error(`译文开关没落盘：${JSON.stringify(stageJson)}`);
  console.log("A-03 OK：译文并排可见 · 关掉后消失 · translation=false 已落盘");

  /* ---- A-03 判据「缓存到本地」：重启界面后复播同一首，不该再打歌词接口 ---- */
  const cacheFile = path.join(PROFILE, "store-lyric-cache.json");
  if (!fs.existsSync(cacheFile)) throw new Error("lyric-cache 没有落盘");
  const callsBefore = lyricCalls;

  win.webContents.reload();
  await sleep(1400);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.rail button')].find(b => b.textContent === '在线')?.click()`,
    true,
  );
  await sleep(300);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.seg button')].find(x => x.textContent.includes('网易云'))?.click()`,
    true,
  );
  await sleep(300);
  await win.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector('.search');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '老人と海');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
    true,
  );
  await sleep(200);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('button')].find(x => x.textContent === '搜索')?.click()`,
    true,
  );
  await sleep(800);
  await win.webContents.executeJavaScript(`document.querySelector('.online-row')?.click()`, true);
  await sleep(900);
  await win.webContents.executeJavaScript(`document.querySelector('.np')?.click()`, true);
  await sleep(900);

  if (lyricCalls !== callsBefore) {
    throw new Error(`缓存没命中：重启后重播同一首又请求了 ${lyricCalls - callsBefore} 次歌词`);
  }
  const lyricRendered = await win.webContents.executeJavaScript(
    `document.querySelectorAll('.st-kb').length > 0 || document.querySelector('.st-min') !== null`,
    true,
  );
  if (!lyricRendered) throw new Error("缓存命中的歌词没有渲染到播放页");
  console.log("A-03 缓存 OK：重启后复播同一首，歌词接口 0 次调用，页面仍有歌词");

  server.close(); // 本机 http 服务不关的话进程会挂着不退出
  app.quit();
});
