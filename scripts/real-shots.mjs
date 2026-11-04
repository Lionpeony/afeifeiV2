/**
 * 真机截图：跑**真主进程 + 真登录态**，不是 fixture。
 *
 * 为什么另起一个脚本：`stage-shots.mjs` 是 fixture（假 netease:call、假播放地址），
 * 拿假登录去验"在线播放/频谱/歌词"必然验不出东西——假 session 换不来真 vkey。
 * 这里把真实 userData 复制到临时目录（不动正在跑的那份，也绕开单实例锁），
 * 用 chromium 的 --remote-debugging-port 驱动真实窗口：点歌 → 进播放页 → 截图 + 断像素。
 *
 * 跑法：node scripts/build.mjs 之后
 *       node scripts/real-shots.mjs             # 默认截播放页
 * 产物：docs/assets/real-stage.png、real-stage-dark.png
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// 曲库 schema 从构建产物复用（与渲染层同一份代码，映射零漂移）；没跑过 build:test 先报清楚
let trackIdOf, createSnapshot;
try {
  const schema = await import("../dist-test/schema.mjs");
  trackIdOf = schema.trackIdOf;
  createSnapshot = schema.createSnapshot;
} catch {
  console.error("缺 dist-test/schema.mjs：先 node scripts/build.mjs --test（或 npm run verify）");
  process.exit(1);
}

const APP_NAME = "Afeifei 阿飞飞";
const REAL_PROFILE = path.join(process.env.APPDATA ?? "", APP_NAME);
const PORT = 9333;
const OUT = path.resolve("docs/assets");
const ELECTRON = path.resolve("node_modules/electron/dist/electron.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 只搬"状态"，不搬缓存体：Chromium 缓存几百 MB，搬了纯浪费。
 * 注意 Windows 大小写不敏感：应用自己的 `cache/`（存 QQ 会话）与 Chromium 的 `Cache/`
 * 是**同一个物理目录**，整目录跳过会把 qq-auth-sessions.json 一起丢掉，
 * 所以这里只跳 Cache_Data（Chromium 的缓存体），不跳 Cache 本身。
 */
const SKIP = new Set(["Cache_Data", "GPUCache", "Code Cache", "DawnGraphiteCache", "DawnWebGPUCache", "blob_storage"]);

function copyProfile(dstRoot) {
  if (!fs.existsSync(REAL_PROFILE)) throw new Error(`找不到真实用户目录：${REAL_PROFILE}`);
  const dst = path.join(dstRoot, APP_NAME);
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(REAL_PROFILE, dst, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });
  // 真实目录里有历次崩溃记录，复制过去首页会挂一条"上次异常退出"横幅，把版心整体下压。
  // 崩溃日志在 <userData>/logs/crash-*.log（src/main/crash.ts），连同 crash-seen.json 一起清掉。
  const logs = path.join(dst, "logs");
  if (fs.existsSync(logs)) {
    for (const name of fs.readdirSync(logs)) {
      if (/^crash-.*\.(log|json)$/.test(name)) fs.rmSync(path.join(logs, name), { force: true });
    }
  }
  // QQ 会话是 QQ 真机判据的命根子：没复制到就提前喊，别等到「请先登录」再猜
  const sess = path.join(dst, "cache", "qq-auth-sessions.json");
  console.log(
    `QQ 会话文件：${fs.existsSync(sess) ? `${fs.statSync(sess).size}B 已复制` : "没复制到（restoredCount 必为 0）"}`,
  );
  return dst;
}

async function targets() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    return await res.json();
  } catch {
    return [];
  }
}

/** 极简 CDP 客户端：够用就行（Runtime.evaluate + Page.captureScreenshot）。 */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let seq = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(new Error(`CDP 连接失败：${e.message ?? e}`)));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const hit = pending.get(msg.id);
    if (!hit) return;
    pending.delete(msg.id);
    if (msg.error) hit.reject(new Error(msg.error.message));
    else hit.resolve(msg.result);
  });
  const send = (method, params = {}) => {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  return {
    ready,
    send,
    close: () => ws.close(),
    /** 在页面里跑一段表达式；抛错会带着页面里的 message 回来，别吞。 */
    async evaluate(expression) {
      const r = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      }
      return r.result?.value;
    },
    async shot(file) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
      console.log(`shot → docs/assets/${file}`);
    },
  };
}

