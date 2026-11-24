/**
 * 演出状态真机截图（docs/30 §44 验收）
 *
 * 用真实主进程 + 空临时 userData 启动，CDP 连到播放页，
 * 逐包把 .np 的 data-stage / data-seg / data-egg 钉住后截图。
 * 只钉属性、不改组件：验证的是 CSS 状态层与彩蛋本身。
 *
 * 跑法（Node 16 没有全局 WebSocket，借用项目里已有的 ws）：
 *   node scripts/stage-state-shots.mjs
 *   node scripts/stage-state-shots.mjs --out <目录>
 *
 * 落点：Open Design 项目的 assets/diag/（可用 --out 覆盖）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

// Electron 33 自带 Node 20 没有全局 WebSocket；项目里已有 ws（electron-builder 依赖）
const WebSocket = (await import("ws")).default;

const PORT = 9444;
const ELECTRON = path.resolve("node_modules/electron/dist/electron.exe");
const OUT = process.argv.includes("--out")
  ? path.resolve(process.argv[process.argv.indexOf("--out") + 1])
  : "C:/Users/gyrfalcon/AppData/Roaming/Open Design/namespaces/release-stable-win/data/projects/c2506765-7922-4cc0-a1dc-97810e09a48e/assets/diag";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    async evaluate(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    },
    async shot(file) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
      console.log(`  shot → ${file}`);
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
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        })
        .on("error", reject);
    });
  } catch {
    return [];
  }
}

const profile = path.join(os.tmpdir(), `afeifei-state-${process.pid}`);
fs.mkdirSync(profile, { recursive: true });
// 主题偏好存在 KV（userData/ui-theme.json），不是 localStorage；预置成 dark，舞台灯才看得清
fs.writeFileSync(path.join(profile, "ui-theme.json"), JSON.stringify("dark"));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(ELECTRON, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, path.resolve("dist/main.js")], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (b) => process.stdout.write(`[main] ${b}`));
child.stderr.on("data", (b) => process.stderr.write(`[main] ${b}`));

const packs = ["btr", "mygo", "gbc"];
const states = [
  ["idle", "intro"],
  ["playing", "chorus"],
  ["change", "chorus"],
  ["intermission", "chorus"],
  ["curtain", "outro"],
  ["encore", "chorus"],
];
const eggs = [
  ["mygo", "glass-streak"],
  ["gbc", "passerby"],
  ["gbc", "danmaku"],
];

let page;
try {
  fs.mkdirSync(OUT, { recursive: true });

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
  await sleep(800);

  const waitReady = async () => {
    for (let i = 0; i < 100; i += 1) {
      const ok = await page.evaluate(`!!document.querySelector(".main") || !!document.querySelector(".np")`);
      if (ok) return true;
      await sleep(200);
    }
    return false;
  };
  if (!(await waitReady())) throw new Error("界面 20s 内没渲染出 .main");

  const openPlayer = async () => {
    await page.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }))`);
    for (let i = 0; i < 60; i += 1) {
      if (await page.evaluate(`!!document.querySelector(".np")`)) return true;
      await sleep(200);
    }
    return false;
  };

  // React 每次重渲染都会把 data-stage/seg/egg 写回真实值；截图期间用补丁锁住这三个属性
  await page.evaluate(`(() => {
    const sa = Element.prototype.setAttribute, ra = Element.prototype.removeAttribute;
    const locked = (n) => window.__lockAttrs && (n === "data-stage" || n === "data-seg" || n === "data-egg" || n === "data-theme");
    Element.prototype.setAttribute = function (n, v) { if (locked(n)) return; return sa.call(this, n, v); };
    Element.prototype.removeAttribute = function (n) { if (locked(n)) return; return ra.call(this, n); };
  })()`);

  const force = async (palette, stage, seg, egg) => {
    const eggJs = egg ? `np.dataset.egg = ${JSON.stringify(egg)}` : `delete np.dataset.egg`;
    await page.evaluate(`(() => {
      window.__lockAttrs = false;
      document.documentElement.dataset.palette = ${JSON.stringify(palette)};
      document.documentElement.dataset.theme = "dark";
      const np = document.querySelector(".np");
      if (!np) return false;
      np.dataset.stage = ${JSON.stringify(stage)};
      np.dataset.seg = ${JSON.stringify(seg)};
      ${eggJs};
      window.__lockAttrs = true;
      return true;
    })()`);
  };
  const unforce = () => page.evaluate(`window.__lockAttrs = false`);

  for (const pack of packs) {
    await page.evaluate(
      `localStorage.setItem("afeifei.v42.entered", "true"); localStorage.setItem("afeifei.v42.palette", ${JSON.stringify(JSON.stringify(pack))});
       localStorage.setItem("afeifei.v42.unlocked", ${JSON.stringify(JSON.stringify(["default", "mygo", "gbc", "btr"]))});
       location.reload()`,
    );
    await sleep(1500);
    if (!(await waitReady())) throw new Error(`${pack} 重载后没渲染`);
    if (!(await openPlayer())) throw new Error(`${pack} 打不开播放页`);
    await sleep(700);
    await page.evaluate(`document.documentElement.dataset.theme = "dark"`);
    const bg = await page.evaluate(`getComputedStyle(document.querySelector(".np")).backgroundColor`);
    console.log(`\n${pack} 播放页已开，np 背景=${bg}`);

    for (const [stage, seg] of states) {
      await force(pack, stage, seg);
      await sleep(stage === "change" ? 320 : 850);
      const dbg = await page.evaluate(`(() => { const np = document.querySelector(".np"); const cs = getComputedStyle(np, "::after"); return { stage: np.dataset.stage, seg: np.dataset.seg, afterOpacity: cs.opacity, afterAnim: cs.animationName, amb: getComputedStyle(np.querySelector(".np__amb")).opacity }; })()`);
      console.log(`  [dbg] ${pack}/${stage}`, JSON.stringify(dbg));
      await page.shot(`实看-状态-${pack}-${stage}.png`);
      await unforce();
      await sleep(250);
    }
  }

  for (const [pack, egg] of eggs) {
    await page.evaluate(
      `localStorage.setItem("afeifei.v42.entered", "true"); localStorage.setItem("afeifei.v42.palette", ${JSON.stringify(JSON.stringify(pack))});
       location.reload()`,
    );
    await sleep(1500);
    await waitReady();
    if (!(await openPlayer())) throw new Error(`${pack} 打不开播放页`);
    await sleep(500);
    await page.evaluate(`document.documentElement.dataset.theme = "dark"`);
    await force(pack, "playing", "chorus", egg);
    // 弹幕/路人都要从画外走进来，1.5s 还在画外，按动画实际进度取中间帧
    await sleep(egg === "glass-streak" ? 900 : egg === "danmaku" ? 4000 : 3600);
    const eggDbg = await page.evaluate(`(() => {
      const np = document.querySelector(".np");
      const cls = ${JSON.stringify(egg)} === "glass-streak" ? ".np__egg--streak" : ${JSON.stringify(egg)} === "passerby" ? ".np__egg--walk" : ".np__egg--chat";
      const el = document.querySelector(cls);
      if (!el) return { missing: true };
      const cs = getComputedStyle(el);
      const pb = getComputedStyle(el, "::before"); const pa = getComputedStyle(el, "::after");
      return { attr: np.dataset.egg, opacity: cs.opacity, anim: cs.animationName, content: pb.content, pbAnim: pb.animationName, pbOpacity: pb.opacity, paAnim: pa.animationName, rect: el.getBoundingClientRect().toJSON() };
    })()`);
    console.log(`  [eggdbg] ${pack}/${egg}`, JSON.stringify(eggDbg));
    await page.shot(`实看-状态-${pack}-egg-${egg}.png`);
    await unforce();
  }

  console.log("\n完成，图片在：", OUT);
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
