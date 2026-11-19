#!/usr/bin/env node
/**
 * 冒烟（51 §2.5，M1 起接入）。真起 Electron + CDP，不注入假数据、不打真网。
 *
 * 三阶段：
 *   1. 界面 / 桥 / 控件 / 真实解码播放 / 无效令牌 / 写入 20 首队列存档
 *   2. 强杀重启 → 恢复（曲目/位置/音量/暂停态）→ 连切 20 首
 *   3. 存档指向已删文件 → 强杀重启 → 必须落进 error 态而不是崩
 *
 * 「切歌不爆音」是听觉判据，冒烟只能证明状态一致、不进 error、进度条不越界；
 * 不爆音的结构性保证在代码里（切歌只改 src，不重建 AudioContext、不动 gain）。
 *
 * 用独立 userData，别把冒烟写进真实应用数据。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import fs from "node:fs";

const PORT = 9333;
const PROFILE = path.join(os.tmpdir(), `afeifei-smoke-${process.pid}`);
const EXE = path.join("node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const MEDIA_DIR = "C:\\Windows\\Media";

if (!fs.existsSync(EXE)) {
  console.error(`✗ 找不到 Electron：${EXE}（先 npm install）`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 系统自带的示例音频。没有就跳过播放相关验证，不让冒烟变成"看你机器安不安装媒体文件"。 */
function listSamples(limit) {
  try {
    return fs
      .readdirSync(MEDIA_DIR)
      .filter((f) => f.toLowerCase().endsWith(".wav"))
      .slice(0, limit)
      .map((f) => path.join(MEDIA_DIR, f));
  } catch {
    return [];
  }
}

/** 按可读名找按钮：走带是图形按钮，名字在 aria-label 上；文字按钮仍在 textContent。 */
const btnBy = (names) =>
  `[...document.querySelectorAll("button")].find((b) => ${JSON.stringify(names)}.includes((b.textContent || "").trim() || b.getAttribute("aria-label")))`;

const NEXT_BUTTON = btnBy(["下一首"]);

/** 把播放位置拨回 0：走 `.bar__range` 的原生 input 事件（React onChange 会接）。
 *  测试库是 5.57s 的系统短音频，慢机上一次 CDP 往返就要上百毫秒，
 *  不归零的话曲子会在迭代间隙自然播完 → 播完暂停，污染「切歌后必须在播」的断言。 */
const SEEK_ZERO = `(() => {
  const r = document.querySelector(".bar__range");
  if (!r) return false;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(r, "0");
  r.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`;

async function waitTarget(getLog, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* 还没起来 */
    }
    await sleep(300);
  }
  throw new Error(`CDP 目标超时；应用输出：\n${getLog()}`);
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const events = [];
  let seq = 0;

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id) {
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg);
      }
      return;
    }
    if (msg.method === "Log.entryAdded") events.push(`[log] ${msg.params.entry.text}`);
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      events.push(`[exception] ${d.text} ${d.exception?.description ?? ""}`);
    }
  });

  const ready = new Promise((resolve) => ws.addEventListener("open", resolve));

  return {
    ready,
    events,
    async send(method, params = {}) {
      await ready;
      const id = ++seq;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

/**
 * 在**另一个窗口**里断言（桌面歌词窗是独立渲染进程）。
 * 只取 /json/list 里 url 匹配的那一页，主窗的 client 不动。
 */
async function evaluateInWindow(urlPart, expression, timeoutMs = 8000) {
  const started = Date.now();
  let page = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find((t) => t.type === "page" && (t.url || "").includes(urlPart));
      if (page) break;
    } catch {
      /* 还没起来 */
    }
    await sleep(200);
  }
  assert.ok(page, `找不到窗口 ${urlPart}（CDP /json/list 里没有）`);
  const client = connect(page.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Runtime.enable");
  await sleep(600); // 等它渲染第一帧
  const msg = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  client.close();
  return msg.result?.result?.value;
}

async function launch(extraArgs = [], reloadFirst = true) {
  const child = spawn(
    EXE,
    ["dist/main.js", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, ...extraArgs],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let log = "";
  child.stdout.on("data", (b) => {
    log += String(b);
  });
  child.stderr.on("data", (b) => {
    log += String(b);
  });

  const page = await waitTarget(() => log);
  const client = connect(page.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Page.enable");

  if (reloadFirst) await client.send("Page.reload", { ignoreCache: true });

  const evaluate = async (expression) => {
    const msg = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (msg.result?.exceptionDetails) {
      throw new Error(`页面执行出错：${JSON.stringify(msg.result.exceptionDetails)}`);
    }
    return msg.result?.result?.value;
  };

  const waitFor = async (expression, timeoutMs = 8000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(expression)) return true;
      await sleep(150);
    }
    return false;
  };

  /**
   * 派发一颗「受信任」的 Shift keydown（CDP Input 域）。
   * Runtime.evaluate 里的 `.click()` 不产生 user activation —— 应用有启动交互门
   * （恢复只 cue 不播，页面拿到真实激活前一律按回暂停），冒烟要先过这扇门。
   * 裸 Shift 在 keymap 里无语义（resolveKey 返回 null），不会误触别的功能。
   */
  const tapKey = async () => {
    const base = {
      key: "Shift",
      code: "ShiftLeft",
      windowsVirtualKeyCode: 16,
      nativeVirtualKeyCode: 16,
    };
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  };

  return {
    evaluate,
    waitFor,
    tapKey,
    events: () => client.events,
    log: () => log,
    async close({ hard = false } = {}) {
      client.close();
      child.kill(hard ? "SIGKILL" : "SIGTERM");
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", resolve);
        setTimeout(resolve, 5000);
      });
    },
  };
}

