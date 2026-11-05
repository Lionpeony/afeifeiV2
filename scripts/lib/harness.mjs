#!/usr/bin/env node
/**
 * 起 Electron + CDP 的小工具，冒烟与性能脚本共用（51 §2.5 / §5）。
 * 只做「起进程 / 连调试端口 / 求值 / 等条件 / 收尾」，不含任何业务断言。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function electronExe() {
  return path.join("node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
}

export function requireElectron() {
  const exe = electronExe();
  if (!fs.existsSync(exe)) {
    console.error(`✗ 找不到 Electron：${exe}（先 npm install）`);
    process.exit(1);
  }
  return exe;
}

async function waitTarget(port, getLog, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
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
 * 起一个实例并挂上 CDP。
 * `profile` 传 null 时不加 --user-data-dir：走应用真实的 userData（真实登录态）。
 * @param {{port:number, profile:string|null, extraArgs?:string[], reloadFirst?:boolean}} opts
 */
export async function launch({ port, profile, extraArgs = [], reloadFirst = true }) {
  const exe = requireElectron();
  const args = [
    "dist/main.js",
    `--remote-debugging-port=${port}`,
    ...(profile ? [`--user-data-dir=${profile}`] : []),
    ...extraArgs,
  ];
  const child = spawn(exe, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  child.stdout.on("data", (b) => {
    log += String(b);
  });
  child.stderr.on("data", (b) => {
    log += String(b);
  });

  const page = await waitTarget(port, () => log, 20000);
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

  /** 页面截图（PNG Buffer）。给真实账号截图用，不依赖窗口焦点。 */
  const screenshot = async () => {
    const msg = await client.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(msg.result.data, "base64");
  };

  return {
    evaluate,
    waitFor,
    screenshot,
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

export function cleanupProfile(profile) {
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    /* 被占用就留着，%TEMP% 自己会清 */
  }
}
