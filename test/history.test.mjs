import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearHistory,
  getHistory,
  historyIds,
  loadHistory,
  pushHistory,
  saveHistory,
  setHistory,
} from "../dist-test/history.mjs";

function memoryPort(initial = null) {
  const written = [];
  return {
    written,
    read: async () => initial,
    write: async (_key, json) => {
      written.push(json);
    },
  };
}

test("pushHistory：新的排在前面", () => {
  setHistory([]);
  pushHistory("a", 1);
  pushHistory("b", 2);
  assert.deepEqual(historyIds(), ["b", "a"]);
});

test("pushHistory：连续同一首不重复记（单曲循环不该写出几万条）", () => {
  setHistory([]);
  assert.equal(pushHistory("a", 1), true);
  assert.equal(pushHistory("a", 2), false);
  assert.equal(getHistory().length, 1);
});

test("pushHistory：老歌再播会提到最前，不产生重复条目", () => {
  setHistory([]);
  pushHistory("a", 1);
  pushHistory("b", 2);
  pushHistory("a", 3);
  assert.deepEqual(historyIds(), ["a", "b"]);
  assert.equal(getHistory().length, 2);
});

test("pushHistory：超过 300 条丢最旧的", () => {
  setHistory([]);
  for (let i = 0; i < 320; i += 1) pushHistory(`t${i}`, i);
  assert.equal(getHistory().length, 300);
  assert.equal(getHistory()[0].trackId, "t319");
  assert.equal(getHistory()[299].trackId, "t20");
});

test("clearHistory：清空", () => {
  setHistory([{ trackId: "a", at: 1 }]);
  clearHistory();
  assert.equal(getHistory().length, 0);
});

test("save / load 往返一致", async () => {
  setHistory([
    { trackId: "b", at: 2 },
    { trackId: "a", at: 1 },
  ]);
  const port = memoryPort();
  await saveHistory(port);

  const restored = memoryPort(port.written[0]);
  const count = await loadHistory(restored);
  assert.equal(count, 2);
  assert.deepEqual(historyIds(), ["b", "a"]);
});

test("load：坏文件当没有历史", async () => {
  setHistory([]);
  assert.equal(await loadHistory(memoryPort("{ 半截")), 0);
});

test("load：缺 trackId 的条目被过滤", async () => {
  const count = await loadHistory(memoryPort(JSON.stringify([{ trackId: "a", at: 1 }, { at: 2 }, null])));
  assert.equal(count, 1);
});
