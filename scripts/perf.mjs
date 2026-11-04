#!/usr/bin/env node
/**
 * 性能预算（51 §5 第 3 条 / 50 §14）。只测能自动测的那几条：
 *   1. 二次启动到可搜索（恢复 5000 首索引）—— 目标 < 120ms
 *   2. 5000 行滚动帧间隔 p95 —— 目标 < 20ms（18 是合格线，20 是动作线）
 *   3. 搜索响应（5000 条里打字）—— 目标 < 100ms
 *
 * 5000 条是假数据，但走的是**正式链路**：写进 library.json，重启由快照恢复。
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import assert from "node:assert/strict";
import { cleanupProfile, launch, sleep } from "./lib/harness.mjs";

const PORT = 9334;
const PROFILE = path.join(os.tmpdir(), `afeifei-perf-${process.pid}`);
const COUNT = 5000;
const BASELINE_FILE = "perf-baseline.json";
/** 劣化超过基线 20% 即红（docs/04 M8 第 4 项；I5 的"预算进 CI"补完）。 */
const REGRESSION = 1.2;

/**
 * 噪声下限（2026-11-04 加）：光看 20% 不够。
 * 实测同一版本重跑 7 轮，restore 在 22–52ms 之间摆（中位 31.7 / 42.7 两组成绩），
 * 20% 在 20–50ms 的指标上只等于 4–10ms，比机器抖动还小——门禁测不出劣化，只会随机红。
 * 所以再加一条：**绝对差也要超过 15ms** 才算劣化。
 * ponytail: 15ms 是这台机器上量出来的抖动幅度，换机器/换盘要重测，别直接搬。
 */
const NOISE_MS = 15;

const BUDGET = {
  // 原 120ms。实测 5000 首恢复在 30–50ms，120 留了 3 倍余量，等于没有护栏——
  // 劣化到 100ms 它照样绿。收到 80ms：约 2 倍实测 + 噪声余量，真出现数量级劣化必红。
  restoreMs: 80,
  frameP95Ms: 20,
  searchMs: 100,
};

function fakeSnapshot(count) {
  const tracks = [];
  for (let i = 0; i < count; i += 1) {
    tracks.push({
      id: `c:/fake/${i}.mp3`,
      path: `C:/fake/${i}.mp3`,
      title: `测试歌曲${i}号`,
      artist: "周杰伦",
      album: "叶惠美",
      durationMs: 180000 + i,
      size: 5000 + i,
      mtimeMs: 1000 + i,
      hasCover: false,
    });
  }
  return JSON.stringify({ v: 1, tracks, savedAt: Date.now() });
}

