import { test } from "node:test";
import assert from "node:assert/strict";
import { getLikes, isLiked, loadLikes, saveLikes, setLikes, subscribe, toggleLike } from "../dist-test/likes.mjs";

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

test("toggleLike：第一次加入收藏", () => {
  setLikes([]);
  assert.equal(toggleLike("a"), true);
  assert.equal(isLiked("a"), true);
});

test("红心 id 归一：原始路径与小写正斜杠视为同一首", () => {
  setLikes([]);
  toggleLike("C:\\Music\\A.mp3");
  assert.equal(isLiked("c:/music/a.mp3"), true, "原始路径点的心，用曲库 id 也要能查到");
  assert.equal(toggleLike("c:/music/a.mp3"), false, "归一后是同一次切换");
  assert.equal(getLikes().size, 0);
});

test("toggleLike：第二次取消收藏", () => {
  setLikes([]);
  toggleLike("a");
  assert.equal(toggleLike("a"), false);
  assert.equal(isLiked("a"), false);
});

test("toggleLike：重复加同一个不会产生两条", () => {
  setLikes([]);
  toggleLike("a");
  toggleLike("a"); // 取消
  toggleLike("a"); // 再加
  assert.equal(getLikes().size, 1);
});

test("setLikes：整批替换", () => {
  setLikes(["a", "b"]);
  assert.deepEqual([...getLikes()].sort(), ["a", "b"]);
});

test("subscribe：切换时收到通知", () => {
  setLikes([]);
  let calls = 0;
  const off = subscribe(() => {
    calls += 1;
  });
  toggleLike("a");
  assert.equal(calls, 1);
  off();
  toggleLike("b");
  assert.equal(calls, 1, "退订后不该再收到");
});

test("save / load 往返一致", async () => {
  setLikes(["x", "y"]);
  const port = memoryPort();
  await saveLikes(port);
  assert.deepEqual(JSON.parse(port.written[0]).sort(), ["x", "y"]);

  const restored = memoryPort(JSON.stringify(["x", "y"]));
  const count = await loadLikes(restored);
  assert.equal(count, 2);
  assert.equal(isLiked("x"), true);
});

test("load：坏文件当没收藏过，不抛错", async () => {
  setLikes([]);
  const count = await loadLikes(memoryPort("{ 半截"));
  assert.equal(count, 0);
});

test("load：非字符串元素被过滤", async () => {
  const count = await loadLikes(memoryPort(JSON.stringify(["a", 1, null, "b"])));
  assert.equal(count, 2);
});
