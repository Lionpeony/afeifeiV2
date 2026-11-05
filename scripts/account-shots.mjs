#!/usr/bin/env node
/**
 * 真实账号截图（docs/27 遗留收口）：歌单 / 榜单 / 在线 / 统计。
 *
 * 用应用默认 userData（真实网易云登录态）启动，不造 fixture、不改用户数据；
 * 只导航、搜索、播放几秒、截图。昵称在截图前打码成「已登录」。
 *
 * 跑之前先退出正在运行的 afeifei：单实例锁会让新进程直接退出（表现为 CDP 超时）。
 * 跑法：node scripts/build.mjs && node scripts/account-shots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "./lib/harness.mjs";

const PORT = 9336;
const OUT = path.resolve("docs/assets/mockups");

const app = await launch({ port: PORT, profile: null });
const ev = (code) => app.evaluate(code);

const clickPage = async (page) => {
  const ok = await ev(
    `(() => { const b = document.querySelector('[data-page="${page}"]'); b?.click(); return Boolean(b); })()`,
  );
  if (!ok) throw new Error(`点不到站尺：${page}`);
  await sleep(800);
};

const shoot = async (name) => {
  const buf = await app.screenshot();
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`shot → docs/assets/mockups/${name}`);
};

/** 音源默认可能是 demo（免登录），切到网易云再验登录/取榜单/歌单 */
const pickSource = async (name) => {
  const ok = await ev(
    `(() => {
      const b = [...document.querySelectorAll(".seg button")].find((x) => x.textContent.trim() === ${JSON.stringify(name)});
      b?.click();
      return Boolean(b);
    })()`,
  );
  await sleep(900);
  return ok;
};

try {
  if (!(await app.waitFor(`!!document.querySelector(".ruler")`, 20000))) {
    throw new Error("应用没起来（站尺不在）。若主窗口已开着，先退出 afeifei 再跑。");
  }

  // 昵称打码：截图会被存档，账号名不必进仓库
  const maskNick = () =>
    ev(`(() => {
      const b = document.querySelector(".badge--on");
      if (b) { b.textContent = "已登录"; b.title = "已登录"; }
      return b ? b.textContent : null;
    })()`);

  /* ---- 在线：真实搜索 ---- */
  await clickPage("online");
  await pickSource("网易云音乐");
  await sleep(1200);
  const nick = await maskNick();
  console.log(`登录态：${nick ?? "未登录"}`);
  if (!nick) throw new Error("没有登录态：先在应用里登录网易云，再跑这个脚本");

  await ev(`(() => {
    const input = document.querySelector("input.search");
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "周杰伦");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return true;
  })()`);
  const onlineReady = await app.waitFor(`document.querySelectorAll(".online-row").length > 0`, 25000);
  console.log(`在线结果：${await ev(`document.querySelectorAll(".online-row").length`)} 行`);
  await sleep(800);
  await shoot("real-online.png");
  if (!onlineReady) console.log("  （搜索没返回结果，截图是空态）");

  /* ---- 榜单：真实 toplist + 下钻 ---- */
  await clickPage("charts");
  await pickSource("网易云音乐");
  const chartsReady = await app.waitFor(`document.querySelectorAll(".chart-rail .chart-cell").length > 0`, 25000);
  await sleep(600);
  await shoot("real-charts.png");
  if (chartsReady) {
    await ev(`(() => { document.querySelector(".chart-rail .chart-cell")?.click(); return true; })()`);
    const rows = await app.waitFor(`document.querySelectorAll(".lib-row").length > 0`, 25000);
    await sleep(600);
    await shoot("real-chart-detail.png");
    console.log(`榜单下钻：${rows ? "有曲目" : "无曲目"}`);
  } else {
    console.log("  榜单没返回（上游慢或未登录），截图是空态");
  }

  /* ---- 歌单：账号歌单 + 收藏墙 ---- */
  await clickPage("playlists");
  await pickSource("网易云音乐");
  await sleep(2500);
  await maskNick();
  // 收藏墙证据：临时收藏第一个账号歌单 → 截图 → 立即取消（本机状态恢复原样）
  const kept = await ev(
    `(() => { const b = document.querySelector(".pl-list .pl-save"); b?.click(); return Boolean(b); })()`,
  );
  if (kept && (await app.waitFor(`document.querySelectorAll(".pl-shelf .pl-card").length > 0`, 6000))) {
    await sleep(600);
    await shoot("real-playlists.png");
    await ev(`(() => { document.querySelector(".pl-card-x")?.click(); return true; })()`);
    await sleep(800);
    console.log("歌单：已临时收藏一张拍封面墙，随后取消（状态恢复）");
  } else {
    await shoot("real-playlists.png");
  }
  console.log(
    `歌单：账号 ${await ev(`document.querySelectorAll(".pl-list .pl-item").length`)} 个 · 收藏 ${await ev(`document.querySelectorAll(".pl-shelf .pl-card").length`)} 个`,
  );

  /* ---- 统计：先真播几秒，让会话账本有记录 ---- */
  await clickPage("local");
  await app.waitFor(`!!document.querySelector(".shelf-wall, .lib-empty")`, 10000);
  await ev(`(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "曲目");
    b?.click();
    return Boolean(b);
  })()`);
  await sleep(600);
  const hasRows = await app.waitFor(`document.querySelectorAll(".lib-row").length > 0`, 5000);
  if (hasRows) {
    await ev(`(() => { document.querySelector(".lib-row")?.click(); return true; })()`);
    await sleep(5000);
  }
  await clickPage("stats");
  await sleep(800);
  await shoot("real-stats.png");
  console.log(`统计：${hasRows ? "已真播 5 秒" : "曲库为空，未生成新会话"}`);
} finally {
  await app.close();
}
