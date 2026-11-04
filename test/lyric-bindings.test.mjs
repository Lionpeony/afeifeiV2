import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLyricBinding,
  lyricBindKey,
  parseLyricBindings,
  putLyricBinding,
  serializeLyricBindings,
} from "../dist-test/lyric-bindings.mjs";

/**
 * P0-19 判据：「绑定持久化」这半边的机制。
 * 这版存**原文**而不是 LRCLIB id，所以要钉的是：坏数据逐条丢、超限淘汰最旧、
 * 线上/本地两条通路的 key 不互相串。
 */

test("key：线上用 sourceId:songId，本地用曲目 id，两条通路不串", () => {
  assert.equal(lyricBindKey({ sourceId: "netease", songId: "42" }, "c:/a.mp3"), "online:netease:42");
  assert.equal(lyricBindKey(null, "c:/a.mp3"), "local:c:/a.mp3");
  assert.equal(lyricBindKey(null, null), null);
});

test("KV 读回：坏 json / 坏条目逐条丢，不整份作废", () => {
  assert.deepEqual(parseLyricBindings(null), {});
  assert.deepEqual(parseLyricBindings("{坏 json"), {});
  assert.deepEqual(parseLyricBindings("[]"), {});
  const got = parseLyricBindings(
    JSON.stringify({
      ok: { text: "[00:01.00]词", at: 1 },
      empty: { text: "   ", at: 2 },
      noAt: { text: "词" },
      nan: { text: "词", at: "x" },
    }),
  );
  assert.deepEqual(Object.keys(got), ["ok"], "空文本、缺 at、at 非数都要丢");
});

test("写入：超限按 at 淘汰最旧的，用户刚挑的必须留下", () => {
  let b = {};
  b = putLyricBinding(b, "a", "词 a", 1, 3);
  b = putLyricBinding(b, "b", "词 b", 2, 3);
  b = putLyricBinding(b, "c", "词 c", 3, 3);
  b = putLyricBinding(b, "d", "词 d", 4, 3);
  assert.deepEqual(Object.keys(b).sort(), ["b", "c", "d"]);
  assert.equal(getLyricBinding(b, "a"), null);
  assert.equal(getLyricBinding(b, "d"), "词 d");
});

test("空文本不写（挑了「纯音乐」那一版等于没挑）", () => {
  const b = putLyricBinding({}, "a", "   ", 1);
  assert.deepEqual(b, {});
});

test("落盘顺序稳定：按 at 升序，同样的表两次序列化结果一致", () => {
  let b = {};
  b = putLyricBinding(b, "x", "词 x", 30);
  b = putLyricBinding(b, "y", "词 y", 10);
  const s = serializeLyricBindings(b);
  assert.deepEqual(Object.keys(JSON.parse(s)), ["y", "x"]);
  assert.equal(s, serializeLyricBindings(b));
});