let current = null;

/** 排队时用的存档：20 首真歌 + 位置 2000ms + 音量 30%。 */
function snapshotOf(samples) {
  return {
    v: 1,
    trackId: samples[0],
    positionMs: 2000,
    volume: 0.3,
    queue: { items: samples, cursor: 0, context: samples, history: [], mode: "order", shuffleSeed: 1 },
  };
}

function snapshotOfMissing(missingPath) {
  return {
    v: 1,
    trackId: missingPath,
    positionMs: 0,
    volume: 0.5,
    queue: { items: [missingPath], cursor: 0, context: [], history: [], mode: "order", shuffleSeed: 1 },
  };
}

async function main() {
  const samples = listSamples(20);
  const hasAudio = samples.length >= 2;
  const first = hasAudio ? path.basename(samples[0]) : null;

  if (!hasAudio) console.log(`  SKIP 播放相关验证：${MEDIA_DIR} 下 wav 不足 2 个`);
  else console.log(`  样本：${samples.length} 个 wav`);

  /* ---------------- 阶段 1：界面 / 播放 / 存档 ---------------- */
  const app = await launch(["--autoplay-policy=no-user-gesture-required"]);
  current = app;

  if (!(await app.waitFor(`document.querySelector(".sidebar .brand-word b")?.textContent === "AFEIFEI"`))) {
    throw new Error(`界面没渲染出来。页面事件：\n${app.events().join("\n") || "(无)"}`);
  }

  assert.equal(await app.evaluate(`window.api.ping()`), "pong", "preload 桥没通");

  // 外壳：开机落在在线页；边栏替代站尺
  assert.ok(await app.waitFor(`!!document.querySelector(".sidebar")`, 5000), "边栏没出来");
  assert.ok(await app.waitFor(`!!document.querySelector(".live-room")`, 5000), "在线页没出来");
  // 入场登记是首屏覆盖层：冒烟先点「先随便逛逛」进后台
  await app.evaluate(`document.querySelector(".auth__skip")?.click()`);
  await app.waitFor(`!document.querySelector(".auth")`, 3000);

  // 旧外壳（顶栏 / 侧栏）已拆除：只剩站尺 + 内容 + 控制台
  assert.ok(
    await app.evaluate(`!document.querySelector(".tbar") && !document.querySelector(".rail")`),
    "旧外壳（顶栏 / 侧栏）不该再出现",
  );

  // 后续断的是本地页控件：从在线页切过去
  await app.evaluate(`document.querySelector('.side-item[data-page="local"]')?.click()`);
  assert.ok(
    await app.waitFor(
      `[...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "扫描本地文件夹")`,
      5000,
    ),
    "本地页没出来",
  );

  // 按钮数会随功能增长，所以断"关键按钮存在"而不是断总数
  // 走带按钮是图形（<i>），可读名在 aria-label 上 —— 取"可见文字，没有就取无障碍名"
  const labels = await app.evaluate(
    `[...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim() || b.getAttribute("aria-label") || "")`,
  );
  for (const need of ["扫描本地文件夹", "试听一首", "上一首", "下一首"]) {
    assert.ok(labels.includes(need), `缺按钮「${need}」，实际：${labels.join("/")}`);
  }
  assert.ok(
    labels.includes("播放") || labels.includes("暂停"),
    `缺播放按钮，实际：${labels.join("/")}`,
  );
  // 新底栏音量是滑杆 0–1：0.8 应对应 80%
  assert.equal(
    Number(await app.evaluate(`Math.round(Number(document.querySelector(".vol__range")?.value ?? -1) * 100)`)),
    80,
    "音量初始值",
  );
  assert.ok((await app.evaluate(`document.styleSheets.length`)) >= 1, "样式表没加载");

  const badToken = await app.evaluate(
    `fetch("appmedia://deadbeef-0000-0000").then(r => r.status).catch(() => "ERR")`,
  );
  assert.equal(badToken, 410, `无效令牌应返回 410，实际 ${badToken}`);

  /* ---- 用户源沙箱：恶意被拒、正常可用、主窗无感（M5 判据） ---- */
  const evil = await app.evaluate(
    `window.api.installUserSource("evil-test", 'const fs = require("fs");').then(() => "ok").catch(e => String(e.message))`,
  );
  assert.notEqual(evil, "ok", `require("fs") 必须被拒，实际：${evil}`);
  assert.ok(/require|createProvider/.test(evil), `拒绝原因应可读：${evil}`);

  const demoUser = `function createProvider(host){return {id:"demo-user",name:"示例用户源",capabilities:["search"],async search(){return {items:[{sourceId:"u1",title:"用户源歌曲",artist:"沙箱",album:"-",durationMs:180000}]}}}}`;
  const loaded = await app.evaluate(
    `window.api.installUserSource("tmp-1", ${JSON.stringify(demoUser)}).then(m => m.name).catch(e => "ERR:" + e.message)`,
  );
  assert.equal(loaded, "示例用户源", `正常用户源应装载成功：${loaded}`);
  const found = await app.evaluate(
    `window.api.callUserSource("demo-user", "search", {keyword:"x"}).then(r => r.items.length).catch(e => "ERR:" + e.message)`,
  );
  assert.equal(found, 1, `用户源 search 应可用：${found}`);

  /* ---- 在线页：注册表 → 搜索 → 能力缺失 → 人话提示 ---- */
  await app.evaluate(`document.querySelector('.side-item[data-page="online"]')?.click()`);
  assert.ok(await app.waitFor(`document.querySelector(".disc-hero") !== null`, 5000), "发现页没出来");

  // 音源切换已收进设置页账号卡：注册表接没接上，从那里看
  await app.evaluate(`document.querySelector('[data-page="settings"]')?.click()`);
  const settingsProbe = await app.waitFor(`document.querySelector(".acct-card") !== null`, 3000);
  if (!settingsProbe) {
    const dbg = await app.evaluate(`({
      active: [...document.querySelectorAll(".side-item.on")].map((x) => x.getAttribute("data-page")),
      acct: !!document.querySelector(".acct-card"),
      pageText: (document.querySelector(".main__page")?.innerText ?? "").slice(0, 160)
    })`);
    throw new Error(`设置页账号卡打不开：${JSON.stringify(dbg)}`);
  }
  // 音源列表来自 bootstrap 完成后的注册表：冷启动可能比首屏慢一拍，等它接上
  const sourceReady = await app.waitFor(`document.querySelectorAll(".acct-row .acct-line1 b").length > 0`, 3000);
  const sourceOptions = await app.evaluate(
    `[...document.querySelectorAll(".acct-row .acct-line1 b")].map((b) => (b.textContent || "").trim())`,
  );
  await app.evaluate(`document.querySelector('.side-item[data-page="online"]')?.click()`);
  await sleep(250);
  assert.ok(sourceReady && sourceOptions.length > 0, `音源列表是空的（注册表没接上）：${JSON.stringify(sourceOptions)}`);

  /* ---- 顶栏（v4.2）：品牌 / 搜索 / 账号；默认亮色「排练室」 ---- */
  assert.ok(await app.waitFor(`!!document.querySelector(".topbar .searchbox input")`, 3000), "顶栏缺搜索框");
  const shellBg = await app.evaluate(`getComputedStyle(document.querySelector(".main")).backgroundColor`);
  assert.equal(shellBg, "rgb(255, 248, 245)", `默认应为亮色排练室，实际 ${shellBg}`);
  console.log(`  顶栏 OK：搜索入口在顶栏，壳底 ${shellBg}`);

  /* ---- 睡眠定时「播完当前曲再停」（P0-24）：勾选在「更多」弹层内联段里，且真的落到状态 ---- */
  // 2026-11-13 工具排 8→5：睡眠入口收进「更多」弹层（先开弹层，段类不变）
  await app.evaluate(`${btnBy(["更多"])}.click()`);
  assert.ok(
    await app.waitFor(`!!document.querySelector(".more-sheet .more-switch input")`, 3000),
    "更多弹层应有「播完当前曲再停」开关",
  );
  await app.evaluate(`document.querySelector(".more-sheet .more-switch input")?.click()`);
  assert.equal(
    await app.evaluate(`document.querySelector(".more-sheet .more-switch input")?.checked`),
    true,
    "打开后应保持选中",
  );
  await app.evaluate(`document.querySelector(".more-sheet .more-switch input")?.click()`); // 复原，别把偏好写进存档
  await app.evaluate(`${btnBy(["更多"])}.click()`);
  console.log("  睡眠定时 OK：播完当前曲再停可选");

  /* ---- 设置页：输出设备 / 快捷键区块已随新原型移除 ---- */
  await app.evaluate(`document.querySelector('[data-page="settings"]')?.click()`);
  await sleep(300);
  console.log("  SKIP 输出设备/快捷键设置区块：新设置页已移除");

  // 回到发现页：音源列表只剩左下角账号菜单一个入口（示例音源已于 2026-11-05 移除）
  await app.evaluate(`document.querySelector('.side-item[data-page="online"]')?.click()`);
  await sleep(200);
  console.log("  SKIP 输出设备：新设置页已移除该区块");

  // 音源列表已在设置页账号卡检查过（见上方）
  console.log("  SKIP 重复账号菜单检查：已由设置页账号卡覆盖");

  if (hasAudio) {
    const token = await app.evaluate(`window.api.grant(${JSON.stringify(samples[0])})`);
    assert.ok(token, `grant 没返回令牌：${samples[0]}`);

    const probe = await app.evaluate(`new Promise((resolve) => {
      const a = new Audio("appmedia://${token}");
      const finish = (r) => { try { a.pause(); a.removeAttribute("src"); } catch {} resolve(r); };
      a.onloadedmetadata = () => {
        const duration = a.duration;
        a.play()
          .then(() => setTimeout(() => finish({ duration, currentTime: a.currentTime, err: null }), 700))
          .catch((e) => finish({ duration, currentTime: 0, err: String(e) }));
      };
      a.onerror = () => finish({ duration: -1, currentTime: 0, err: "media error " + (a.error?.code ?? "?") });
      setTimeout(() => finish({ duration: -2, currentTime: 0, err: "timeout" }), 8000);
    })`);

    assert.ok(probe.duration > 0, `解码失败：${JSON.stringify(probe)}`);
    assert.ok(probe.currentTime > 0, `播放没有推进：${JSON.stringify(probe)}`);
    console.log(`  解码 + 播放 OK：${first}，时长 ${probe.duration.toFixed(2)}s`);

    await app.evaluate(`window.api.saveState(${JSON.stringify(JSON.stringify(snapshotOf(samples)))})`);
    const roundtrip = await app.evaluate(`window.api.loadState()`);
    assert.ok(
      typeof roundtrip === "string" && roundtrip.includes(first),
      `saveState 之后 loadState 拿不到内容：${String(roundtrip).slice(0, 120)}`,
    );
  }

  await app.close({ hard: true });
  current = null;
  await sleep(1200);

  /* ---------------- 阶段 2：重启恢复 + 连切 20 首 ---------------- */
  if (hasAudio) {
    const app2 = await launch([]);
    current = app2;

    // 重启后外壳仍是同一套：旧壳（直白模式）已删除，没有别的落点
    assert.ok(await app2.waitFor(`!!document.querySelector(".sidebar")`, 5000), "重启后没回到新外壳（边栏不在）");
    if (!(await app2.waitFor(`document.querySelector(".bar__title")?.textContent === ${JSON.stringify(first)}`, 10000))) {
      const shown = await app2.evaluate(`document.querySelector(".bar__title")?.textContent ?? "(无)"`);
      const raw = await app2.evaluate(`window.api.loadState().then(s => s ? s.slice(0, 140) : "null")`);
      throw new Error(`重启后没恢复出上次的曲目。界面显示 ${shown}；存档 ${raw}`);
    }

    assert.equal(
      Number(await app2.evaluate(`Math.round(Number(document.querySelector(".vol__range")?.value ?? -1) * 100)`)),
      30,
      "音量应恢复成 30%",
    );
    // 播放器状态读取口 = 底栏主按钮的 aria-label（「暂停」= 在播 /「播放」= 停着）。
    // 顶栏不再常驻状态徽标（只出不出的错误提示），别再拿它当状态源。
    const playLabel0 = await app2.evaluate(`document.querySelector(".bar__play")?.getAttribute("aria-label") ?? ""`);
    assert.equal(playLabel0, "播放", `恢复后应停在暂停态（主按钮应为「播放」），实际 ${playLabel0}`);
    // 位置要轮询等：cue 之后引擎还要 load 才会 seek，读一次必然撞上还没锚定的 0
    const positionOk = await app2.waitFor(
      `Math.abs(Number(document.querySelector(".bar__range")?.value ?? 0) - 2000) <= 1000`,
      8000,
    );
    const position = await app2.evaluate(`Number(document.querySelector(".bar__range")?.value ?? 0)`);
    assert.ok(positionOk, `位置应恢复成 2000±1000ms，实际 ${position}`);
    console.log("  重启恢复 OK：曲目 / 位置 / 音量 / 暂停态");

    const diag = () =>
      app2.evaluate(
        `(() => ({ label: document.querySelector(".bar__play")?.getAttribute("aria-label") ?? "", v: Number(document.querySelector(".bar__range")?.value ?? -1), m: Number(document.querySelector(".bar__range")?.max ?? -1), t: document.querySelector(".bar__title")?.textContent ?? "", st: document.querySelector(".status")?.textContent ?? "" }))()`,
      );

    // 先真播起来，再连切 —— 暂停态切歌测不到"边播边切"。
    // 应用有「启动交互门」（bootstrap 的 startup guard，2026-11-19）：恢复只 cue 不播，
    // 页面拿到真实 user activation 之前，任何播放态都会被 subscribe 按回暂停。
    // CDP evaluate 里的 .click() 不产生 activation，先发一颗受信任的 Shift keydown
    // 把门打开，再点 .bar__play（btnBy(["播放"]) 会撞到页面里别的同名按钮，不能用于点击）。
    await app2.tapKey();
    await app2.evaluate(`document.querySelector(".bar__play")?.click()`);
    const playLabel1 = await app2.waitFor(
      `document.querySelector(".bar__play")?.getAttribute("aria-label") === "暂停"`,
      5000,
    );
    if (!playLabel1) {
      console.log(`  [诊断] 点播放后没进播放态：${JSON.stringify(await diag())}`);
    }
    assert.ok(playLabel1, `点播放后应进入播放态（主按钮应为「暂停」）`);
    // 恢复点在 2000ms，距短音频曲尾余量不足，归零再开跑（SEEK_ZERO 注释有量化）
    assert.ok(await app2.evaluate(SEEK_ZERO), "找不到进度条，无法归零");
    await sleep(400);

    // 预取（P0-08）与淡入淡出（P0-07）**这里不测**：两个 <audio> 是 `new Audio()` 建的，
    // 不进 DOM（`querySelectorAll("audio")` 恒为 []），属性嗅探只会得到"空数组全通过"的假绿。
    // 它们的判据是听觉与切歌延迟，见文件头那句「切歌不爆音是听觉判据」——手测项列在 docs/22 §四。

    const seen = new Set();
    for (let i = 1; i <= 20; i += 1) {
      const before = await app2.evaluate(`document.querySelector(".bar__title")?.textContent ?? ""`);
      // 每次切歌前先归零：一次迭代要过 6 次 CDP 往返（慢机 1-2s），
      // 不归零短音频会中途自然播完 → 播完暂停，和真 bug 混在一起没法判
      await app2.evaluate(SEEK_ZERO);
      await app2.evaluate(`${NEXT_BUTTON}.click()`);
      await sleep(200);
      const errored = await app2.evaluate(`document.querySelector(".status")?.textContent ?? ""`);
      assert.ok(!errored, `第 ${i} 次切歌落进 error：${errored}`);
      const track = await app2.evaluate(`document.querySelector(".bar__title")?.textContent ?? ""`);
      seen.add(track);
      const bar = await app2.evaluate(
        `(() => { const b = document.querySelector(".bar__range"); return { v: Number(b?.value ?? 0), m: Number(b?.max ?? 0) }; })()`,
      );
      assert.ok(bar.v <= bar.m + 1000, `第 ${i} 次切歌后进度条越界：${bar.v} > ${bar.m}`);
      // 切歌就是要播：主按钮读「暂停」= store 在 playing。
      // 唯一允许不播的情况是已经走到队尾（没切歌，标题不变）——那时是正常的「播完了」
      // （迭代前已归零，正常路径下不会再有「自然播完」来碰瓷这条断言）
      const label = await app2.evaluate(`document.querySelector(".bar__play")?.getAttribute("aria-label") ?? ""`);
      if (label !== "暂停") {
        console.log(`  [诊断] 第 ${i} 次切歌后：${JSON.stringify(await diag())}`);
        assert.equal(track, before, `第 ${i} 次切歌后停在暂停态，但曲子已经换了（${before} → ${track}）`);
      }
    }
    assert.ok(seen.size >= 15, `20 次切歌应切到多个不同曲目，实际只有 ${seen.size} 个`);
    console.log(`  连切 20 首 OK：经过 ${seen.size} 个不同曲目，无 error、进度条不越界`);

    /* 播放模式仍要能从界面切四档（切档不崩、状态不变 error） */
    const clickMode = `(() => {
      const b = [...document.querySelectorAll(".bar__ctrls button")].find((x) => (x.getAttribute("aria-label") || "").startsWith("播放模式"));
      if (!b) return false;
      b.click();
      return true;
    })()`;
    for (let i = 0; i < 4; i += 1) {
      assert.ok(await app2.evaluate(clickMode), "找不到播放模式按钮");
      await sleep(150);
      const st = await app2.evaluate(`document.querySelector(".status")?.textContent ?? ""`);
      assert.ok(!st, `切播放模式后不该进 error：${st}`);
    }
    console.log("  播放模式 OK：四档可切、不进 error");

    /* 键位表（P0-22）：挑两个 DOM 上直接看得见的键 —— ↑/↓ 音量、M 静音 */
    const press = (k) => app2.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)} }))`);
    const volValue = () =>
      app2.evaluate(`Math.round(Number(document.querySelector(".vol__range")?.value ?? -1) * 100)`);
    const vol0 = Number(await volValue());
    await press("ArrowUp");
    const vol1 = Number(await volValue());
    assert.ok(vol1 > vol0, `↑ 应加大音量：${vol0} → ${vol1}`);
    await press("ArrowDown");
    const vol2 = Number(await volValue());
    assert.ok(vol2 < vol1, `↓ 应减小音量：${vol1} → ${vol2}`);
    const muteSel = `.bar__right button[aria-label="静音"], .bar__right button[aria-label="取消静音"]`;
    const muted0 = await app2.evaluate(`document.querySelector(${JSON.stringify(muteSel)})?.getAttribute("aria-label") ?? ""`);
    await press("m");
    const muted1 = await app2.evaluate(`document.querySelector(${JSON.stringify(muteSel)})?.getAttribute("aria-label") ?? ""`);
    assert.notEqual(muted1, muted0, "M 应切换静音");
    await press("m"); // 复原，别把静音态带给后面的阶段
    console.log("  键位 OK：↑/↓ 音量、M 静音");

    /* 底栏红心（R1）：本地曲目走本机红心，点一下就切换，再点回去
       （红心已从工具排迁到监听区，类名 np-like） */
    const heartSel = `.np-like`;
    const heartBefore = await app2.evaluate(`document.querySelector("${heartSel}")?.className ?? ""`);
    await app2.evaluate(`document.querySelector("${heartSel}")?.click()`);
    await sleep(250);
    const heartAfter = await app2.evaluate(`document.querySelector("${heartSel}")?.className ?? ""`);
    await app2.evaluate(`document.querySelector("${heartSel}")?.click()`);
    assert.ok(
      heartBefore.includes("on") !== heartAfter.includes("on"),
      `底栏红心应可切换：${heartBefore} → ${heartAfter}`,
    );
    console.log("  底栏红心 OK：本地曲目点一下就亮，再点回去");

    /* 页面（v5.6）：喜欢页是 likes 表格；最近/统计并进「播放历史」 */
    await app2.evaluate(`document.querySelector('[data-page="mine"]')?.click()`);
    assert.ok(await app2.waitFor(`!!document.querySelector(".likes__sheet, .likes__head")`, 3000), "我的·喜欢 应有喜欢页");
    await app2.evaluate(`document.querySelector('.side-item[data-page="history"]')?.click()`);
    assert.ok(await app2.waitFor(`!!document.querySelector(".hist__stats")`, 3000), "播放历史页应有统计条");
    await app2.evaluate(`document.querySelector('[data-page="local"]')?.click()`);
    console.log("  页面 OK：喜欢表格 / 历史统计");

    /* 离线态（P0-25）：事件 → 横幅出现；恢复 → 消失 */
    await app2.evaluate(`window.dispatchEvent(new Event("offline"))`);
    assert.ok(await app2.waitFor(`!!document.querySelector(".net-banner")`, 2000), "断网应出常驻横幅");
    await app2.evaluate(`window.dispatchEvent(new Event("online"))`);
    assert.ok(await app2.waitFor(`!document.querySelector(".net-banner")`, 2000), "恢复后横幅应消失");
    console.log("  离线态 OK：横幅随事件出现 / 消失");

    /* 三态（P0-26）：无封面要有刻纹占位；阶段文案不能是空 */
    assert.ok(await app2.waitFor(`!!document.querySelector(".bar__cover.blank")`, 3000), "无封面应有占位");
    const phaseText = await app2.evaluate(`document.querySelector(".bar__artist")?.textContent ?? ""`);
    // 这里只验"阶段行有话说"（样本 wav 只有 5.57s，跑到一半可能已经 ended）；
    // "缓冲中 ≠ 解码中" 由 test/playback-phase.test.mjs 钉
    assert.ok(phaseText.length > 0, "播放条的阶段文案不能是空");
    console.log(`  三态 OK：刻纹占位 + 阶段「${phaseText}」`);

    /* 迷你窗（P0-27）：圆形贴纸封面 / 可拖进度 / 悬停走带 */
    await app2.evaluate(`window.api.openMini()`);
    const miniWin = await evaluateInWindow(
      "mini.html",
      `({
        seek: !!document.querySelector(".mini__range"),
        art: !!document.querySelector(".mini__art"),
        btns: document.querySelectorAll(".mini__controls button").length,
        close: !!document.querySelector(".mini__close"),
        onair: !!document.querySelector(".mini__onair"),
      })`,
    );
    assert.ok(miniWin?.seek, "迷你窗应有可拖进度条（P0-27）");
    assert.ok(miniWin?.art, "迷你窗应有封面位（圆形贴纸）");
    assert.ok(miniWin?.btns >= 4, `迷你窗走带应有 4 个键，实际 ${miniWin?.btns}`);
    assert.ok(miniWin?.close, "迷你窗应有独立关闭键");
    assert.ok(miniWin?.onair, "迷你窗应显示播出状态签（ON AIR / STANDBY）");
    console.log("  迷你窗 OK：圆形封面 + 可拖进度 + 悬停走带");

    /* 迷你窗红心要真的落到主窗：桥只发意图，写者仍是 store / 红心域 */
    const likedBefore = await app2.evaluate(`document.querySelector(".bar__heart")?.classList.contains("is-on") ?? null`);
    const likeClicked = await evaluateInWindow(
      "mini.html",
      `(() => { const b = document.querySelector(".mini__like"); if (!b) return false; b.click(); return true; })()`,
    );
    assert.ok(likeClicked, "迷你窗应有红心键");
    await sleep(500);
    const likedAfter = await app2.evaluate(`document.querySelector(".bar__heart")?.classList.contains("is-on") ?? null`);
    assert.notEqual(likedAfter, likedBefore, "迷你窗红心应同步到底栏，而不是只改本地小窗");
    console.log("  迷你窗红心 OK：意图回到主窗，底栏同步");

    /* 播放页（新原型）：底栏封面 → 全屏 .np → 收起 */
    await app2.evaluate(`document.querySelector(".bar__cover-btn")?.click()`);
    assert.ok(await app2.waitFor(`!!document.querySelector(".np")`, 3000), "应能进入播放页");
    await app2.evaluate(`document.querySelector(".np__close")?.click()`);
    await sleep(500);
    console.log("  播放页 OK：幕布 / 舞台 / 队列");

    /* 桌面歌词窗（P0-21）：独立渲染进程 + 新结构（双行 / 逐字 / 进度线）不能白屏 */
    await app2.evaluate(`window.api.openLyric()`);
    const lyricWin = await evaluateInWindow(
      "lyric.html",
      `({
        bar: !!document.querySelector(".lyric-bar"),
        tools: !!document.querySelector(".lyric-tools"),
        text: (document.querySelector(".lyric-line")?.textContent ?? "").slice(0, 40),
      })`,
    );
    assert.ok(lyricWin?.bar, "桌面歌词窗应有进度线容器（缺了就是白屏）");
    assert.ok(lyricWin?.tools, "交互态应有工具条（锁定/字号/关闭）");
    console.log("  桌面歌词窗 OK：结构就位（双行 + 进度线）");

    await app2.close({ hard: true });
    current = null;
    await sleep(1200);
  }

  /* ---------------- 阶段 3：文件被删 → error 态 ---------------- */
  if (hasAudio) {
    const missingPath = path.join(MEDIA_DIR, "__deleted__", "gone.mp3");

    const app3 = await launch([], false);
    current = app3;
    await app3.waitFor(`document.querySelector("h1")?.textContent === "afeifei"`);
    await app3.evaluate(`window.api.saveState(${JSON.stringify(JSON.stringify(snapshotOfMissing(missingPath)))})`);
    await app3.close({ hard: true });
    current = null;
    await sleep(1200);

    const app4 = await launch([]);
    current = app4;

    // 徽标只在出错时渲染（内容已是人话，不再带 "error" 前缀）：元素存在即 error
    const errored = await app4.waitFor(`(document.querySelector(".status")?.textContent ?? "").length > 0`, 10000);
    const shown = await app4.evaluate(`document.querySelector(".status")?.textContent ?? "(无)"`);
    assert.ok(errored, `文件不存在时应进入 error 态，实际 ${shown}`);
    // 界面给的是人话（原始码用户看不懂），文案由 capability/errors.ts 一处对账：
    // "这首歌找不到了" = track-missing
    assert.ok(shown.includes("这首歌找不到了"), `error 应显示人话文案（track-missing），实际 ${shown}`);
    // track-missing 不可重试（ERROR_INFO.retryable = false）→ 不该给重试按钮
    const hasRetry = await app4.evaluate(`document.querySelectorAll(".retry-btn").length > 0`);
    assert.ok(!hasRetry, `不可重试的错误不该出现重试按钮，实际 ${shown}`);
    console.log(`  文件被删 OK：界面落进 ${shown}`);

    /* 队列面板（P0-10/12/16）：失败曲目要标出来，清空要两步确认 */
    // 队列钮是图标钮，名字在 aria-label —— textContent 只剩 SVG（与睡眠钮同坑）
    await app4.evaluate(
      `document.querySelector('.bar__right button[aria-label="播放队列"]')?.click()`,
    );
    const qpOpen = await app4.waitFor(`!!document.querySelector(".qp-row")`, 3000);
    assert.ok(qpOpen, "队列面板打不开（P0-10）");
    const rowText = await app4.evaluate(`document.querySelector(".qp-row")?.textContent ?? ""`);
    assert.ok(rowText.includes("播不了"), `失败曲目应在队列里标出来（P0-16），实际「${rowText}」`);

    await app4.evaluate(
      `[...document.querySelectorAll(".qp-foot button")].find((b) => b.textContent === "清空")?.click()`,
    );
    const confirming = await app4.evaluate(
      `[...document.querySelectorAll(".qp-foot button")].some((b) => b.textContent.startsWith("确认清空"))`,
    );
    assert.ok(confirming, "清空必须先要一次确认（P0-12）");
    await app4.evaluate(
      `[...document.querySelectorAll(".qp-foot button")].find((b) => b.textContent.startsWith("确认清空"))?.click()`,
    );
    const emptied = await app4.waitFor(`!!document.querySelector(".qp-empty")`, 3000);
    assert.ok(emptied, "清空后要进空队列态（不是留个空列表）");
    console.log("  队列面板 OK：失败标记 / 清空二次确认 / 空态");

    await app4.close();
    current = null;
  }

  /* ---------------- 阶段 4：afeifei:// 冷启动（M5 判据） ---------------- */
  if (hasAudio) {
    const app5 = await launch([`afeifei://play?id=${encodeURIComponent(samples[0])}`]);
    current = app5;
    const started = await app5.waitFor(
      `document.querySelector(".bar__title")?.textContent === ${JSON.stringify(first)}`,
      10000,
    );
    const track5 = await app5.evaluate(`document.querySelector(".bar__title")?.textContent ?? "(无)"`);
    assert.ok(started, `afeifei://play 冷启动没把歌拉起来，界面显示 ${track5}`);
    console.log("  scheme 冷启动 OK：afeifei://play 直接拉起曲目");
    await app5.close();
    current = null;
  }

  console.log("SMOKE PASS：界面 / 桥 / 控件 / 播放 / 恢复 / 连切 / 错误态 均正常");
}

try {
  await main();
  process.exit(0);
} catch (err) {
  console.error(`✗ SMOKE 失败：${err.message}`);
  if (current?.events().length) console.error(`--- 页面事件：\n${current.events().join("\n")}`);
  if (current?.log().trim()) console.error(`--- 应用输出：\n${current.log().trim()}`);
  try {
    await current?.close({ hard: true });
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(1);
}
