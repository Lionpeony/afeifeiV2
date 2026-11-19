/** 探针：mygo 亮色下的 btn-primary 可读性复现。跑法同 _diag-open.mjs。 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { sleep } from "./lib/harness.mjs";

delete process.env.ELECTRON_RUN_AS_NODE;
const APP_NAME = "Afeifei 阿飞飞";
const REAL_PROFILE = path.join(process.env.APPDATA ?? "", APP_NAME);
const PORT = 9454;
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
    target = list.find((t) => t.type === "page");
  } catch (e) {
    console.log(`[probe ${i}] fetch fail: ${e.cause?.code ?? e.message}`);
  }
  if (!target) await sleep(500);
}
if (!target) { console.log("=== 无 page target，进程日志：\n" + log.slice(-2000)); child.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === "Runtime.exceptionThrown") events.push(`[exception] ${msg.params.exceptionDetails.text}`);
});
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");

await send("Runtime.evaluate", { expression: `localStorage.setItem("afeifei.v42.palette", JSON.stringify("mygo")); localStorage.setItem("afeifei.v42.themePref", JSON.stringify("light")); localStorage.setItem("afeifei.v42.entered", "true");` });
await send("Page.reload", { ignoreCache: true });
await sleep(6000);

const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
const state = await evalJs(`(() => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const btn = document.querySelector(".btn-primary");
  const bcs = btn ? getComputedStyle(btn) : null;
  const where = [];
  if (btn) {
    for (const ss of document.styleSheets) {
      try {
        for (const r of ss.cssRules) {
          if (r.selectorText && r.style && r.style.color && r.style.getPropertyValue("color").includes("var(") && btn.matches(r.selectorText)) {
            where.push(r.selectorText + " -> color:" + r.style.getPropertyValue("color"));
          }
        }
      } catch {}
    }
  }
  return JSON.stringify({
    palette: root.dataset.palette, theme: root.dataset.theme,
    onAccent: cs.getPropertyValue("--on-accent").trim(),
    pink600: cs.getPropertyValue("--pink-600").trim(),
    btnText: btn ? btn.textContent.trim() : "(无按钮)",
    btnColor: bcs ? bcs.color : "-",
    btnBg: bcs ? bcs.backgroundColor : "-",
    btnMatches: where.slice(0, 8),
  });
})()`);
console.log("DOM 状态:", state);
const s = await send("Page.captureScreenshot", { format: "png" });
fs.mkdirSync("docs/assets", { recursive: true });
fs.writeFileSync("docs/assets/diag-mygo-btn.png", Buffer.from(s.result.data, "base64"));
console.log("✓ docs/assets/diag-mygo-btn.png");
console.log("控制台事件:", events.length ? "\n" + events.slice(0, 10).join("\n") : "(无异常)");

ws.close(); child.kill("SIGKILL");
fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
