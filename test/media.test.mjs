import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { commandIdFor } from "../dist-test/input-media.mjs";
import { trayItems, trayTitle } from "../dist-test/main-tray.mjs";

/* ---------- A-24：媒体键 → 命令注册表 ---------- */

test("媒体键命令名映射到命令 id，未知一律 null", () => {
  assert.equal(commandIdFor("toggle"), "play-toggle");
  assert.equal(commandIdFor("next"), "queue-next");
  assert.equal(commandIdFor("prev"), "queue-prev");
  assert.equal(commandIdFor("stop"), null);
  assert.equal(commandIdFor(""), null);
  assert.equal(commandIdFor("toString"), null, "不许被原型链上的键骗过");
});

test("映射目标必须真的在 index.tsx 注册过（防改名断链）", () => {
  // 注册表是运行时单例，测试里另起一份等于自证；直接读装配源码才是真的判据
  const src = fs.readFileSync(new URL("../src/renderer/ui/index.tsx", import.meta.url), "utf8");
  for (const cmd of ["toggle", "next", "prev"]) {
    const id = commandIdFor(cmd);
    assert.ok(new RegExp(`id:\\s*"${id}"`).test(src), `媒体键 ${cmd} 指向的 ${id} 在 index.tsx 里没有任何 registerCommand`);
  }
});

/* ---------- A-25：托盘菜单 ---------- */

test("托盘菜单必备项：播放/暂停 · 上一首 · 下一首 · 退出", () => {
  const ids = trayItems({ playing: true, title: "老人と海" }).map((i) => i.id);
  for (const need of ["toggle", "prev", "next", "quit"]) {
    assert.ok(ids.includes(need), `托盘缺 ${need}`);
  }
});

test("托盘菜单：在播显示暂停，没曲目时播放/切歌置灰但退出可点", () => {
  const playing = trayItems({ playing: true, title: "x" });
  assert.equal(playing.find((i) => i.id === "toggle").label, "暂停");

  const idle = trayItems({ playing: false, title: null });
  assert.equal(idle.find((i) => i.id === "toggle").label, "播放");
  assert.equal(idle.find((i) => i.id === "prev").enabled, false);
  assert.equal(idle.find((i) => i.id === "next").enabled, false);
  assert.equal(idle.find((i) => i.id === "show").enabled, true);
  assert.equal(idle.find((i) => i.id === "quit").enabled, true);
});

test("托盘标题：状态 + 曲名，超长截断（菜单不能被一首歌拉宽）", () => {
  assert.equal(trayTitle({ playing: false, title: null }), "阿飞飞 · 未在播放");
  assert.equal(trayTitle({ playing: true, title: "老人と海" }), "正在播放：老人と海");
  const long = trayTitle({ playing: false, title: "a".repeat(80) });
  assert.ok(long.startsWith("已暂停："));
  assert.ok(long.length <= 34, `截断后仍太长：${long.length}`);
});
