/** 探针：起真 app（真实 profile 副本），盯 /json/list，截首屏。 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { sleep } from "./lib/harness.mjs";

delete process.env.ELECTRON_RUN_AS_NODE;
const APP_NAME = "Afeifei 阿飞飞";
const REAL_PROFILE = path.join(process.env.APPDATA ?? "", APP_NAME);
const PORT = 9452;
const SKIP = new Set(["Cache_Data", "GPUCache", "Code Cache", "DawnGraphiteCache", "DawnWebGPUCache", "blob_storage"]);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "afeifei-diag-"));
fs.cpSync(REAL_PROFILE, path.join(profile, APP_NAME), { recursive: true, filter: (s) => !SKIP.has(path.basename(s)) });

const child = spawn(path.resolve("node_modules/electron/dist/electron.exe"), [
  "dist/main.js", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
], { stdio: ["ignore", "pipe", "pipe"] });
let log = "";
child.stdout.on("data", (b) => (log += String(b)));
child.stderr.on("data", (b) => (log += String(b)));

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await res.json();
    console.log(`[probe ${i}] targets:`, list.map((t) => `${t.type}:${t.url.slice(0, 60)}`).join("  ||  "));
    target = list.find((t) => t.type === "page");
  } catch (e) {
    console.log(`[probe ${i}] fetch fail: ${e.cause?.code ?? e.message}`);
  }
  if (!target) await sleep(500);
}
if (!target) { console.log("=== 无 page target，进程日志：\n" + log.slice(-3000)); child.kill(); process.exit(1); }

const WebSocket2 = WebSocket;
const ws = new WebSocket2(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === "Log.entryAdded") events.push(`[log] ${msg.params.entry.text}`);
  if (msg.method === "Runtime.exceptionThrown") events.push(`[exception] ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ""}`);
});
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");

/* 复现用户现场：mygo 亮色 + 已过登记 + 歌单页（不动窗口/仿真，纯 localStorage） */
await send("Runtime.evaluate", { expression: `localStorage.setItem("afeifei.v42.palette", JSON.stringify("mygo")); localStorage.setItem("afeifei.v42.entered", "true");` });
await send("Page.reload", { ignoreCache: true });
await sleep(5000);
await send("Runtime.evaluate", { expression: `[...document.querySelectorAll("button,.nav-item")].find(b => b.textContent.trim() === "歌单")?.click()` });
await sleep(2500);

const shot = await send("Page.captureScreenshot", { format: "png" });
fs.mkdirSync("docs/assets", { recursive: true });
fs.writeFileSync("docs/assets/diag-open.png", Buffer.from(shot.result.data, "base64"));
console.log("✓ 截图 → docs/assets/diag-open.png");

const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
const state = await evalJs(`(() => {
  const root = document.documentElement;
  const page = document.querySelector(".main__page");
  const app = document.querySelector(".app");
  const main = document.querySelector(".main");
  const rect = (el) => el ? [Math.round(el.getBoundingClientRect().x), Math.round(el.getBoundingClientRect().y), Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)].join(",") : "(无)";
  return JSON.stringify({
    palette: root.dataset.palette, theme: root.dataset.theme, motion: root.dataset.motion,
    splashAlive: !!document.querySelector(".splash"),
    auth: !!document.querySelector(".auth"),
    inner: innerWidth + "x" + innerHeight, dpr: devicePixelRatio,
    zoom: document.body.style.zoom || getComputedStyle(document.body).zoom || "(none)",
    appCols: getComputedStyle(app).gridTemplateColumns,
    appDisplay: getComputedStyle(app).display,
    appClass: app.className,
    mq1120: matchMedia("(max-width: 1120px)").matches,
    shellRule: (() => { try { for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.selectorText === ".app") return (r.style.display ?? "(no-display)") + " @" + (ss.href ?? "inline").split("/").pop(); } } catch {} } return "(规则未找到)"; } catch (e) { return "ERR:" + e.message; } })(),
    appRect: rect(app), sideRect: rect(document.querySelector(".sidebar")), mainRect: rect(main),
    mainDisplay: main ? getComputedStyle(main).display + " rows=" + getComputedStyle(main).gridTemplateRows : "(无)",
    mainChildren: main ? [...main.children].map(c => c.className + "@" + rect(c)).join(" | ") : "(无)",
    pageRect: rect(page),
    pageAnim: page ? getComputedStyle(page).animationName : "?",
    bodyH: document.body.scrollHeight, winH: innerHeight,
    mainHTMLHead: page ? page.innerHTML.slice(0, 200) : "(无)",
  });
})()`);
console.log("DOM 状态:", state);
console.log("控制台事件:", events.length ? "\n" + events.slice(0, 25).join("\n") : "(无异常)");

ws.close(); child.kill("SIGKILL");
fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
