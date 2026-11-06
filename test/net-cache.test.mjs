import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __resetNetCache,
  attachNetPersistence,
  getNet,
  hydrateNet,
  loadNet,
} from "../dist-test/net-cache.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("hydrate：坏 JSON 与坏条目都跳过，好条目照装", () => {
  __resetNetCache();
  hydrateNet("这不是 JSON");
  assert.equal(getNet("a"), undefined);

  hydrateNet(
    JSON.stringify({
      a: { at: Date.now(), value: [1] },
      b: { value: [2] }, // 没有时间戳
      c: null,
      d: { at: Date.now() }, // 没有值
    }),
  );
  assert.deepEqual(getNet("a"), [1]);
  assert.equal(getNet("b"), undefined);
  assert.equal(getNet("d"), undefined);
});

test("hydrate：超过 12 小时的快照丢掉，免得显示三天前的榜单名", () => {
  __resetNetCache();
  const now = Date.now();
  hydrateNet(
    JSON.stringify({
      old: { at: now - 13 * 60 * 60 * 1000, value: [1] },
      fresh: { at: now - 60 * 1000, value: [2] },
    }),
  );
  assert.equal(getNet("old"), undefined);
  assert.deepEqual(getNet("fresh"), [2]);
});

test("hydrate 之后 loadNet 直接命中，不再打一次上游", async () => {
  __resetNetCache();
  hydrateNet(JSON.stringify({ "charts:toplists:x": { at: Date.now(), value: { n: 1 } } }));
  let calls = 0;
  const got = await loadNet("charts:toplists:x", async () => {
    calls += 1;
    return { n: 2 };
  });
  assert.equal(calls, 0);
  assert.deepEqual(got, { n: 1 });
});

test("落盘只写白名单前缀，且合并成一次写", async () => {
  __resetNetCache();
  const writes = [];
  attachNetPersistence({
    match: (key) => key.startsWith("charts:toplists:"),
    save: (data) => writes.push(data),
  });

  await loadNet("charts:toplists:x", async () => [1]);
  await loadNet("account:x:daily", async () => [2]); // 不在白名单，不落盘
  await sleep(1000); // debounce 800ms

  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]), ["charts:toplists:x"]);
  assert.deepEqual(writes[0]["charts:toplists:x"].value, [1]);
});
