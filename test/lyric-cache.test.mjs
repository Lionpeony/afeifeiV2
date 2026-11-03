import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LYRIC_CACHE_LIMIT,
  getCachedLyric,
  lyricCacheKey,
  parseLyricCache,
  putCachedLyric,
  serializeLyricCache,
  shouldCacheLyric,
} from "../dist-test/lyric-cache.mjs";

/** 一份最小可用的 LyricDoc（只关心缓存层要校验的字段）。 */
function doc(trackId, n = 2, extra = {}) {
  return {
    trackId,
    source: "netease",
    hasWordTiming: false,
    lines: Array.from({ length: n }, (_, i) => ({
      index: i,
      startMs: i * 1000,
      endMs: i * 1000 + 900,
      text: `第 ${i} 行`,
      words: [],
    })),
    segments: [],
    offsetMs: 0,
    quality: "estimated",
    fetchedAt: 1,
    ...extra,
  };
}

test("缓存键：来源不同不互相污染", () => {
  assert.equal(lyricCacheKey("qq", "abc"), "qq:abc");
  assert.notEqual(lyricCacheKey("qq", "abc"), lyricCacheKey("netease", "abc"));
});

test("写入后命中：取回的是同一份 doc", () => {
  const cache = putCachedLyric({}, lyricCacheKey("qq", "abc"), doc("abc"), 100);
  const hit = getCachedLyric(cache, "qq:abc");
  assert.equal(hit?.trackId, "abc");
  assert.equal(hit?.lines.length, 2);
});

test("未命中返回 null（不用 undefined，调用方一脚判掉）", () => {
  assert.equal(getCachedLyric({}, "qq:none"), null);
});

test("写入返回新对象，不改旧表（订阅/回滚都不会被暗改）", () => {
  const before = {};
  const after = putCachedLyric(before, "qq:a", doc("a"), 1);
  assert.notEqual(after, before);
  assert.deepEqual(before, {});
});

test("quality:none / 空行不入缓存（一次判死比重新请求更贵）", () => {
  const empty = doc("x", 0, { quality: "none" });
  assert.equal(shouldCacheLyric(empty), false);
  const noLines = doc("y", 0);
  assert.equal(shouldCacheLyric(noLines), false);
  const cache = putCachedLyric({}, "qq:x", empty, 1);
  assert.deepEqual(cache, {}, "不该写进去");
  assert.equal(shouldCacheLyric(doc("z")), true);
});

test("超过上限：按写入时刻淘汰最旧的，保留最新的", () => {
  let cache = {};
  for (let i = 0; i < 3; i += 1) cache = putCachedLyric(cache, `qq:${i}`, doc(String(i)), i + 1, 2);
  assert.deepEqual(Object.keys(cache).sort(), ["qq:1", "qq:2"]);
});

test("重复写同一首：更新时间，不新增条目", () => {
  let cache = putCachedLyric({}, "qq:a", doc("a"), 1);
  cache = putCachedLyric(cache, "qq:a", doc("a", 3), 50);
  assert.equal(Object.keys(cache).length, 1);
  assert.equal(cache["qq:a"].at, 50);
  assert.equal(cache["qq:a"].doc.lines.length, 3);
});

test("默认上限是 120 条（够覆盖最近听的一批）", () => {
  assert.equal(LYRIC_CACHE_LIMIT, 120);
});

test("parse：JSON 字符串往返，条目活着", () => {
  const cache = putCachedLyric({}, "qq:a", doc("a"), 7);
  const back = parseLyricCache(serializeLyricCache(cache));
  assert.equal(getCachedLyric(back, "qq:a")?.trackId, "a");
  assert.equal(back["qq:a"].at, 7);
});

test("parse：坏 JSON / 非对象 → 空表，不抛", () => {
  assert.deepEqual(parseLyricCache("{oops"), {});
  assert.deepEqual(parseLyricCache(null), {});
  assert.deepEqual(parseLyricCache([1, 2]), {});
  assert.deepEqual(parseLyricCache('"str"'), {});
});

test("parse：坏条目逐条丢，好条目保住（一条烂数据不该清空整份）", () => {
  const raw = {
    "qq:good": { doc: doc("good"), at: 3 },
    "qq:bad-doc": { doc: { trackId: "x" }, at: 4 },
    "qq:bad-at": { doc: doc("y"), at: "later" },
    "qq:null": null,
  };
  const cache = parseLyricCache(raw);
  assert.deepEqual(Object.keys(cache), ["qq:good"]);
});

test("serialize：按写入时刻升序（文件稳定，最近的在末尾）", () => {
  const cache = {
    "qq:b": { doc: doc("b"), at: 2 },
    "qq:a": { doc: doc("a"), at: 1 },
  };
  assert.deepEqual(Object.keys(JSON.parse(serializeLyricCache(cache))), ["qq:a", "qq:b"]);
});
