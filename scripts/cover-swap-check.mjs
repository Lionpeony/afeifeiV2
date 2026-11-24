/**
 * 切歌封面回归检查（2026-11-24 用户报「切歌时播放页封面不变」）
 *
 * 真实主进程 + 复制出来的用户数据（队列里带上封面地址）启动，打开播放页，
 * 逐首点队列行，断言：
 *   1. .np__poster 里始终只有一张 .np__art（生产版 React 对重复 key 不报警，
 *      旧封面会变孤儿节点堆积，被 CSS 藏起来后画面就停在第一首）
 *   2. 每切一首，封面 <img src> 必须换成那一首的地址
 *
 * 跑法（需要先 node scripts/build.mjs）：
 *   node scripts/cover-swap-check.mjs
 *   AF_SRC_PROFILE="C:/Users/xxx/AppData/Roaming/Afeifei 阿飞飞" node scripts/cover-swap-check.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const WebSocket = (await import("ws")).default;
const PORT = 9445;
const ELECTRON = path.resolve("node_modules/electron/dist/electron.exe");
const REAL = process.env.AF_SRC_PROFILE || path.join(os.homedir(), "AppData/Roaming/Afeifei \u963f\u98de\u98de");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let seq = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(new Error(String(e.message ?? e))));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const hit = pending.get(msg.id);
    if (!hit) return;
    pending.delete(msg.id);
    if (msg.error) hit.reject(new Error(msg.error.message));
    else hit.resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return {
    ready,
    send,
    close: () => ws.close(),
    async evaluate(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    },
  };
}

async function targets() {
  try {
    return await new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve(JSON.parse(body)));
        })
        .on("error", reject);
    });
  } catch {
    return [];
  }
}

if (!fs.existsSync(path.join(REAL, "app-state.json"))) {
  console.error(`找不到 ${REAL}/app-state.json，用 AF_SRC_PROFILE 指定一个用过的用户数据目录`);
  process.exit(2);
}

const profile = path.join(os.tmpdir(), `afeifei-cover-${process.pid}`);
fs.mkdirSync(profile, { recursive: true });
for (const f of ["app-state.json", "ui-theme.json", "active-source.json", "settings.json", "stage-ui.json", "history.json", "netease-cookie.txt", ".netkey"]) {
  const src = path.join(REAL, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(profile, f));
}
fs.writeFileSync(path.join(profile, "ui-theme.json"), JSON.stringify("dark"));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(ELECTRON, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, path.resolve("dist/main.js")], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (b) => process.stdout.write(`[main] ${b}`));
child.stderr.on("data", (b) => process.stderr.write(`[main] ${b}`));

const readArt = `(() => {
  const arts = Array.from(document.querySelectorAll(".np__poster .np__art"));
  return {
    title: document.querySelector(".np__title")?.textContent ?? null,
    artCount: arts.length,
    src: arts[0]?.querySelector("img.np__art-img")?.getAttribute("src") ?? null,
    artSrcs: arts.map((a) => a.querySelector("img")?.getAttribute("src") ?? "noimg"),
  };
})()`;

let page;
try {
  let target = null;
  for (let i = 0; i < 160 && !target; i += 1) {
    await sleep(250);
    target = (await targets()).find((t) => t.type === "page" && t.url.includes("index.html"));
  }
  if (!target) throw new Error("40s 内没等到渲染页");
  page = cdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  const waitFor = async (expr, hint, tries = 100) => {
    for (let i = 0; i < tries; i += 1) {
      if (await page.evaluate(expr)) return true;
      await sleep(200);
    }
    throw new Error(`等不到：${hint}`);
  };
  await waitFor(`!!document.querySelector(".main")`, "主界面");
  await sleep(1500);
  await page.evaluate(`localStorage.setItem("afeifei.v42.entered", "true")`);
  await page.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }))`);
  await waitFor(`!!document.querySelector(".np")`, "播放页");

  const first = await page.evaluate(readArt);
  console.log("初始：", JSON.stringify(first));
  if (first.artCount !== 1) throw new Error(`海报区已有 ${first.artCount} 张封面（应为 1）`);

  const seen = new Set(first.src ? [first.src] : []);
  for (let i = 1; i <= 3; i += 1) {
    const ok = await page.evaluate(`(() => {
      const row = document.querySelectorAll(".qrow")[${i}];
      if (!row) return false;
      row.click();
      return true;
    })()`);
    if (!ok) throw new Error(`没有第 ${i + 1} 行队列`);
    await sleep(1200);
    const info = await page.evaluate(readArt);
    console.log(`点第 ${i + 1} 行 →`, JSON.stringify(info));
    if (info.artCount !== 1) throw new Error(`切歌后封面堆到 ${info.artCount} 张：生产版 React 的 key 又撞了`);
    if (!info.src || info.src === first.src) throw new Error(`切到《${info.title}》后封面还是旧的`);
    seen.add(info.src);
  }
  if (seen.size < 4) throw new Error(`4 首只见到 ${seen.size} 张封面`);
  console.log(`\nOK：4 首 4 张封面，海报始终一张`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  try {
    page?.close();
  } catch {
    /* ignore */
  }
  child.kill();
  await sleep(500);
}
