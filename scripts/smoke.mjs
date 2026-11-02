#!/usr/bin/env node
/**
 * 冒烟（51 §2.5，M1 起接入）。真起 Electron + CDP，不注入假数据、不打真网。
 *
 * 两阶段：
 *   1. 界面 / 桥 / 状态 / 控件 / 样式 / 真实解码播放 / 存档写入
 *   2. 强杀后重启，验证队列与音量被恢复（模拟断电，不走 beforeunload）
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

if (!fs.existsSync(EXE)) {
  console.error(`✗ 找不到 Electron：${EXE}（先 npm install）`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 系统自带的示例音频。没有就跳过播放验证，不让冒烟变成"看你机器安不安装媒体文件"。 */
function findSampleAudio() {
  try {
    const dir = "C:\\Windows\\Media";
    const hit = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".wav"));
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

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

/** 起一个实例，挂上 CDP，返回 evaluate / waitFor / close。 */
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

  // 重载一次：脚本执行期异常只有在 Runtime.enable 之后发生的才抓得到
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
      // hard = 直接杀，模拟断电；不给 beforeunload 机会
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

async function main() {
  const sample = findSampleAudio();
  const baseName = sample ? path.basename(sample) : null;

  /* ---------------- 阶段 1：界面与播放 ---------------- */
  const app = await launch(["--autoplay-policy=no-user-gesture-required"]);
  current = app;

  if (!(await app.waitFor(`document.querySelector("h1")?.textContent === "afeifei"`))) {
    const href = await app.evaluate(`location.href`);
    throw new Error(`界面没渲染出来。href=${href}\n页面事件：\n${app.events().join("\n") || "(无)"}`);
  }

  assert.equal(await app.evaluate(`window.api.ping()`), "pong", "preload 桥没通");
  assert.equal(await app.evaluate(`document.querySelectorAll("button").length`), 4, "按钮数应为 4");
  assert.equal(await app.evaluate(`document.querySelector(".volume input")?.value`), "80", "音量初始值");
  assert.ok((await app.evaluate(`document.styleSheets.length`)) >= 1, "样式表没加载");

  const badToken = await app.evaluate(
    `fetch("appmedia://deadbeef-0000-0000").then(r => r.status).catch(() => "ERR")`,
  );
  assert.equal(badToken, 410, `无效令牌应返回 410，实际 ${badToken}`);

  if (sample) {
    const token = await app.evaluate(`window.api.grant(${JSON.stringify(sample)})`);
    assert.ok(token, `grant 没返回令牌：${sample}`);

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
    console.log(`  解码 + 播放 OK：${baseName}，时长 ${probe.duration.toFixed(2)}s`);
  } else {
    console.log("  SKIP 播放验证：没找到示例音频（C:\\Windows\\Media\\*.wav）");
  }

  /* ---------------- 存档 + 强杀 ---------------- */
  if (sample) {
    const snapshot = {
      v: 1,
      trackId: sample,
      positionMs: 2000,
      volume: 0.3,
      queue: { items: [sample], cursor: 0, context: [sample], history: [], mode: "order", shuffleSeed: 1 },
    };
    await app.evaluate(`window.api.saveState(${JSON.stringify(JSON.stringify(snapshot))})`);

    const roundtrip = await app.evaluate(`window.api.loadState()`);
    assert.ok(
      typeof roundtrip === "string" && roundtrip.includes(baseName),
      `saveState 之后 loadState 拿不到内容：${String(roundtrip).slice(0, 120)}`,
    );
  }

  // 强杀：不走 beforeunload，等价于断电/任务管理器结束进程
  await app.close({ hard: true });
  current = null;
  await sleep(1200);

  /* ---------------- 阶段 2：重启恢复 ---------------- */
  if (sample) {
    const app2 = await launch([]);
    current = app2;

    const restored = await app2.waitFor(
      `document.querySelector(".track")?.textContent === ${JSON.stringify(baseName)}`,
      10000,
    );
    if (!restored) {
      const shown = await app2.evaluate(`document.querySelector(".track")?.textContent ?? "(无)"`);
      const raw = await app2.evaluate(`window.api.loadState().then(s => s ? s.slice(0, 140) : "null")`);
      throw new Error(`重启后没恢复出上次的曲目。界面显示 ${shown}；存档 ${raw}`);
    }

    const volume = await app2.evaluate(`document.querySelector(".volume input")?.value ?? ""`);
    assert.equal(volume, "30", `音量应从存档恢复成 30，实际 ${volume}`);

    const status = await app2.evaluate(`document.querySelector(".status")?.textContent ?? ""`);
    assert.ok(status.startsWith("paused") || status.startsWith("loading"), `恢复后应停在暂停态，实际 ${status}`);

    // 位置：存档写的是 2000ms，允许 1s 节流误差（50 §18 第 7 条）
    const position = await app2.evaluate(`Number(document.querySelector(".bar input")?.value ?? 0)`);
    assert.ok(Math.abs(position - 2000) <= 1000, `位置应从存档恢复成 2000±1000ms，实际 ${position}`);

    console.log("  重启恢复 OK：曲目 / 位置 / 音量 / 暂停态 均来自存档");
    await app2.close();
    current = null;
  }

  console.log("SMOKE PASS：界面 / 桥 / 状态 / 控件 / 样式 / 播放 / 恢复 均正常");
}

try {
  await main();
  process.exit(0);
} catch (err) {
  console.error(`✗ SMOKE 失败：${err.message}`);
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
