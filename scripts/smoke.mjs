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

const NEXT_BUTTON = `[...document.querySelectorAll("button")].find((b) => b.textContent === "下一首")`;
const PLAY_BUTTON = `[...document.querySelectorAll("button")].find((b) => b.textContent === "播放" || b.textContent === "暂停")`;

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

  return {
    evaluate,
    waitFor,
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

  if (!(await app.waitFor(`document.querySelector("h1")?.textContent === "afeifei"`))) {
    throw new Error(`界面没渲染出来。页面事件：\n${app.events().join("\n") || "(无)"}`);
  }

  assert.equal(await app.evaluate(`window.api.ping()`), "pong", "preload 桥没通");

  // 按钮数会随功能增长，所以断"关键按钮存在"而不是断总数
  const labels = await app.evaluate(`[...document.querySelectorAll("button")].map((b) => b.textContent)`);
  for (const need of ["扫描目录", "全部", "收藏", "上一首", "下一首"]) {
    assert.ok(labels.includes(need), `缺按钮「${need}」，实际：${labels.join("/")}`);
  }
  assert.ok(
    labels.includes("播放") || labels.includes("暂停"),
    `缺播放按钮，实际：${labels.join("/")}`,
  );
  assert.equal(await app.evaluate(`document.querySelector(".volume input")?.value`), "80", "音量初始值");
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
  await app.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent === "在线")?.click()`);
  assert.ok(await app.waitFor(`document.querySelector(".seg") !== null`, 5000), "在线页没出来");

  const sourceOptions = await app.evaluate(`[...document.querySelectorAll(".seg button")].map((b) => b.textContent)`);
  assert.ok(sourceOptions.length > 0, "音源分段是空的（注册表没接上）");

  /* ---- 明暗主题（docs/09 B4）：切一次再切回，data-theme 是唯一开关 ---- */
  const beforeTheme = await app.evaluate(`document.documentElement.dataset.theme ?? "(未设)"`);
  await app.evaluate(`document.querySelector(".theme-toggle")?.click()`);
  const flippedTheme = await app.evaluate(`document.documentElement.dataset.theme`);
  assert.notEqual(flippedTheme, beforeTheme, "点明暗按钮后 data-theme 没变");
  await app.evaluate(`document.querySelector(".theme-toggle")?.click()`);
  const backTheme = await app.evaluate(`document.documentElement.dataset.theme`);
  assert.equal(backTheme, beforeTheme, "再点一次应切回原主题");
  console.log(`  theme OK：${beforeTheme} → ${flippedTheme} → ${backTheme}`);

  await app.evaluate(`(() => {
    const input = document.querySelector(".search");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "示例");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await app.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent === "搜索")?.click()`);
  assert.ok(await app.waitFor(`document.querySelectorAll(".online-row").length > 0`, 5000), "在线搜索没出结果");

  // 点第一条：示例源声明了 canGetUrl 但实现里明确拒绝，界面必须给中文人话而不是错误码
  await app.evaluate(`document.querySelector(".online-row")?.click()`);
  assert.ok(await app.waitFor(`(document.querySelector(".lib-note")?.textContent ?? "").length > 0`, 5000), "点击后没有提示");
  const noteText = await app.evaluate(`document.querySelector(".lib-note")?.textContent ?? ""`);
  assert.ok(
    /不支持|问题|失败|有点慢/.test(noteText),
    `提示应是中文人话，实际：${noteText}`,
  );
  assert.ok(!/capability-missing|Error:/.test(noteText), `不该把错误码或原始异常漏给界面：${noteText}`);
  console.log(`  在线链路 OK：${sourceOptions.length} 个音源，点击后提示「${noteText}」`);

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

    if (!(await app2.waitFor(`document.querySelector(".np-title")?.textContent === ${JSON.stringify(first)}`, 10000))) {
      const shown = await app2.evaluate(`document.querySelector(".np-title")?.textContent ?? "(无)"`);
      const raw = await app2.evaluate(`window.api.loadState().then(s => s ? s.slice(0, 140) : "null")`);
      throw new Error(`重启后没恢复出上次的曲目。界面显示 ${shown}；存档 ${raw}`);
    }

    assert.equal(await app2.evaluate(`document.querySelector(".volume input")?.value`), "30", "音量应恢复成 30");
    const status0 = await app2.evaluate(`document.querySelector(".status")?.textContent ?? ""`);
    assert.ok(status0.startsWith("paused") || status0.startsWith("loading"), `恢复后应停在暂停态，实际 ${status0}`);
    // 位置要轮询等：cue 之后引擎还要 load 才会 seek，读一次必然撞上还没锚定的 0
    const positionOk = await app2.waitFor(
      `Math.abs(Number(document.querySelector(".seekrow input")?.value ?? 0) - 2000) <= 1000`,
      8000,
    );
    const position = await app2.evaluate(`Number(document.querySelector(".seekrow input")?.value ?? 0)`);
    assert.ok(positionOk, `位置应恢复成 2000±1000ms，实际 ${position}`);
    console.log("  重启恢复 OK：曲目 / 位置 / 音量 / 暂停态");

    // 先真播起来，再连切 —— 暂停态切歌测不到"边播边切"
    await app2.evaluate(`${PLAY_BUTTON}.click()`);
    await sleep(600);

    const seen = new Set();
    for (let i = 1; i <= 20; i += 1) {
      await app2.evaluate(`${NEXT_BUTTON}.click()`);
      await sleep(200);
      const status = await app2.evaluate(`document.querySelector(".status")?.textContent ?? ""`);
      assert.ok(!status.startsWith("error"), `第 ${i} 次切歌落进 error：${status}`);
      const track = await app2.evaluate(`document.querySelector(".np-title")?.textContent ?? ""`);
      seen.add(track);
      const bar = await app2.evaluate(
        `(() => { const b = document.querySelector(".seekrow input"); return { v: Number(b?.value ?? 0), m: Number(b?.max ?? 0) }; })()`,
      );
      assert.ok(bar.v <= bar.m + 1000, `第 ${i} 次切歌后进度条越界：${bar.v} > ${bar.m}`);
    }
    assert.ok(seen.size >= 15, `20 次切歌应切到多个不同曲目，实际只有 ${seen.size} 个`);
    console.log(`  连切 20 首 OK：经过 ${seen.size} 个不同曲目，无 error、进度条不越界`);

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

    const errored = await app4.waitFor(`(document.querySelector(".status")?.textContent ?? "").startsWith("error")`, 10000);
    const shown = await app4.evaluate(`document.querySelector(".status")?.textContent ?? "(无)"`);
    assert.ok(errored, `文件不存在时应进入 error 态，实际 ${shown}`);
    assert.ok(shown.includes("track-missing"), `error 码应为 track-missing，实际 ${shown}`);
    console.log(`  文件被删 OK：界面落进 ${shown}`);

    await app4.close();
    current = null;
  }

  /* ---------------- 阶段 4：afeifei:// 冷启动（M5 判据） ---------------- */
  if (hasAudio) {
    const app5 = await launch([`afeifei://play?id=${encodeURIComponent(samples[0])}`]);
    current = app5;
    const started = await app5.waitFor(
      `document.querySelector(".np-title")?.textContent === ${JSON.stringify(first)}`,
      10000,
    );
    const track5 = await app5.evaluate(`document.querySelector(".np-title")?.textContent ?? "(无)"`);
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
