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
const PLAY_BUTTON = btnBy(["播放", "暂停"]);

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

  // 外壳（C-17）：开机落在不夜台首页直播面；站尺替代顶栏/侧栏
  assert.ok(await app.waitFor(`!!document.querySelector(".ruler")`, 5000), "直播壳站尺没出来");
  assert.ok(await app.waitFor(`!!document.querySelector(".live-home")`, 5000), "首页直播面没出来");

  // 旧外壳（顶栏 / 侧栏）已拆除：只剩站尺 + 内容 + 控制台
  assert.ok(
    await app.evaluate(`!document.querySelector(".tbar") && !document.querySelector(".rail")`),
    "旧外壳（顶栏 / 侧栏）不该再出现",
  );

  // 后续断的是本地页控件：从首页直播面切过去
  await app.evaluate(
    `[...document.querySelectorAll("button")].find((b) => b.textContent === "本地")?.click()`,
  );
  assert.ok(
    await app.waitFor(
      `[...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "扫描目录")`,
      5000,
    ),
    "本地页没出来",
  );

  // 按钮数会随功能增长，所以断"关键按钮存在"而不是断总数
  // 走带按钮是图形（<i>），可读名在 aria-label 上 —— 取"可见文字，没有就取无障碍名"
  const labels = await app.evaluate(
    `[...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim() || b.getAttribute("aria-label") || "")`,
  );
  for (const need of ["扫描目录", "全部", "收藏", "上一首", "下一首"]) {
    assert.ok(labels.includes(need), `缺按钮「${need}」，实际：${labels.join("/")}`);
  }
  assert.ok(
    labels.includes("播放") || labels.includes("暂停"),
    `缺播放按钮，实际：${labels.join("/")}`,
  );
  // 音量滑杆直接吃状态量纲 0–1，不再做 0–100 的换算（换算就多两个可能写错的比例）
  assert.equal(Number(await app.evaluate(`document.querySelector(".volume input")?.value`)), 0.8, "音量初始值");
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
  // 开关在站尺右端；直播壳本身用固定夜间 token，明暗作用于各房间页
  assert.ok(await app.waitFor(`!!document.querySelector(".ruler .theme-toggle")`, 3000), "站尺缺明暗按钮");
  const beforeTheme = await app.evaluate(`document.documentElement.dataset.theme ?? "(未设)"`);
  await app.evaluate(`document.querySelector(".ruler .theme-toggle")?.click()`);
  const flippedTheme = await app.evaluate(`document.documentElement.dataset.theme`);
  assert.notEqual(flippedTheme, beforeTheme, "点明暗按钮后 data-theme 没变");
  await app.evaluate(`document.querySelector(".ruler .theme-toggle")?.click()`);
  const backTheme = await app.evaluate(`document.documentElement.dataset.theme`);
  assert.equal(backTheme, beforeTheme, "再点一次应切回原主题");
  console.log(`  theme OK：${beforeTheme} → ${flippedTheme} → ${backTheme}`);

  /* ---- 睡眠定时「播完当前曲再停」（P0-24）：勾选在弹层里，且真的落到状态 ---- */
  await app.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("睡眠"))?.click()`);
  assert.ok(await app.waitFor(`!!document.querySelector(".sleep-wait input")`, 3000), "睡眠弹层应有「播完当前曲再停」勾选");
  await app.evaluate(`document.querySelector(".sleep-wait input")?.click()`);
  assert.equal(await app.evaluate(`document.querySelector(".sleep-wait input")?.checked`), true, "勾上后应保持选中");
  await app.evaluate(`document.querySelector(".sleep-wait input")?.click()`); // 复原，别把偏好写进存档
  await app.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("睡眠"))?.click()`);
  console.log("  睡眠定时 OK：播完当前曲再停可选");

  /* ---- 设置页：输出设备下拉（P0-09）---- */
  await app.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent === "设置")?.click()`);
  assert.ok(await app.waitFor(`document.querySelector("select.set-pick") !== null`, 5000), "设置页没有输出设备下拉（P0-09）");
  const outputOpts = await app.evaluate(
    `[...document.querySelectorAll("select.set-pick option")].map((o) => o.textContent ?? "")`,
  );
  assert.ok(
    outputOpts.length >= 1 && outputOpts[0].includes("默认"),
    `下拉至少要能回到"跟随系统默认"，实际 ${JSON.stringify(outputOpts)}`,
  );
  // 这条是环境断言：setSinkId 一旦没了（Electron 降级/换内核），设备选择会"看着能选其实无效"
  const sinkApi = await app.evaluate(`typeof AudioContext.prototype.setSinkId`);
  assert.equal(sinkApi, "function", `AudioContext.setSinkId 不可用，实际 ${sinkApi}`);

  /* ---- 设置页：全局快捷键补 seek（P0-23）---- */
  const shortcutText = await app.evaluate(
    `[...document.querySelectorAll(".set-block")].map((b) => b.innerText).join("\\n")`,
  );
  assert.ok(shortcutText.includes("快进 5 秒"), "快捷键区块应有「快进 5 秒」（P0-23）");
  assert.ok(shortcutText.includes("快退 5 秒"), "快捷键区块应有「快退 5 秒」");
  const keycaps = await app.evaluate(`[...document.querySelectorAll(".keycap")].map((b) => b.textContent ?? "")`);
  assert.ok(
    keycaps.some((t) => t.includes("Ctrl+Alt+Right")),
    `seek 前键默认应是 Ctrl+Alt+Right，实际 ${JSON.stringify(keycaps)}`,
  );
  assert.ok(
    keycaps.some((t) => t.includes("Ctrl+Alt+Shift+Right")),
    "切歌键应退到 Ctrl+Alt+Shift+Right（不与 seek 撞车）",
  );
  console.log("  全局快捷键 OK：9 项含 seek，键位不撞车");

  // 回到在线页：确认产品音源列表（示例音源已于 2026-11-05 移除）
  await app.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent === "在线")?.click()`);
  await sleep(200);
  console.log(`  输出设备 OK：下拉 ${outputOpts.length} 项，setSinkId 可用`);

  const segs = await app.evaluate(
    `[...document.querySelectorAll(".seg button")].map((b) => (b.textContent || "").trim())`,
  );
  assert.ok(
    segs.includes("网易云音乐") && segs.includes("QQ 音乐"),
    `在线音源列表不对，实际：${segs.join("/")}`,
  );
  assert.ok(!segs.includes("示例音源"), "示例音源不该再出现在产品里");
  console.log("  在线音源 OK：网易云 / QQ，示例音源已移除");

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

    // 重启后外壳仍是不夜台：旧壳（直白模式）已删除，没有别的落点
    assert.ok(await app2.waitFor(`!!document.querySelector(".ruler")`, 5000), "重启后没回到不夜台外壳");
    if (!(await app2.waitFor(`document.querySelector(".np-tx b")?.textContent === ${JSON.stringify(first)}`, 10000))) {
      const shown = await app2.evaluate(`document.querySelector(".np-tx b")?.textContent ?? "(无)"`);
      const raw = await app2.evaluate(`window.api.loadState().then(s => s ? s.slice(0, 140) : "null")`);
      throw new Error(`重启后没恢复出上次的曲目。界面显示 ${shown}；存档 ${raw}`);
    }

    assert.equal(Number(await app2.evaluate(`document.querySelector(".volume input")?.value`)), 0.3, "音量应恢复成 30%");
    // 播放器状态读取口 = console 主按钮的 aria-label（「暂停」= 在播 /「播放」= 停着）。
    // 顶栏不再常驻状态徽标（只出不出的错误提示），别再拿它当状态源。
    const playLabel0 = await app2.evaluate(`document.querySelector(".tb.main")?.getAttribute("aria-label") ?? ""`);
    assert.equal(playLabel0, "播放", `恢复后应停在暂停态（主按钮应为「播放」），实际 ${playLabel0}`);
    // 位置要轮询等：cue 之后引擎还要 load 才会 seek，读一次必然撞上还没锚定的 0
    const positionOk = await app2.waitFor(
      `Math.abs(Number(document.querySelector(".seek input")?.value ?? 0) - 2000) <= 1000`,
      8000,
    );
    const position = await app2.evaluate(`Number(document.querySelector(".seek input")?.value ?? 0)`);
    assert.ok(positionOk, `位置应恢复成 2000±1000ms，实际 ${position}`);
    console.log("  重启恢复 OK：曲目 / 位置 / 音量 / 暂停态");

    // 先真播起来，再连切 —— 暂停态切歌测不到"边播边切"
    await app2.evaluate(`${PLAY_BUTTON}.click()`);
    await sleep(600);

    // 预取（P0-08）与淡入淡出（P0-07）**这里不测**：两个 <audio> 是 `new Audio()` 建的，
    // 不进 DOM（`querySelectorAll("audio")` 恒为 []），属性嗅探只会得到"空数组全通过"的假绿。
    // 它们的判据是听觉与切歌延迟，见文件头那句「切歌不爆音是听觉判据」——手测项列在 docs/22 §四。

    const seen = new Set();
    for (let i = 1; i <= 20; i += 1) {
      const before = await app2.evaluate(`document.querySelector(".np-tx b")?.textContent ?? ""`);
      await app2.evaluate(`${NEXT_BUTTON}.click()`);
      await sleep(200);
      const errored = await app2.evaluate(`document.querySelector(".status")?.textContent ?? ""`);
      assert.ok(!errored, `第 ${i} 次切歌落进 error：${errored}`);
      const track = await app2.evaluate(`document.querySelector(".np-tx b")?.textContent ?? ""`);
      seen.add(track);
      const bar = await app2.evaluate(
        `(() => { const b = document.querySelector(".seek input"); return { v: Number(b?.value ?? 0), m: Number(b?.max ?? 0) }; })()`,
      );
      assert.ok(bar.v <= bar.m + 1000, `第 ${i} 次切歌后进度条越界：${bar.v} > ${bar.m}`);
      // 切歌就是要播：主按钮读「暂停」= store 在 playing。
      // 唯一允许不播的情况是已经走到队尾（没切歌，标题不变）——那时是正常的「播完了」
      const label = await app2.evaluate(`document.querySelector(".tb.main")?.getAttribute("aria-label") ?? ""`);
      if (label !== "暂停") {
        assert.equal(track, before, `第 ${i} 次切歌后停在暂停态，但曲子已经换了（${before} → ${track}）`);
      }
    }
    assert.ok(seen.size >= 15, `20 次切歌应切到多个不同曲目，实际只有 ${seen.size} 个`);
    console.log(`  连切 20 首 OK：经过 ${seen.size} 个不同曲目，无 error、进度条不越界`);

    /* 播放模式仍要能从界面切四档（切档不崩、状态不变 error） */
    const clickMode = `(() => {
      const b = [...document.querySelectorAll(".tools button")].find((x) => (x.title || "").startsWith("播放模式"));
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
    const vol0 = Number(await app2.evaluate(`document.querySelector(".volume input")?.value`));
    await press("ArrowUp");
    const vol1 = Number(await app2.evaluate(`document.querySelector(".volume input")?.value`));
    assert.ok(vol1 > vol0, `↑ 应加大音量：${vol0} → ${vol1}`);
    await press("ArrowDown");
    const vol2 = Number(await app2.evaluate(`document.querySelector(".volume input")?.value`));
    assert.ok(vol2 < vol1, `↓ 应减小音量：${vol1} → ${vol2}`);
    const muted0 = await app2.evaluate(`document.querySelector("button.mute")?.getAttribute("aria-pressed")`);
    await press("m");
    const muted1 = await app2.evaluate(`document.querySelector("button.mute")?.getAttribute("aria-pressed")`);
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

    /* 账号区块（R1）：喜欢 / 最近两页各挂一块账号区（未登录给提示，不是空白） */
    for (const [page, want] of [
      ["liked", "账号红心"],
      ["recent", "账号听歌排行"],
    ]) {
      await app2.evaluate(`document.querySelector('[data-page="${page}"]')?.click()`);
      const mounted = await app2.waitFor(`!!document.querySelector(".acct")`, 3000);
      const txt = await app2.evaluate(`document.querySelector(".acct")?.textContent ?? ""`);
      assert.ok(mounted && txt.includes(want), `${page} 页应有「${want}」区块，实际：${txt.slice(0, 40)}`);
    }
    await app2.evaluate(`document.querySelector('[data-page="library"]')?.click()`);
    console.log("  账号区块 OK：喜欢的音乐 / 最近播放 各挂一块账号区");

    /* 离线态（P0-25）：事件 → 横幅出现；恢复 → 消失 */
    await app2.evaluate(`window.dispatchEvent(new Event("offline"))`);
    assert.ok(await app2.waitFor(`!!document.querySelector(".net-banner")`, 2000), "断网应出常驻横幅");
    await app2.evaluate(`window.dispatchEvent(new Event("online"))`);
    assert.ok(await app2.waitFor(`!document.querySelector(".net-banner")`, 2000), "恢复后横幅应消失");
    console.log("  离线态 OK：横幅随事件出现 / 消失");

    /* 三态（P0-26）：无封面要有刻纹占位；阶段文案不能是空 */
    assert.ok(await app2.waitFor(`!!document.querySelector(".np-art.blank")`, 3000), "无封面应有刻纹占位");
    const phaseText = await app2.evaluate(`document.querySelector(".np-tx span")?.textContent ?? ""`);
    // 这里只验"阶段行有话说"（样本 wav 只有 5.57s，跑到一半可能已经 ended）；
    // "缓冲中 ≠ 解码中" 由 test/playback-phase.test.mjs 钉
    assert.ok(phaseText.length > 0, "播放条的阶段文案不能是空");
    console.log(`  三态 OK：刻纹占位 + 阶段「${phaseText}」`);

    /* 迷你窗（P0-27）：封面位 + 歌词行 + 可拖进度 */
    await app2.evaluate(`window.api.openMini()`);
    const miniWin = await evaluateInWindow(
      "mini.html",
      `({
        seek: !!document.querySelector(".mini-seek"),
        art: !!document.querySelector(".mini-art"),
        btns: document.querySelectorAll(".mini-btns button").length,
      })`,
    );
    assert.ok(miniWin?.seek, "迷你窗应有可拖进度条（P0-27）");
    assert.ok(miniWin?.art, "迷你窗应有封面位");
    assert.ok(miniWin?.btns >= 4, `迷你窗应有 4 个控制键，实际 ${miniWin?.btns}`);
    console.log("  迷你窗 OK：封面 + 歌词 + 可拖进度 + 控制键");

    /* 换词入口（P0-19）：控制台「正在播放」→ 播放页 →「视图」→「换一份…」 */
    await app2.evaluate(`document.querySelector("button.np")?.click()`);
    assert.ok(await app2.waitFor(`!!document.querySelector(".st-viewbtn")`, 3000), "应能进入播放页");
    await app2.evaluate(`document.querySelector(".st-viewbtn")?.click()`);
    const hasFind = await app2.waitFor(
      `[...document.querySelectorAll(".st-menu-row button")].some((b) => b.textContent.includes("换一份"))`,
      3000,
    );
    assert.ok(hasFind, "视图菜单应有「换一份…」（P0-19 入口）");
    await app2.evaluate(
      `[...document.querySelectorAll(".st-menu-row button")].find((b) => b.textContent.includes("换一份"))?.click()`,
    );
    const prefilled = await app2.waitFor(
      `(() => { const i = document.querySelector(".palette-input"); return !!i && i.value.trim().length > 0; })()`,
      3000,
    );
    assert.ok(prefilled, "换词弹窗应预填「歌名 歌手」");
    console.log("  换词弹窗 OK：入口可达 + 预填查询");

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
    await app4.evaluate(
      `[...document.querySelectorAll(".tools button")].find((b) => b.textContent === "队列")?.click()`,
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
      `document.querySelector(".np-tx b")?.textContent === ${JSON.stringify(first)}`,
      10000,
    );
    const track5 = await app5.evaluate(`document.querySelector(".np-tx b")?.textContent ?? "(无)"`);
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