let current = null;

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** 单次完整测量（seed → 重启 → 恢复/滚动/搜索）。返回三个指标，预算断言在内。 */
async function once() {
  /* ---- 准备：把 5000 条写进快照 ---- */
  const seed = await launch({ port: PORT, profile: PROFILE });
  current = seed;
  await seed.waitFor(`document.querySelector("h1")?.textContent === "afeifei"`);

  const payload = fakeSnapshot(COUNT);
  await seed.evaluate(`window.api.saveIndex(${JSON.stringify(payload)})`);
  await seed.close({ hard: true });
  current = null;
  await sleep(1200);

  /* ---- 测量：重启后恢复 + 滚动 + 搜索 ---- */
  const app = await launch({ port: PORT, profile: PROFILE });
  current = app;

  const ready = await app.waitFor(`(document.querySelector(".stat")?.textContent ?? "").includes("${COUNT}")`, 15000);
  if (!ready) {
    const count = await app.evaluate(`document.querySelector(".stat")?.textContent ?? "(无)"`);
    const indexLen = await app.evaluate(`window.api.loadIndex().then((s) => (s ? s.length : -1))`);
    const rows = await app.evaluate(`document.querySelectorAll(".lib-row").length`);
    throw new Error(`重启后曲库没恢复。界面计数=${count} 索引字节=${indexLen} 渲染行=${rows}`);
  }

  const restoreMs = await app.evaluate(
    `performance.getEntriesByName("afeifei:restore").pop()?.duration ?? -1`,
  );
  assert.ok(restoreMs > 0, "没拿到恢复打点");
  console.log(`  二次启动恢复 ${COUNT} 首：${restoreMs.toFixed(1)}ms（预算 ${BUDGET.restoreMs}ms）`);

  // 先滚到底再回来，确保虚拟列表真的在工作
  const frame = await app.evaluate(`(async () => {
    const el = document.querySelector(".lib-list");
    if (!el) return { error: "找不到列表" };
    const gaps = [];
    let last = performance.now();
    for (let i = 0; i < 90; i++) {
      el.scrollTop = (i * 137) % Math.max(1, el.scrollHeight - el.clientHeight);
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }
    gaps.sort((a, b) => a - b);
    return { p95: gaps[Math.floor(gaps.length * 0.95)], max: gaps[gaps.length - 1] };
  })()`);

  assert.ok(!frame.error, frame.error);
  console.log(`  滚动帧间隔 p95 ${frame.p95.toFixed(1)}ms / max ${frame.max.toFixed(1)}ms（预算 p95 < ${BUDGET.frameP95Ms}ms）`);

  const rendered = await app.evaluate(`document.querySelectorAll(".lib-row").length`);
  assert.ok(rendered > 0 && rendered < 100, `虚拟列表只该渲染几十行，实际 ${rendered}`);

  const searchMs = await app.evaluate(`(async () => {
    const input = document.querySelector(".search");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    const t0 = performance.now();
    setter.call(input, "zjl");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    return performance.now() - t0;
  })()`);
  console.log(`  搜索响应 ${searchMs.toFixed(1)}ms（预算 ${BUDGET.searchMs}ms）`);

  const hits = await app.evaluate(`document.querySelectorAll(".lib-row").length`);
  assert.ok(hits > 0, "按歌手首字母 zjl 应该搜到歌");

  /* ---- 真扫描：验证 scan + readTags 的 IPC 链路与解析吞吐 ---- */
  const mediaDir = "C:\\Windows\\Media";
  let realScan = null;
  try {
    realScan = await app.evaluate(`(async () => {
      const t0 = performance.now();
      const files = await window.api.scan(${JSON.stringify([mediaDir])});
      const t1 = performance.now();
      const metas = await window.api.readTags(files.slice(0, 400));
      const t2 = performance.now();
      return { files: files.length, parsed: metas.length, listMs: t1 - t0, tagsMs: t2 - t1 };
    })()`);
  } catch {
    realScan = null;
  }

  if (realScan && realScan.files > 0) {
    const perFile = realScan.tagsMs / Math.max(1, realScan.parsed);
    const extrapolated = (perFile * COUNT) / 1000;
    console.log(
      `  真扫描 ${mediaDir}：${realScan.files} 个音频，列目录 ${realScan.listMs.toFixed(0)}ms，` +
        `解析 ${realScan.parsed} 个 ${realScan.tagsMs.toFixed(0)}ms`,
    );
    console.log(
      `  （外推 ${COUNT} 首解析约 ${extrapolated.toFixed(1)}s，预算 30s —— 外推值仅供参考，首次扫描是后台跑）`,
    );
    assert.ok(realScan.parsed > 0, "真扫描一个标签都没解析出来");
  } else {
    console.log(`  SKIP 真扫描：${mediaDir} 不可用`);
  }

  /* ---- 预算判定 ---- */
  const failures = [];
  if (restoreMs > BUDGET.restoreMs) failures.push(`二次启动 ${restoreMs.toFixed(1)}ms > ${BUDGET.restoreMs}ms`);
  if (frame.p95 > BUDGET.frameP95Ms) failures.push(`滚动 p95 ${frame.p95.toFixed(1)}ms > ${BUDGET.frameP95Ms}ms`);
  if (searchMs > BUDGET.searchMs) failures.push(`搜索 ${searchMs.toFixed(1)}ms > ${BUDGET.searchMs}ms`);

  if (failures.length) {
    throw new Error(`性能预算超标：\n  · ${failures.join("\n  · ")}`);
  }

  await app.close();
  current = null;
  console.log("PERF PASS：3 条预算全部达标");
  return { restoreMs, frameP95Ms: frame.p95, searchMs };
}

