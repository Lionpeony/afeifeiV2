#!/usr/bin/env node
/**
 * QQ 真实登录态验证（docs/28 §5.2）。
 *
 * 只读：启动真实档案、切到 QQ、读 DOM 与本地 3210 服务的响应。
 * 不登出、不改收藏、不截图；token 只显示前 4 位与长度，不进日志。
 *
 * 跑之前先退出正在运行的 afeifei（单实例锁）。
 * 跑法：node scripts/build.mjs && node scripts/qq-verify.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "./lib/harness.mjs";

const PORT = 9337;
const API = "http://127.0.0.1:3210";
const DATA = path.join(process.env.APPDATA ?? "", "Afeifei 阿飞飞");
const TOKEN_FILE = path.join(DATA, "qq-session-token.json");
const SESSION_FILE = path.join(DATA, "qq-auth-sessions.json");

/** KV 写的是裸 token（不是 JSON 字符串）；兼容被 JSON 引号包住的旧文件。 */
const readToken = () => {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (raw.startsWith('"')) {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : "";
    }
    return raw;
  } catch {
    return "";
  }
};

const mask = (t) => (t ? `${t.slice(0, 4)}…（${t.length} 位）` : "（无 token）");

const api = async (route, token) => {
  const url = new URL(API + route);
  if (token) url.searchParams.set("cookie", `qqmusic_session=${token}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
};

const songsOf = (json) => {
  const list = json?.songs ?? json?.data?.songs;
  return Array.isArray(list) ? list : null;
};

const profileOf = (json) => {
  const data = json?.data ?? json ?? {};
  const profile = data.profile && typeof data.profile === "object" ? data.profile : null;
  return {
    loggedIn: Boolean(profile && Object.keys(profile).length > 0),
    nick: typeof profile?.info?.nick === "string" ? profile.info.nick : "",
  };
};

const reportSessionFile = (tag) => {
  if (!fs.existsSync(SESSION_FILE)) {
    console.log(`  [${tag}] 会话仓库文件：不存在（登录态只在进程内存里）`);
    return;
  }
  const st = fs.statSync(SESSION_FILE);
  console.log(`  [${tag}] 会话仓库文件：存在，${st.size} 字节，写入 ${st.mtime.toISOString()}`);
};

const probeHttp = async (tag) => {
  const token = readToken();
  console.log(`\n[${tag}] token：${mask(token)}`);

  const status = await api("/login/status", token);
  const prof = profileOf(status.json);
  console.log(
    `  登录态：HTTP ${status.status} · code=${status.json?.code ?? "?"} · loggedIn=${prof.loggedIn} · nick=${prof.nick ? "已隐去" : "空"}`,
  );

  if (!prof.loggedIn) {
    reportSessionFile(tag);
    return { loggedIn: false };
  }

  const daily = await api("/user/daily-songs", token);
  const dailySongs = songsOf(daily.json);
  console.log(`  每日推荐：HTTP ${daily.status} · ${dailySongs ? `${dailySongs.length} 首` : `无 songs 字段，code=${daily.json?.code}`}`);

  const liked = await api("/user/liked-songs?offset=0&limit=100", token);
  const likedSongs = songsOf(liked.json);
  console.log(
    `  红心：HTTP ${liked.status} · ${likedSongs ? `${likedSongs.length} 首（total=${liked.json?.total ?? "?"}）` : `无 songs 字段，code=${liked.json?.code}`}`,
  );

  const guess = await api("/user/guess-you-like", token);
  const guessSongs = songsOf(guess.json);
  console.log(`  猜你喜欢：HTTP ${guess.status} · ${guessSongs ? `${guessSongs.length} 首` : `无 songs 字段，code=${guess.json?.code}`}`);

  reportSessionFile(tag);
  return { loggedIn: true, daily: dailySongs?.length ?? -1, liked: likedSongs?.length ?? -1, guess: guessSongs?.length ?? -1 };
};

const waitHome = async (app) => {
  await app.waitFor(
    `document.querySelectorAll(".daily-card").length > 0 || !!document.querySelector(".daily-gate, .daily-state")`,
    30000,
  );
  const cards = await app.evaluate(`document.querySelectorAll(".daily-card").length`);
  const gate = await app.evaluate(`document.querySelector(".daily-gate p, .daily-state")?.textContent ?? ""`);
  const titles = await app.evaluate(
    `[...document.querySelectorAll(".daily-title")].slice(0, 3).map((x) => x.textContent)`,
  );
  return { cards, gate, titles };
};

const pickQq = async (app) => {
  await app.evaluate(`document.querySelector('[data-page="online"]')?.click()`);
  await sleep(600);
  return app.evaluate(`(() => {
    const b = [...document.querySelectorAll(".seg button")].find((x) => x.textContent.trim() === "QQ 音乐");
    b?.click();
    return Boolean(b);
  })()`);
};

const rulerState = async (app) =>
  app.evaluate(`(() => {
    const b = document.querySelector(".ruler-acct");
    if (!b) return null;
    return { on: b.classList.contains("on"), text: b.querySelector("b")?.textContent ?? "" };
  })()`);

async function main() {
  console.log("== 第一次启动：验证接口与 UI ==");
  let app = await launch({ port: PORT, profile: null });
  try {
    if (!(await app.waitFor(`!!document.querySelector(".ruler")`, 20000))) {
      throw new Error("应用没起来（站尺不在）。若主窗口已开着，先退出 afeifei 再跑。");
    }

    const picked = await pickQq(app);
    console.log(`\n切到 QQ：${picked ? "已点" : "找不到源按钮"}`);
    await sleep(1500);
    const ruler = await rulerState(app);
    console.log(`站尺账号区：${ruler ? `登录标记=${ruler.on} · 文案=${ruler.text === "未登录" ? "未登录" : "已登录（昵称已隐去）"}` : "不在"}`);

    await app.evaluate(`document.querySelector('[data-page="home"]')?.click()`);
    const home = await waitHome(app);
    console.log(`首页：${home.cards} 张每日推荐卡${home.gate ? ` · 提示「${home.gate}」` : ""}`);
    if (home.titles.length) console.log(`  前三首：${home.titles.join(" / ")}`);

    await app.evaluate(`document.querySelector('[data-page="liked"]')?.click()`);
    await sleep(2500);
    const likedRows = await app.evaluate(`document.querySelectorAll(".lib-row").length`);
    const likedHint = await app.evaluate(`document.querySelector(".lib-empty, .room-hint, .page-hint")?.textContent ?? ""`);
    console.log(`喜欢页：${likedRows} 行${likedHint ? ` · 提示「${likedHint.trim()}」` : ""}`);

    const first = await probeHttp("本次会话");
    const readyLines = [...app.log().matchAll(/qq-auth\.auth-session\.ready[^\n]*/g)].map((m) => m[0]);
    console.log(`  会话仓库初始化日志：${readyLines.length ? readyLines.join(" ｜ ") : "未见 ready 日志"}`);
    console.log(`  （接口结论：loggedIn=${first.loggedIn}）`);
  } finally {
    await app.close();
  }

  console.log("\n== 连续重启：检查登录态是否还活着 ==");
  if (process.argv.includes("--once")) {
    console.log("  （--once：跳过重启）");
    return;
  }
  for (let i = 1; i <= 3; i += 1) {
    await sleep(1200);
    app = await launch({ port: PORT, profile: null });
    try {
      await app.waitFor(`!!document.querySelector(".ruler")`, 20000);
      await sleep(2500);
      await probeHttp(`第 ${i} 次重启`);
    } finally {
      await app.close();
    }
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
