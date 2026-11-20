/* npm start 的启动器：剥掉宿主/终端可能注入的 ELECTRON_RUN_AS_NODE
   （该变量一旦存在，Electron 会被当成纯 Node 跑，主进程直接报
   "Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')"），
   然后拉起带应用图标的 Afeifei.exe。 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "node_modules", "electron", "dist");
/* 优先用改过名的 Afeifei.exe（带品牌图标）；npm 装的 electron 只有 electron.exe，回落之 */
const exe = [path.join(dist, "Afeifei.exe"), path.join(dist, "electron.exe")].find((f) => fs.existsSync(f));
if (!exe) {
  console.error("找不到 electron 可执行文件（node_modules/electron/dist/），先 npm install");
  process.exit(1);
}
const app = path.join(here, "..", "dist", "main.js");

delete process.env.ELECTRON_RUN_AS_NODE;

const child = spawn(exe, [app], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
