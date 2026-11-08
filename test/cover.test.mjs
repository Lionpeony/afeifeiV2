import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCover, peekCover } from "../dist-test/cover.mjs";

function fakePort(answers) {
  let calls = 0;
  return {
    calls: () => calls,
    cover: async (path) => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return answers[path] ?? null;
    },
  };
}

test("loadCover：第一次走端口，第二次走缓存", async () => {
  const port = fakePort({ "C:/a.mp3": "data:image/png;base64,AAA" });
  const first = await loadCover(port, "id-a", "C:/a.mp3");
  assert.equal(first, "data:image/png;base64,AAA");
  assert.equal(port.calls(), 1);

  const second = await loadCover(port, "id-a", "C:/a.mp3");
  assert.equal(second, first);
  assert.equal(port.calls(), 1, "第二次不该再请求");
});

test("无封面也要缓存（null 也记住），避免反复解析", async () => {
  const port = fakePort({});
  assert.equal(await loadCover(port, "id-none", "C:/none.mp3"), null);
  assert.equal(await loadCover(port, "id-none", "C:/none.mp3"), null);
  assert.equal(port.calls(), 1, "第二次不该再请求");
  assert.equal(peekCover("id-none"), null, "peek 应能区分「已查过且没有」与「没查过」");
});

test("并发请求同一张图只发一次（快速滚动时会重复挂载）", async () => {
  const port = fakePort({ "C:/b.mp3": "data:image/png;base64,BBB" });
  const [x, y, z] = await Promise.all([
    loadCover(port, "id-b", "C:/b.mp3"),
    loadCover(port, "id-b", "C:/b.mp3"),
    loadCover(port, "id-b", "C:/b.mp3"),
  ]);
  assert.equal(x, y);
  assert.equal(y, z);
  assert.equal(port.calls(), 1, "三次并发只该发一次请求");
});

test("peekCover：没查过返回 undefined", () => {
  assert.equal(peekCover("id-never"), undefined);
});

test("在线直链不进主进程：https:// 封面直接短路返回，不烧读文件的端口", async () => {
  const port = fakePort({});
  const url = "https://p1.music.126.net/abc.jpg";
  assert.equal(await loadCover(port, "id-remote", url), url);
  assert.equal(port.calls(), 0, "https 封面不该走读文件的端口（底栏黑胶占位的根因）");
});
