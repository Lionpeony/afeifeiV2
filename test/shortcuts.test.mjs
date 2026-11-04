import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BINDINGS,
  SHORTCUT_ACTIONS,
  normalizeBindings,
  sameAccelerator,
} from "../dist-test/shortcuts-rule.mjs";
import { createTriggerGate } from "../dist-test/trigger-gate.mjs";
import { createShortcuts } from "../dist-test/shortcuts.mjs";

/**
 * P0-23 判据：全局键补 seek。
 * 三件事必须成立 —— ① 默认键位互不撞车；② 老配置（seek 不存在、切歌占着 Ctrl+Alt+←/→）
 * 升级后 seek 拿到那两个键、切歌自动退到 Shift 组；③ 长按的重复回调只算一次。
 */

test("默认键位：9 条动作齐全，两两不撞车", () => {
  assert.equal(DEFAULT_BINDINGS.length, SHORTCUT_ACTIONS.length);
  assert.deepEqual(
    DEFAULT_BINDINGS.map((b) => b.action).sort(),
    SHORTCUT_ACTIONS.map((a) => a.action).sort(),
  );
  for (let i = 0; i < DEFAULT_BINDINGS.length; i += 1) {
    for (let j = i + 1; j < DEFAULT_BINDINGS.length; j += 1) {
      assert.equal(
        sameAccelerator(DEFAULT_BINDINGS[i].accelerator, DEFAULT_BINDINGS[j].accelerator),
        false,
        `${DEFAULT_BINDINGS[i].action} 与 ${DEFAULT_BINDINGS[j].action} 撞车`,
      );
    }
  }
});

test("老配置升级：seek 赢得 Ctrl+Alt+←/→，切歌自动退到 Shift 组", () => {
  const old = [
    { action: "play-pause", accelerator: "CommandOrControl+Alt+P" },
    { action: "next", accelerator: "CommandOrControl+Alt+Right" },
    { action: "prev", accelerator: "CommandOrControl+Alt+Left" },
    { action: "volume-up", accelerator: "CommandOrControl+Alt+Up" },
    { action: "volume-down", accelerator: "CommandOrControl+Alt+Down" },
    { action: "toggle-lyric", accelerator: "CommandOrControl+Alt+D" },
    { action: "toggle-window", accelerator: "CommandOrControl+Alt+W" },
  ];
  const got = Object.fromEntries(normalizeBindings(old).map((b) => [b.action, b.accelerator]));
  assert.equal(got["seek-forward"], "CommandOrControl+Alt+Right");
  assert.equal(got["seek-back"], "CommandOrControl+Alt+Left");
  assert.equal(got.next, "CommandOrControl+Alt+Shift+Right", "切歌回落默认，不留重复键");
  assert.equal(got.prev, "CommandOrControl+Alt+Shift+Left");
  assert.equal(got["play-pause"], "CommandOrControl+Alt+P", "没动的键原样保留");
});

test("手改撞车：先到先得（按动作优先级），输的一条回落默认", () => {
  const got = normalizeBindings([
    { action: "next", accelerator: "CommandOrControl+Alt+1" },
    { action: "prev", accelerator: "Alt+CommandOrControl+1" }, // 与上一条同键，只是修饰键顺序不同
  ]);
  const map = Object.fromEntries(got.map((b) => [b.action, b.accelerator]));
  assert.equal(map.next, "CommandOrControl+Alt+1");
  assert.equal(map.prev, "CommandOrControl+Alt+Shift+Left", "输了就回默认，不与 next 抢");
});

test("脏数据：认不出的动作、空键、超长键一律丢，缺的补默认", () => {
  const got = normalizeBindings([
    { action: "rm -rf", accelerator: "CommandOrControl+Alt+X" },
    { action: "next", accelerator: "" },
    { action: "prev", accelerator: "CommandOrControl+Alt+" },
    { action: "play-pause", accelerator: "CommandOrControl+Alt+P" },
  ]);
  const map = Object.fromEntries(got.map((b) => [b.action, b.accelerator]));
  assert.equal(Object.keys(map).length, SHORTCUT_ACTIONS.length, "缺的动作都要补上默认");
  assert.equal(map["play-pause"], "CommandOrControl+Alt+P", "合法的保留");
  assert.equal(map.next, "CommandOrControl+Alt+Shift+Right", "非法键回落默认");
});

test("重复放行闸：同一条动作在冷却期内只放行一次，别的动作不受影响", () => {
  const gate = createTriggerGate(250);
  assert.equal(gate("seek-forward", 1000), true);
  assert.equal(gate("seek-forward", 1010), false, "长按的 key repeat 不该再跳一步");
  assert.equal(gate("seek-forward", 1240), false);
  assert.equal(gate("seek-forward", 1251), true, "冷却过了才放行");
  assert.equal(gate("seek-back", 1252), true, "另一条动作有自己的钟");
});

test("接线：重复回调只到 onAction 一次；init 把 9 条绑定推给主进程", async () => {
  let onGlobal = () => {};
  const pushed = [];
  const ctrl = createShortcuts(
    {
      readStore: async () => null,
      writeStore: async () => {},
      setGlobalShortcuts: (b) => pushed.push(b),
      onGlobalShortcut: (cb) => {
        onGlobal = cb;
      },
      onGlobalShortcutStatus: () => {},
    },
    (action) => pushed.push(action),
  );
  await ctrl.init();
  assert.equal(pushed[0].length, SHORTCUT_ACTIONS.length, "init 后要注册全部动作");

  onGlobal("seek-forward");
  onGlobal("seek-forward"); // 长按
  assert.equal(pushed.filter((x) => x === "seek-forward").length, 1);
  onGlobal("seek-back");
  assert.equal(pushed.filter((x) => x === "seek-back").length, 1);
});
