import assert from "node:assert/strict";
import { test } from "node:test";

import { bumpSalt, getSalt, loadSalt } from "../dist-test/recommend-salt.mjs";

/** 内存 KV：只实现 salt 用到的两个方法。 */
function memPort() {
  const map = new Map();
  return {
    read: async (k) => map.get(k) ?? null,
    write: async (k, v) => {
      map.set(k, v);
    },
  };
}

test("salt：换一批 +1 并落盘，重启（重新 load）后接着换", async () => {
  const port = memPort();
  assert.equal(await loadSalt(port), 0);
  assert.equal(bumpSalt(), 1);
  assert.equal(bumpSalt(), 2);
  // 落盘是异步的，等一下再当"重启"
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await loadSalt(port), 2, "重启后 salt 还在：换出来的批次不能丢");
  assert.equal(getSalt(), 2);
});

test("salt：跨天作废（昨天的 d 不是今天，读进来当 0）", async () => {
  const port = memPort();
  const today = new Date();
  await port.write(
    "daily-salt",
    JSON.stringify({ d: `2020-1-1`, n: 9 }),
  );
  assert.equal(await loadSalt(port), 0, "昨天的 salt 不该今天继续用：底种子变了，旧偏移没有意义");
  void today;
});

test("salt：坏档当没换过，不炸", async () => {
  const port = memPort();
  await port.write("daily-salt", "{oops");
  await assert.doesNotReject(() => loadSalt(port));
  assert.equal(getSalt(), 0);
});

test("salt：负数/小数不收（只认正整数）", async () => {
  const port = memPort();
  await port.write("daily-salt", JSON.stringify({ d: dayOfToday(), n: -3 }));
  assert.equal(await loadSalt(port), 0);
  await port.write("daily-salt", JSON.stringify({ d: dayOfToday(), n: 1.5 }));
  assert.equal(await loadSalt(port), 0);
});

function dayOfToday() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
