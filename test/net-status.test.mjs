import { test } from "node:test";
import assert from "node:assert/strict";
import { createNetStatus } from "../dist-test/net-status.mjs";

/**
 * P0-25 判据：「断网 1s 内出横幅、恢复 1s 内消失」。
 * 延迟固定 300ms（+ 一次渲染），所以 `later` 直接由用例手动 flush，
 * 不依赖真时钟 —— 判的是"什么时候改状态"，不是"setTimeout 准不准"。
 */

/** 假环境：事件收集起来由用例手动触发，`later` 记下待确认回调。 */
function fakeEnv(initialOnline = true) {
  let emit = () => {};
  const pending = [];
  return {
    env: {
      online: () => initialOnline,
      listen: (cb) => {
        emit = cb;
        return () => {
          emit = () => {};
        };
      },
      later: (fn) => {
        pending.push(fn);
        return () => {
          const i = pending.indexOf(fn);
          if (i >= 0) pending.splice(i, 1);
        };
      },
    },
    fire: (s) => emit(s),
    flush: () => {
      const fns = pending.splice(0, pending.length);
      for (const fn of fns) fn();
    },
    pending: () => pending.length,
  };
}

test("初始值取 navigator.onLine，订阅时立刻回调一次", () => {
  const { env } = fakeEnv(false);
  const net = createNetStatus(env);
  const seen = [];
  net.subscribe((s) => seen.push(s));
  assert.deepEqual(seen, ["offline"], "UI 不用自己初始化，订阅即拿到当前值");
});

test("断网：等延迟确认后才改状态、只通知一次", () => {
  const f = fakeEnv(true);
  const net = createNetStatus(f.env);
  const seen = [];
  net.subscribe((s) => seen.push(s));
  net.start();

  f.fire("offline");
  assert.equal(net.status(), "online", "确认前不许翻状态（防切 Wi-Fi 闪屏）");
  f.fire("offline"); // 系统可能连报两次
  f.flush();
  assert.equal(net.status(), "offline");
  assert.deepEqual(seen, ["online", "offline"], "同状态连报只通知一次");
});

test("恢复：同样延迟确认，之后状态回 online", () => {
  const f = fakeEnv(false);
  const net = createNetStatus(f.env);
  net.start();
  f.fire("online");
  f.flush();
  assert.equal(net.status(), "online");
});

test("瞬断瞬连：后到的事件作废前一个待确认，不闪横幅", () => {
  const f = fakeEnv(true);
  const net = createNetStatus(f.env);
  net.start();
  f.fire("offline");
  f.fire("online"); // 300ms 内又连上了
  f.flush();
  assert.equal(net.status(), "online", "网络已经回来了，横幅不该出现");
});

test("stop 之后不再改状态", () => {
  const f = fakeEnv(true);
  const net = createNetStatus(f.env);
  const stop = net.start();
  stop();
  f.fire("offline");
  f.flush();
  assert.equal(net.status(), "online");
});