/** 基线对比：当前值劣化超过基线 20% 即失败。无基线文件时跳过（首次先 --baseline 存档）。 */
function compareBaseline(m) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.log("  （无 perf-baseline.json，跳过基线对比。先跑 node scripts/perf.mjs --baseline 存档）");
    return;
  }
  let base;
  try {
    base = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  } catch {
    console.log("  （基线文件读不出，跳过对比）");
    return;
  }
  const checks = [
    ["二次启动恢复", m.restoreMs, base.restoreMs],
    ["滚动帧 p95", m.frameP95Ms, base.frameP95Ms],
    ["搜索响应", m.searchMs, base.searchMs],
  ];
  // 两条都要满足才算劣化：比例超 20% **且** 绝对差超噪声下限
  const bad = checks.filter(
    ([, now, base0]) => base0 > 0 && now > base0 * REGRESSION && now - base0 > NOISE_MS,
  );
  if (bad.length) {
    throw new Error(
      `性能较基线劣化（>${Math.round((REGRESSION - 1) * 100)}% 且 >${NOISE_MS}ms）：\n  · ` +
        bad.map(([n, now, b]) => `${n} ${now.toFixed(1)}ms > 基线 ${Number(b).toFixed(1)}ms`).join("\n  · "),
    );
  }
  console.log(
    `  基线对比 OK（<20% 或差值 <${NOISE_MS}ms）：恢复 ${m.restoreMs.toFixed(1)}/${Number(base.restoreMs).toFixed(1)} · ` +
      `p95 ${m.frameP95Ms.toFixed(1)}/${Number(base.frameP95Ms).toFixed(1)} · ` +
      `搜索 ${m.searchMs.toFixed(1)}/${Number(base.searchMs).toFixed(1)}`,
  );
}

async function main() {
  // --baseline：跑三次取中位存档（机器波动取中位，docs/04 M8 走偏表）。每轮之间清 profile。
  if (process.argv.includes("--baseline")) {
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      cleanupProfile(PROFILE);
      console.log(`\n—— 基线采样 ${i + 1}/3`);
      runs.push(await once());
    }
    cleanupProfile(PROFILE);
    const base = {
      savedAt: new Date().toISOString(),
      restoreMs: median(runs.map((r) => r.restoreMs)),
      frameP95Ms: median(runs.map((r) => r.frameP95Ms)),
      searchMs: median(runs.map((r) => r.searchMs)),
    };
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(base, null, 2));
    console.log(
      `\n基线已写入 ${BASELINE_FILE}（三次取中位）：` +
        `恢复 ${base.restoreMs.toFixed(1)}ms · p95 ${base.frameP95Ms.toFixed(1)}ms · 搜索 ${base.searchMs.toFixed(1)}ms`,
    );
    return;
  }

  const m = await once();
  cleanupProfile(PROFILE);
  try {
    compareBaseline(m);
  } catch (err) {
    // 单轮对比会吃到机器波动（verify 连跑后 CPU 热，实测 21.7→36.9ms 假红）：
    // 劣化时重测两轮取中位再判——仍然红才是真劣化。
    console.log(`  疑似波动，重测两轮取中位…（首轮判红：${err.message.split("\n")[0]}）`);
    const runs = [m];
    for (let i = 0; i < 2; i += 1) {
      runs.push(await once());
      cleanupProfile(PROFILE);
    }
    compareBaseline({
      restoreMs: median(runs.map((r) => r.restoreMs)),
      frameP95Ms: median(runs.map((r) => r.frameP95Ms)),
      searchMs: median(runs.map((r) => r.searchMs)),
    });
  }
}

try {
  await main();
  process.exit(0);
} catch (err) {
  console.error(`✗ PERF 失败：${err.message}`);
  if (current?.events().length) console.error(`--- 页面事件：\n${current.events().join("\n")}`);
  try {
    await current?.close({ hard: true });
  } catch {
    /* ignore */
  }
  cleanupProfile(PROFILE);
  process.exit(1);
}
