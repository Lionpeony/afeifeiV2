import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";

const port = 4319;
// 起主进程（复用正式入口的窗口创建逻辑太重，直接开 BrowserWindow 加载 dist 渲染层）
// 渲染层需要 preload 才能起服务——探针只看 CSS，允许渲染层报桥错误。
const win = new BrowserWindow({
  width: 1104,
  height: 705,
  show: false,
  webPreferences: { nodeIntegration: false, contextIsolation: true },
});

app.whenReady().then(async () => {
  await win.loadFile("dist/index.html").catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const probe = await win.webContents.executeJavaScript(
    `(() => {
      const stage = document.querySelector(".cs-stage");
      if (!stage) return { has: false, body: document.body.className };
      const cs = getComputedStyle(stage);
      const home = getComputedStyle(document.querySelector(".cs-home") ?? stage.parentElement);
      return {
        has: true,
        stageBg: cs.background.slice(0, 220),
        stageBgColor: cs.backgroundColor,
        stageH: stage.getBoundingClientRect().height,
        vars: {
          ink: cs.getPropertyValue("--live-ink").trim(),
          bg: cs.getPropertyValue("--live-bg").trim(),
        },
        homeBg: home.backgroundColor,
      };
    })()`,
    true,
  );
  console.log("STAGE-PROBE", JSON.stringify(probe, null, 1));
  app.exit(0);
});
