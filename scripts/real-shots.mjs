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

const APP_NAME = "Afeifei 阿飞飞";
const REAL_PROFILE = path.join(process.env.APPDATA ?? "", APP_NAME);
const PORT = 9333;
const OUT = path.resolve("docs/assets");
const ELECTRON = path.resolve("node_modules/electron/dist/electron.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 只搬"状态"，不搬缓存：Cache/GPUCache 几百 MB，搬了纯浪费。 */
const SKIP = new Set(["Cache", "GPUCache", "Code Cache", "DawnGraphiteCache", "DawnWebGPUCache", "blob_storage"]);

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
    15000,
    "在线曲目起播",
  );
  if (!playing) throw new Error("在线曲目 15s 内没起播：真登录也没拿到可播地址（先看是不是版权/地区限制）");
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
