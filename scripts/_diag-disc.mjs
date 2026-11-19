/** 探针：起真 app（真实 profile 副本），截发现页各段。跑法见 _diag-open.mjs 注释。 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { sleep } from "./lib/harness.mjs";

delete process.env.ELECTRON_RUN_AS_NODE;
const APP_NAME = "Afeifei 阿飞飞";
const REAL_PROFILE = path.join(process.env.APPDATA ?? "", APP_NAME);
const PORT = 9453;
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

const ws = new WebSocket(target.webSocketDebuggerUrl);
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

/* 默认页就是发现（online）；确保过登记、亮色 */
await send("Runtime.evaluate", { expression: `localStorage.setItem("afeifei.v42.palette", JSON.stringify("default")); localStorage.setItem("afeifei.v42.entered", "true");` });
await send("Page.reload", { ignoreCache: true });
await sleep(6000);

const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync("docs/assets", { recursive: true });
  fs.writeFileSync(`docs/assets/${name}.png`, Buffer.from(s.result.data, "base64"));
  console.log(`✓ ${name}.png`);
};

console.log("首屏:", await evalJs(`location.href + " | " + document.title`));
await shot("diag-disc-top");
await evalJs(`(() => { const el = document.querySelector(".chart-feat-row"); if (el) el.scrollIntoView({ block: "start" }); const m = document.querySelector(".main__page"); return m ? m.scrollTop : -1; })()`);
await sleep(900);
await shot("diag-disc-mid");
await evalJs(`(() => { const m = document.querySelector(".main__page"); if (m) m.scrollTop = m.scrollHeight * 0.66; return m ? m.scrollTop : -1; })()`);
await sleep(900);
await shot("diag-disc-low");
const state = await evalJs(`(() => {
  const q = (s) => document.querySelector(s);
  const n = (s) => document.querySelectorAll(s).length;
  return JSON.stringify({
    feat: n(".chart-feat"), gridRows: n(".chart-grid .chart-row"),
    hotCards: n(".hot-card"), mixRows: n(".mix-row"),
    homeCards: n(".home-card"), homePairSecs: n(".home-sec--list"),
    exceptions: undefined,
  });
})()`);
console.log("DOM 状态:", state);
console.log("控制台事件:", events.length ? "\n" + events.slice(0, 15).join("\n") : "(无异常)");

ws.close(); child.kill("SIGKILL");
fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
