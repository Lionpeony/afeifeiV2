import path from "node:path";
import { launch, sleep } from "./lib/harness.mjs";

// 用应用真实的数据目录（含已登录的 cookie），只加调试端口
const PROFILE = path.join(process.env.APPDATA, "Electron");
const PORT = 9450;

const app = await launch({ port: PORT, profile: PROFILE });
try {
  await app.waitFor(`document.querySelector("h1")?.textContent === "afeifei"`);

  const click = (text) =>
    app.evaluate(
      `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(text)})?.click()`,
    );

  await click("在线");
  await sleep(800);

  const login = await app.evaluate(`[...document.querySelectorAll("button")].map((b) => b.textContent).join(" | ")`);
  console.log("按钮:", login);

  await app.evaluate(`(() => {
    const input = document.querySelector(".search");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "周杰伦");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await click("搜索");

  const got = await app.waitFor(`document.querySelectorAll(".online-row").length > 0`, 20000);
  console.log("搜索结果:", got ? "有" : "无");

  if (got) {
    await app.evaluate(`document.querySelector(".online-row").click()`);
    await sleep(5000);

    const status = await app.evaluate(`document.querySelector(".status")?.textContent ?? "(无)"`);
    const track = await app.evaluate(`document.querySelector(".np-title")?.textContent ?? "(无)"`);
    const note = await app.evaluate(`document.querySelector(".lib-note")?.textContent ?? "(无)"`);
    const time = await app.evaluate(`document.querySelector(".time")?.textContent ?? "(无)"`);
    console.log(`状态=${status}`);
    console.log(`曲目=${track.slice(0, 60)}`);
    console.log(`提示=${note}`);
    console.log(`时间=${time}`);

    const events = app.events().filter((e) => !e.includes("[log] [netease]"));
    if (events.length) console.log("页面事件:\n" + events.slice(-6).join("\n"));
  }
} finally {
  await app.close({ hard: true });
}