/** 轮询到条件成立；返回 true/false 而不是抛，方便日志里看清卡在哪一步。 */
async function until(page, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(expression)) return true;
    } catch {
      /* 页面重载中，继续等 */
    }
    await sleep(200);
  }
  console.log(`超时：${label}`);
  return false;
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afeifei-real-"));
copyProfile(tmpRoot);
console.log(`已复制真实登录态 → ${tmpRoot}`);

/*
 * Chromium 的开关必须排在 app 路径**前面**，写在后面会被当成应用的 argv 丢掉。
 * userData 只能靠 `--user-data-dir` 改：app.getPath("appData") 走的是系统 API，
 * 改 APPDATA 环境变量没用（改了也还是同一个 userData → 单实例锁 → 直接 quit，连窗口都不建）。
 */
const profileDir = path.join(tmpRoot, APP_NAME);
const child = spawn(
  ELECTRON,
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, path.resolve("dist/main.js")],
  { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
);
child.stdout.on("data", (b) => process.stdout.write(`[main] ${b}`));
child.stderr.on("data", (b) => process.stderr.write(`[main] ${b}`));

let page;
try {
  // 等窗口起来（真主进程要建 tray / 媒体键 / 扫曲库，给足 30s）
  let target = null;
  for (let i = 0; i < 120 && !target; i += 1) {
    await sleep(250);
    target = (await targets()).find((t) => t.type === "page" && t.url.includes("index.html"));
  }
  if (!target) throw new Error("30s 内没等到主窗口的调试目标");

  page = cdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.evaluate(`1`);
  console.log("已连上真实窗口");

  // 视口固定 1280×800：真实窗口尺寸来自 settings 里保存的 windowW/H，
  // 每台机器不一样，截图与"窄窗/宽窗"判据都得有个确定的基准
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(400);

  if (await page.evaluate(`document.body.innerText.includes("上次异常退出")`)) {
    throw new Error("界面上还挂着「上次异常退出」横幅：截图证据不干净");
  }

  fs.mkdirSync(OUT, { recursive: true });

  // 在线 → 网易云 → 搜一首 → 播（真实 session，真 vkey）
  const railReady = await until(page, `document.querySelectorAll('.rail button').length > 0`, 15000, "导航就绪");
  if (!railReady) throw new Error("15s 内导航栏没渲染出来");
  const labels = await page.evaluate(`[...document.querySelectorAll('.rail button')].map((b) => b.textContent.trim())`);
  console.log(`导航项：${labels.join(" | ")}`);

  /*
   * 真实本地曲库自愈：快照（library.json）可能不在了（本机 2026-11-04 实测被清掉，
   * 目录配置还留在旧版 library-index.json 里）。用应用自己的 scan/readTags IPC 对
   * **真实目录**重新解析真实文件的标签，映射复用 dist-test 里的同一份 schema 代码，
   * 经 saveIndex 原子写进**临时副本**再刷新 —— 真实 userData 全程不动，数据全部真实。
   */
  let libCount = -1;
  try {
    const legacyDirs = JSON.parse(fs.readFileSync(path.join(profileDir, "library-index.json"), "utf8")).dirs;
    if (Array.isArray(legacyDirs) && legacyDirs.length > 0) {
      const metas = await page.evaluate(
        `(async () => window.api.readTags(await window.api.scan(${JSON.stringify(legacyDirs)})))()`,
      );
      // 与 domain/library/scan.ts 的 toTrack 同形（id 规范化用的是同一份 dist-test/schema.mjs）
      const tracks = (Array.isArray(metas) ? metas : [])
        .filter((m) => m && typeof m.path === "string")
        .map((m) => ({
          id: trackIdOf(m.path),
          path: m.path,
          title: m.title,
          artist: m.artist,
          album: m.album,
          durationMs: m.durationMs,
          size: m.size,
          mtimeMs: m.mtimeMs,
          hasCover: m.hasCover,
        }));
      if (tracks.length > 0) {
        await page.evaluate(
          `window.api.saveIndex(${JSON.stringify(JSON.stringify(createSnapshot(tracks)))}).then(() => location.reload())`,
        );
        await sleep(1800);
        await until(page, `document.querySelectorAll('.rail button').length > 0`, 15000, "刷新后导航");
        libCount = tracks.length;
        console.log(`本地曲库自愈：真实扫描 ${legacyDirs.join("、")} → ${tracks.length} 首`);
      }
    }
  } catch (e) {
    console.log(`本地曲库自愈跳过：${e.message ?? e}`);
  }

  const ok = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('.rail button')].find((x) => x.textContent.includes('在线'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!ok) throw new Error(`找不到导航项「在线」，实际有：${labels.join("|")}`);
  await sleep(800);

  // 音源必须显式切到网易云：默认是示例源，示例源不给播放地址
  const src = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('.seg button')].find((x) => x.textContent.includes('网易云'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  console.log(`网易云 chip：${src ? "已选" : "没找到"}`);
  await sleep(500);

  const typed = await page.evaluate(`(() => {
    const input = document.querySelector('.search');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Dancin Krono');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!typed) throw new Error("找不到搜索框");
  await sleep(300);
  await page.evaluate(
    `[...document.querySelectorAll('button')].find(x => x.textContent.trim() === '搜索')?.click()`,
  );

  const searched = await until(page, `document.querySelectorAll('.online-row').length > 0`, 20000, "搜索结果");
  if (!searched) {
    const dump = await page.evaluate(`(() => ({
      value: document.querySelector('.search')?.value,
      buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12),
      rows: document.querySelectorAll('.online-row').length,
      body: (document.querySelector('.empty') || document.querySelector('[class*=err]') || {}).textContent || "",
      url: location.href,
    }))()`);
    throw new Error(`20s 没有搜索结果：${JSON.stringify(dump)}`);
  }

  await page.evaluate(`document.querySelector('.online-row').click()`);
  await sleep(1200);
  await page.evaluate(`document.querySelector('.np')?.click()`);
  await sleep(1200);

  const playing = await until(
    page,
    `(() => {
      const label = document.querySelector("button.tb.main")?.getAttribute("aria-label");
      const clock = (document.querySelector(".seek .tm")?.textContent || "").trim();
      return label === "暂停" && clock !== "" && clock !== "0:00";
    })()`,
    30000,
    "在线曲目起播",
  );
  if (!playing) {
    const dump = await page.evaluate(`(() => ({
      title: document.querySelector(".np-tx b")?.textContent || "",
      label: document.querySelector("button.tb.main")?.getAttribute("aria-label"),
      clock: document.querySelector(".seek .tm")?.textContent || "",
      status: document.querySelector(".tbar .status")?.textContent || "",
      note: document.querySelector(".lib-note")?.textContent || "",
      firstRow: (document.querySelector(".online-row")?.textContent || "").slice(0, 80),
    }))()`);
    throw new Error(`在线曲目 30s 内没起播（真登录）：${JSON.stringify(dump)}`);
  }
  console.log("在线曲目已起播（真实 vkey）");

  await sleep(800);

  /*
   * 田字格不许互相压：真实 yrc 的逐字单位是**词**（"Dancin'"、"all"），
   * 塞进固定方格会画到隔壁格子上，整行糊成一片。
   * 判据：同一行相邻格子不许重叠，且格子内容不许溢出自身宽度。
   */
  const grid = await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('.st-kb')];
    const bad = [];
    boxes.forEach((el, i) => {
      if (el.scrollWidth > el.clientWidth + 1) bad.push("overflow#" + i + ":" + el.textContent);
      const a = el.getBoundingClientRect();
      const next = boxes[i + 1];
      if (!next) return;
      const b = next.getBoundingClientRect();
      if (Math.abs(a.top - b.top) < 2 && b.left < a.right - 1) {
        bad.push("overlap#" + i + ":" + el.textContent + "/" + next.textContent);
      }
    });
    return { count: boxes.length, bad };
  })()`);
  if (grid.count === 0) throw new Error("田字格一个格子都没有：逐字渲染没出来");
  if (grid.bad.length > 0) throw new Error(`田字格格子互相压（${grid.count} 格）：${grid.bad.slice(0, 3).join(" | ")}`);
  console.log(`A-04 真机：${grid.count} 个格子不重叠不溢出（真实逐字 yrc）`);

  // 相纸说明不许压到台词本头：底边距必须是样式表里的值（跑在播放页上才有 .st-photo）
  const photoGap = await page.evaluate(`(() => {
    const photo = document.querySelector(".st-photo");
    if (!photo) return "MISSING";
    const cap = photo.querySelector(".cap2");
    const scriptHead = document.querySelector(".st-script .sh");
    const side = document.querySelector(".st-side");
    const body = document.querySelector(".st-body");
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom) };
    };
    const art = photo.querySelector(".art");
    return {
      mb: getComputedStyle(photo).marginBottom,
      sideOverflow: getComputedStyle(side).overflowY,
      innerH: innerHeight,
      photoWidth: getComputedStyle(photo).width,
      art: r(art),
      side: r(side),
      body: r(body),
      photo: r(photo),
      cap2: r(cap),
      scriptHead: r(scriptHead),
      script: r(document.querySelector(".st-script")),
    };
  })()`);
  if (photoGap === "MISSING") throw new Error("播放页上找不到 .st-photo");
  console.log(`相纸布局：${JSON.stringify(photoGap)}`);
  const gap = photoGap.scriptHead && photoGap.cap2
    ? photoGap.scriptHead.top - photoGap.cap2.bottom
    : -1;
  if (gap < 4) throw new Error(`相纸说明与台词本只隔 ${gap}px（叠字）`);

  await page.shot("real-stage.png");

  const lit = await page.evaluate(`(() => {
    const c = document.querySelector(".st-spectrum");
    if (!c) return -1;
    const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
    return n;
  })()`);
  if (!(lit > 0)) throw new Error(`正在放真歌，频谱却一个像素都没有（lit=${lit}）`);
  console.log(`A-07 真机：真实音频驱动频谱 ${lit} px`);

  /*
   * b2 沉浸态（stage-v10 b2「刻纹现场」）：点「沉浸」→ 覆盖层出现 + 盘在转 →
   * 暂停即停转（一个状态一个表现）→ Esc 退回普通播放页。
   * 放在真歌播放段：判据用的是真实 vkey 音频的播放/暂停态。
   * 本机窗口 ≥900px，不走降级分支；降级分支由 stage-shots 的窄窗布局截图钉。
   */
  const immerBtn = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('.st-viewbtn')].find((x) => x.textContent.trim() === '沉浸');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!immerBtn) throw new Error("播放页找不到「沉浸」入口按钮：b2 沉浸态没做或入口换了位置");
  const immerOn = await until(page, `document.querySelector('.st-immer') !== null`, 5000, "沉浸覆盖层");
  if (!immerOn) throw new Error("点了「沉浸」但覆盖层没出现");
  const spinning = await page.evaluate(
    `document.querySelector('.st-immer .im-disc .disc')?.getAnimations().some((a) => a.playState === "running") ?? false`,
  );
  if (!spinning) throw new Error("沉浸态黑胶盘没有在转（播放中 rotation 动画应 running）");
  await page.shot("real-immer.png");
  await page.evaluate(`document.querySelector('.st-immer .im-tb button.main')?.click()`);
  await sleep(400);
  const stalled = await page.evaluate(
    `(() => {
      const d = document.querySelector(".st-immer .im-disc");
      if (!d) return null;
      const paused = d.classList.contains("stalled");
      const anim = d.querySelector(".disc")?.getAnimations().every((a) => a.playState !== "running");
      return paused && anim;
    })()`,
  );
  if (stalled !== true) throw new Error("暂停后盘没停（.stalled 没挂上）：暂停态表现不一致");
  // 暂停态下钟面停走：同一份 t 的表现一致性
  const clockPaused = await page.evaluate(
    `(() => {
      const a = document.querySelector(".st-immer .im-row .im-tm")?.textContent;
      return new Promise((res) => setTimeout(() => res(a !== null && a === document.querySelector(".st-immer .im-row .im-tm")?.textContent), 1200));
    })()`,
  );
  if (clockPaused !== true) throw new Error("暂停后沉浸态钟面还在走：时间唯一（I1）被破");
  await page.evaluate(`document.querySelector('.st-immer .im-tb button.main')?.click()`); // 恢复播放，给后面的判据用
  await sleep(300);

  // 窄窗降级（b2 稿 ≥900px 线）：真机把视口压到 800 宽重进沉浸态，只留提示文案
  await page.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await page.evaluate(
    `[...document.querySelectorAll('.st-viewbtn')].find((x) => x.textContent.trim() === '沉浸')?.click()`,
  );
  await sleep(400);
  const narrow = await page.evaluate(
    `(() => {
      const el = document.querySelector(".st-immer.narrow");
      if (!el) return "no .narrow";
      // 窄窗分支是条件渲染：.im-body 整个不输出（不是 display:none）
      const bodyGone = document.querySelector(".im-body") === null;
      return el.textContent.includes("900px") && bodyGone;
    })()`,
  );
  if (narrow !== true) throw new Error(`真机 800 宽没有降级提示（${narrow}）：应有 .st-immer.narrow + 900px 文案 + 正文隐藏`);
  await page.shot("real-immer-narrow.png");
  await page.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(300);
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(400);

  await page.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  const immerOff = await until(page, `document.querySelector('.st-immer') === null`, 5000, "Esc 退回");
  if (!immerOff) throw new Error("按 Esc 没有退出沉浸态");
  console.log("b2 沉浸态真机：覆盖层出现 · 盘转/停跟播放态 · 暂停钟面停走 · Esc 退回");

  // A-10：切夜间，播放页计算样式必须不变
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
        menu: pick(".st-menu", ["background-color", "border-top-color", "color"]),
        shellBg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
      };
    };
    let prev = read();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 60));
      const cur = read();
      if (JSON.stringify(cur) === JSON.stringify(prev)) return cur;
      prev = cur;
    }
    return prev;
  })()`;
  // 视图浮层要打开才有 .st-menu 可探（它是"材质最容易串味"的那块：原来读 --glass-*）
  await page.evaluate(`document.querySelector('.st-viewbtn')?.click()`);
  await sleep(400);
  const light = await page.evaluate(PROBE);
  await page.evaluate(`document.documentElement.dataset.theme = "dark"`);
  const dark = await page.evaluate(PROBE);
  for (const key of ["stage", "kb", "menu"]) {
    if (light[key] === "MISSING" || dark[key] === "MISSING") throw new Error(`A-10 探针找不到元素：${key}`);
    if (light[key] !== dark[key]) {
      throw new Error(`播放页跟着主题变了（${key}）：亮 ${light[key]} ≠ 暗 ${dark[key]}`);
    }
  }
  if (light.shellBg === dark.shellBg) throw new Error("外壳底色没变：主题没真正切换，独立性判据不成立");
  await page.shot("real-stage-dark.png");
  console.log(`A-10 真机：播放页夜间不变（${light.stage}）· 外壳 --bg ${light.shellBg} → ${dark.shellBg}`);

  /*
   * A-02 桌面歌词：独立窗口（app://afeifei/lyric.html），行文本由主窗桥推送。
   * 判据：① 开得出来；② 出字；③ 与主窗**当前行**一致（.st-srow.cur 含窗里的那行）。
   * 假数据验不出 ③ —— fixture 的桥确实会推，但"同一时刻同一行"只有真播放才对得上。
   */
  await page.evaluate(
    `[...document.querySelectorAll('button')].find((b) => b.title === "桌面歌词")?.click()`,
  );
  let lyricTarget = null;
  for (let i = 0; i < 40 && !lyricTarget; i += 1) {
    await sleep(250);
    lyricTarget = (await targets()).find((t) => t.type === "page" && t.url.includes("lyric.html"));
  }
  if (!lyricTarget) throw new Error("10s 内没等到桌面歌词窗（app://afeifei/lyric.html）");
  const lyricPage = cdp(lyricTarget.webSocketDebuggerUrl);
  await lyricPage.ready;
  const lineIn = await until(
    lyricPage,
    `(document.querySelector(".lyric-line")?.textContent || "").trim() !== ""`,
    8000,
    "歌词窗出字",
  );
  if (!lineIn) throw new Error("桌面歌词窗 8s 没出字：桥没推，或者取词点没接上（A-02 正是修这个）");
  const line = await lyricPage.evaluate(`(document.querySelector(".lyric-line")?.textContent || "").trim()`);
  const cur = await page.evaluate(`(() => {
    const el = document.querySelector(".st-srow.cur");
    return el ? el.textContent : "";
  })()`);
  if (!cur.includes(line)) {
    throw new Error(`歌词窗与主窗不同步：窗里="${line}"，主窗当前行="${cur.slice(0, 60)}"`);
  }
  console.log(`A-02 真机：歌词窗同步显示「${line}」`);
  lyricPage.close();

  /*
   * A-03 译文（真机）：真实网易云歌词自带 tlyric —— 并排可见 → 关掉消失 → 落盘。
   * 关掉后立刻恢复：这份 profile 是复制品，动设置无害，但下一轮跑图还要译文。
   */
  const hadTrans = await page.evaluate(
    `[...document.querySelectorAll(".st-trans")].some((p) => p.textContent.trim().length > 0)`,
  );
  if (!hadTrans) throw new Error("在线歌词没有渲染出译文行：A-03 双语并排未生效（这首真歌没译文？换一首有译文的）");
  const toggleTrans = async () => {
    // A-10 的探针走的时候浮层是开着的：按 aria-expanded 归一，别盲点一下把它关上
    const openMenu = async () => {
      const expanded = await page.evaluate(
        `document.querySelector('.st-viewbtn')?.getAttribute('aria-expanded') === 'true'`,
      );
      if (!expanded) {
        await page.evaluate(`document.querySelector('.st-viewbtn')?.click()`);
        await sleep(250);
      }
    };
    await openMenu();
    const clicked = await page.evaluate(`(() => {
      const row = [...document.querySelectorAll('.st-menu-row')].find((r) => r.textContent.includes('译文'));
      const box = row?.querySelector('input[type=checkbox]');
      if (!box) return false;
      box.click();
      return true;
    })()`);
    await sleep(300);
    await page.evaluate(`document.querySelector('.st-viewbtn')?.click()`);
    await sleep(250);
    return clicked;
  };
  if (!(await toggleTrans())) throw new Error("视图浮层里找不到「译文」开关");
  const transGone = await page.evaluate(`document.querySelector('.st-trans') === null`);
  if (!transGone) throw new Error("关掉译文后 .st-trans 仍在");
  if (!(await toggleTrans())) throw new Error("重新打开「译文」开关失败");
  await sleep(700); // stage-ui 的 500ms 合并写盘
  // 真主进程的 KV 是一个 key 一个文件：<userData>/stage-ui.json（fixture 才有 store- 前缀）
  const stageJson = JSON.parse(fs.readFileSync(path.join(profileDir, "stage-ui.json"), "utf8"));
  if (stageJson.translation !== true) {
    throw new Error(`译文开关没落盘：${JSON.stringify(stageJson)}`);
  }
  console.log("A-03 真机：译文并排可见 · 关掉后消失 · translation=true 已落盘");

  /*
   * A-14 榜单：真登录下 toplist 匿名可读。
   * 判据：卡片 > 0 → 点第一张 → 曲目行出现 → 点第一首 → 起播（同一套"真在放"判据）。
   */
  await page.evaluate(`document.documentElement.dataset.theme = "day"`); // 从 A-10 的暗色切回来再截图
  await page.evaluate(
    `[...document.querySelectorAll('.rail button')].find((x) => x.textContent.includes('榜单'))?.click()`,
  );
  const cards = await until(page, `document.querySelectorAll('.pl-item.chart-item').length > 0`, 20000, "榜单卡片");
  if (!cards) throw new Error("20s 没等到榜单卡片：toplist 请求没回来（网络或白名单）");
  const cardN = await page.evaluate(`document.querySelectorAll('.pl-item.chart-item').length`);
  await page.evaluate(`document.querySelector('.pl-item.chart-item').click()`);
  const rows = await until(page, `document.querySelectorAll('.lib-row.online-row').length > 0`, 20000, "榜单曲目");
  if (!rows) throw new Error("20s 没等到榜单曲目：下钻（getPlaylist）没通");
  const rowN = await page.evaluate(`document.querySelectorAll('.lib-row.online-row').length`);
  await page.shot("real-charts.png");
  await page.evaluate(`document.querySelector('.lib-row.online-row').click()`);
  const chartPlaying = await until(
    page,
    `(() => {
      const label = document.querySelector("button.tb.main")?.getAttribute("aria-label");
      const clock = (document.querySelector(".seek .tm")?.textContent || "").trim();
      return label === "暂停" && clock !== "" && clock !== "0:00";
    })()`,
    15000,
    "榜单曲目起播",
  );
  if (!chartPlaying) throw new Error("点了榜单第一首，15s 没起播：resolveOnlineUrl 对榜单曲目不通");
  console.log(`A-14 真机：${cardN} 张榜 → 下钻 ${rowN} 首 → 第一首起播`);

  /*
   * QQ 榜单（A-14 第二家源）：切 chip → 卡片 → 下钻（top: 前缀分流到 /recommend/toplist）→ 起播。
   * 上一首还在放，所以判据要「标题变了」才认账。
   */
  const chartTitleBefore = await page.evaluate(`(document.querySelector(".np-tx b")?.textContent || "").trim()`);
  const qqChartChip = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('.seg button')].find((x) => x.textContent.includes('QQ'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!qqChartChip) throw new Error("榜单页找不到「QQ 音乐」chip：canGetToplist 没生效");
  const qqCards = await until(page, `document.querySelectorAll('.pl-item.chart-item').length > 0`, 30000, "QQ 榜单卡片");
  if (!qqCards) throw new Error("30s 没等到 QQ 榜单卡片：/recommend/toplists 没通");
  const qqCardN = await page.evaluate(`document.querySelectorAll('.pl-item.chart-item').length`);
  await page.evaluate(`document.querySelector('.pl-item.chart-item').click()`);
  const qqChartRows = await until(page, `document.querySelectorAll('.lib-row.online-row').length > 0`, 30000, "QQ 榜单曲目");
  if (!qqChartRows) throw new Error("30s 没等到 QQ 榜单曲目：top: 前缀分流没通");
  const qqRowN = await page.evaluate(`document.querySelectorAll('.lib-row.online-row').length`);
  await page.shot("real-charts-qq.png");
  await page.evaluate(`document.querySelector('.lib-row.online-row').click()`);
  const qqChartPlaying = await until(
    page,
    `(() => {
      const label = document.querySelector("button.tb.main")?.getAttribute("aria-label");
      const clock = (document.querySelector(".seek .tm")?.textContent || "").trim();
      const title = (document.querySelector(".np-tx b")?.textContent || "").trim();
      return label === "暂停" && clock !== "" && clock !== "0:00" && title !== ${JSON.stringify(chartTitleBefore)} && title !== "";
    })()`,
    20000,
    "QQ 榜单曲目起播",
  );
  if (!qqChartPlaying) throw new Error("QQ 榜单曲目 20s 没起播（标题也没换）");
  console.log(`A-14 真机（QQ）：${qqCardN} 张榜 → 下钻 ${qqRowN} 首 → 第一首起播`);

  /*
   * 私人 FM（A-14 最后一块）：开机条要有"接下来三首 + 为什么"（B-04），
   * 点开始收听必须真的起播（本地真实音频）。
   */
  await page.evaluate(
    `[...document.querySelectorAll('.rail button')].find((x) => x.textContent.includes('电台'))?.click()`,
  );
  await sleep(600);
  /*
   * FM 的真实口径：预告行数 = min(3, 真实本地曲库数)。判据卡的是"有曲库就有预告 +
   * 理由非空 + 开始收听真的起播"，不是硬凑 3 行——本机曲库少到几首，就该显示几行，
   * 编假数据过关恰恰是这份脚本要防的事。0 首 = 真的没数据可测，报错要能行动。
   */
  await until(page, `document.querySelectorAll('.fmbar .fmrow').length >= 1`, 8000, "私人 FM 预告行");
  const fmRows = await page.evaluate(`document.querySelectorAll('.fmbar .fmrow').length`);
  if (fmRows === 0) {
    const dump = await page.evaluate(
      `document.querySelector(".fmbar")?.textContent?.slice(0, 140) || "（没有 .fmbar）"`,
    );
    throw new Error(`本机真实本地曲库是空的，FM 没有真实数据可测（${dump}）——先在设置里扫描一个真实音乐目录再跑`);
  }
  if (fmRows < 3) {
    console.log(`  （本机真实本地曲库只够 ${fmRows} 行预告：判据按真实数据收口，不凑 3 行）`);
  }
  const fmWhyEmpty = await page.evaluate(
    `[...document.querySelectorAll('.fmbar .fmrow .why')].some((el) => !el.textContent.trim())`,
  );
  if (fmWhyEmpty) throw new Error("FM 预告行有理由为空：B-04『为什么』必须来自真实数据");
  const fmTitleBefore = await page.evaluate(`(document.querySelector(".np-tx b")?.textContent || "").trim()`);
  await page.evaluate(
    `[...document.querySelectorAll('.fmbar button')].find((b) => b.textContent.includes('开始收听'))?.click()`,
  );
  const fmPlaying = await until(
    page,
    `(() => {
      const label = document.querySelector("button.tb.main")?.getAttribute("aria-label");
      const clock = (document.querySelector(".seek .tm")?.textContent || "").trim();
      const title = (document.querySelector(".np-tx b")?.textContent || "").trim();
      return label === "暂停" && clock !== "" && clock !== "0:00" && title !== ${JSON.stringify(fmTitleBefore)} && title !== "";
    })()`,
    15000,
    "私人 FM 起播",
  );
  if (!fmPlaying) {
    const dump = await page.evaluate(`(() => ({
      title: document.querySelector(".np-tx b")?.textContent || "",
      label: document.querySelector("button.tb.main")?.getAttribute("aria-label"),
      clock: document.querySelector(".seek .tm")?.textContent || "",
      status: document.querySelector(".tbar .status")?.textContent || "",
      fmButtons: [...document.querySelectorAll(".fmbar button")].map((b) => b.textContent.trim() + (b.disabled ? "[disabled]" : "")),
    }))()`);
    throw new Error(`私人 FM 没起播：${JSON.stringify(dump)}`);
  }
  const fmNow = await page.evaluate(`(document.querySelector(".np-tx b")?.textContent || "").trim()`);
  console.log(`私人 FM 真机：${fmRows} 行预告 · 开始收听 → 《${fmNow}》`);
  await page.shot("real-fm.png");

  /*
   * QQ 真机：登录态在 qq-session-token.json（复制 profile 时一起带过来）。
   * 换源 → 搜索 → 起播。判据里"标题变了"不可省：只看计时在走，
   * 上一首（网易云）还在放也能糊弄过去。
   */
  await page.evaluate(
    `[...document.querySelectorAll('.rail button')].find((x) => x.textContent.includes('在线'))?.click()`,
  );
  await sleep(600);
  const qqChip = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('.seg button')].find((x) => x.textContent.includes('QQ'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!qqChip) throw new Error("找不到「QQ 音乐」chip");
  await sleep(500);
  await page.evaluate(`(() => {
    const input = document.querySelector('.search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '青花瓷');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(300);
  await page.evaluate(
    `[...document.querySelectorAll('button')].find(x => x.textContent.trim() === '搜索')?.click()`,
  );
  // QQ 上游时快时慢（实测 6s～45s）：骨架行只在搜索期间存在，fcg 快时截图截不到，
  // 直接断言「点击后立即有骨架行」（60ms 后读，等 React 提交）
  await sleep(60);
  const skel = await page.evaluate(`(() => ({
    skel: document.querySelectorAll(".online-skel .sk-row").length,
    btn: [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "搜索中…"),
  }))()`);
  if (skel.skel < 5 || !skel.btn) {
    throw new Error(`搜索中没有骨架反馈（skel 行=${skel.skel}，按钮态=${skel.btn}）：用户要对着空白区猜 20–45s`);
  }
  console.log(`搜索反馈真机：骨架 ${skel.skel} 行 + 按钮「搜索中…」`);
  const qqRows = await until(page, `document.querySelectorAll('.online-row').length > 0`, 45000, "QQ 搜索结果");
  if (!qqRows) {
    const dump = await page.evaluate(`(() => ({
      chip: [...document.querySelectorAll('.seg button')].map((b) => b.textContent.trim() + (b.className.includes("on") ? "*" : "")),
      value: document.querySelector('.search')?.value,
      note: document.querySelector('.lib-note')?.textContent || "",
      rows: document.querySelectorAll('.online-row').length,
    }))()`);
    throw new Error(`20s 没等到 QQ 搜索结果：${JSON.stringify(dump)}`);
  }
  const titleBefore = await page.evaluate(`document.querySelector(".np-tx b")?.textContent || ""`);
  await page.evaluate(`document.querySelector('.online-row').click()`);
  const qqPlaying = await until(
    page,
    `(() => {
      const label = document.querySelector("button.tb.main")?.getAttribute("aria-label");
      const clock = (document.querySelector(".seek .tm")?.textContent || "").trim();
      const title = (document.querySelector(".np-tx b")?.textContent || "").trim();
      return label === "暂停" && clock !== "" && clock !== "0:00" && title !== ${JSON.stringify(titleBefore)} && title !== "";
    })()`,
    20000,
    "QQ 曲目起播",
  );
  if (!qqPlaying) {
    const dump = await page.evaluate(`(() => ({
      note: document.querySelector(".lib-note")?.textContent || "",
      status: document.querySelector(".tbar .status")?.textContent || "",
      title: document.querySelector(".np-tx b")?.textContent || "",
      firstRow: (document.querySelector(".online-row")?.textContent || "").slice(0, 60),
    }))()`);
    throw new Error(`QQ 曲目没起播：${JSON.stringify(dump)}`);
  }
  const titleAfter = await page.evaluate(`document.querySelector(".np-tx b")?.textContent || ""`);
  if (titleAfter === titleBefore) throw new Error(`标题没变（${titleAfter}）：可能还在放上一首`);
  console.log(`QQ 真机：搜索「青花瓷」→ 起播《${titleAfter}》`);
} finally {
  page?.close();
  child.kill();
  await sleep(500);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* 文件还被 Chromium 占着就留给系统临时目录清 */
  }
}
