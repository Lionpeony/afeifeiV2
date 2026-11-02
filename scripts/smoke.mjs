#!/usr/bin/env node
/**
 * 冒烟（51 §2.5，M1 起接入）。真起 Electron + CDP，不注入假数据也不打真网。
 * 只证明「界面起得来、桥通、状态在」——播放本身要靠人点，别在这假装。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";

const PORT = 9333;
const EXE = path.join("node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");

if (!fs.existsSync(EXE)) {
  console.error(`✗ 找不到 Electron：${EXE}（先 npm install）`);
  process.exit(1);
}

const child = spawn(
  EXE,
  [
    "dist/main.js",
    `--remote-debugging-port=${PORT}`,
    // 冒烟里没有真实用户手势，放行自动播放；真实使用时仍由点击触发
    "--autoplay-policy=no-user-gesture-required",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

let appLog = "";
child.stdout.on("data", (b) => {
  appLog += String(b);
});
child.stderr.on("data", (b) => {
  appLog += String(b);
});

function cleanup() {
  try {
    child.kill();
  } catch {
    /* 已退出 */
  }
}

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

async function waitTarget(timeoutMs = 20000) {
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
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`CDP 目标超时；应用输出：\n${appLog}`);
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
    // 页面的 console / 异常 / CSP 违规全收下来，失败时一起打出来
    if (msg.method === "Log.entryAdded") events.push(`[log] ${msg.params.entry.text}`);
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      events.push(`[exception] ${d.text} ${d.exception?.description ?? ""}`);
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      events.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
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

try {
  const page = await waitTarget();
  const client = connect(page.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Runtime.enable");
  await client.send("Log.enable");

  const evaluate = async (expression) => {
    const msg = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(`页面执行出错：${JSON.stringify(msg.result.exceptionDetails)}`);
    }
    return msg.result?.result?.value;
  };

  // 先重载一次：脚本的执行期异常只有在 Runtime.enable 之后发生的才抓得到
  await client.send("Page.enable");
  await client.send("Page.reload", { ignoreCache: true });

  const waitFor = async (expression, timeoutMs = 8000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(expression)) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  };

  if (!(await waitFor(`document.querySelector("h1")?.textContent === "afeifei"`))) {
    const href = await evaluate(`location.href`);
    const assets = await evaluate(
      `fetch("app.js").then(r => r.status + " " + r.headers.get("content-type")).catch(e => "ERR " + e.message)`,
    );
    const dump = await evaluate(`document.documentElement.outerHTML.slice(0, 200)`);
    throw new Error(
      `界面没渲染出来。href=${href} app.js=${assets}\nDOM：${dump}\n页面事件：\n${client.events.join("\n") || "(无)"}`,
    );
  }

  const pong = await evaluate(`window.api.ping()`);
  assert.equal(pong, "pong", "preload 桥没通");

  const buttons = await evaluate(`document.querySelectorAll("button").length`);
  assert.equal(buttons, 4, `按钮数应为 4，实际 ${buttons}`);

  const volume = await evaluate(`document.querySelector(".volume input")?.value ?? ""`);
  assert.equal(volume, "80", "音量初始值应来自 store");

  const status = await evaluate(`document.querySelector(".status")?.textContent ?? ""`);
  assert.ok(status.length > 0, "状态没渲染");

  const sheets = await evaluate(`document.styleSheets.length`);
  assert.ok(sheets >= 1, "样式表没加载");

  // 端到端播放：令牌 → appmedia:// → 真解码 → 播放推进
  const sample = findSampleAudio();
  if (sample) {
    const token = await evaluate(`window.api.grant(${JSON.stringify(sample)})`);
    assert.ok(token, `grant 没返回令牌：${sample}`);

    const probe = await evaluate(`new Promise((resolve) => {
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

    assert.ok(probe.duration > 0, `解码失败：${JSON.stringify(probe)}（文件 ${sample}）`);
    assert.ok(probe.currentTime > 0, `播放没有推进：${JSON.stringify(probe)}`);
    console.log(`  解码 + 播放 OK：${path.basename(sample)}，时长 ${probe.duration.toFixed(2)}s`);
  } else {
    console.log("  SKIP 端到端播放：没找到示例音频（C:\\Windows\\Media\\*.wav）");
  }

  console.log("SMOKE PASS：界面 / 桥 / 状态 / 控件 / 样式 / 播放 均正常");
  client.close();
  cleanup();
  process.exit(0);
} catch (err) {
  console.error(`✗ SMOKE 失败：${err.message}`);
  if (appLog.trim()) console.error(`--- 应用输出：\n${appLog.trim()}`);
  cleanup();
  process.exit(1);
}
