import { test } from "node:test";
import assert from "node:assert/strict";
import { bindingToDoc, lrcOffsetOf, resolveLocalLyric } from "../dist-test/local-lyric.mjs";

/**
 * P0-20 判据：同名 `.lrc` → 内嵌标签 → LRCLIB → 纯音乐。
 * 四级**顺序**才是本体：只要有本地词就绝不打网络（离线用户不该等一次超时）。
 */

const TRACK = { id: "c:/music/a.mp3", path: "C:\\Music\\A.mp3", title: "A", artist: "张三", durationMs: 200_000 };

const LRC = "[ti:A]\n[offset:+500]\n[00:01.00]第一句\n[00:03.50]第二句\n";

/** 记录调用次数的假网络层：返回 LRCLIB 的 search 结果形状。 */
function fakeHttp(hits) {
  const calls = [];
  return {
    calls,
    http: {
      fetchJson: async (url) => {
        calls.push(url);
        return { status: 200, json: hits, setCookie: [] };
      },
    },
  };
}

test("lrcOffsetOf：[offset:] 方向与我们相反（LRC +500 = 词提前）", () => {
  assert.equal(lrcOffsetOf("[offset:+500]"), -500);
  assert.equal(lrcOffsetOf("[offset:-300]"), 300);
  assert.equal(lrcOffsetOf("[offset:abc]"), 0, "坏值当没有，不产生 NaN");
  assert.equal(lrcOffsetOf("[00:01.00]没有偏移标签"), 0);
});

test("同名 .lrc 优先：出词、来源 local、[offset:] 进 doc.offsetMs", async () => {
  const { http, calls } = fakeHttp([]);
  const doc = await resolveLocalLyric(TRACK.path, TRACK, {
    read: async () => ({ text: LRC, source: "local" }),
    http,
  });
  assert.equal(doc.source, "local");
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[1].startMs, 3500);
  assert.equal(doc.offsetMs, -500, "词自带偏移要带进 doc，否则 P0-18 会把它吃掉");
  assert.equal(calls.length, 0, "有本地词就不该打网络");
});

test("没有同名 .lrc 时用内嵌标签，来源 embedded", async () => {
  const doc = await resolveLocalLyric(TRACK.path, TRACK, {
    read: async () => ({ text: "[00:02.00]内嵌的句子", source: "embedded" }),
    http: fakeHttp([]).http,
  });
  assert.equal(doc.source, "embedded");
  assert.equal(doc.lines[0].startMs, 2000);
});

test("本地两路都没有 → LRCLIB 兜底，带歌名歌手时长去搜", async () => {
  const { http, calls } = fakeHttp([
    { id: 1, trackName: "A", artistName: "张三", duration: 199, instrumental: false, plainLyrics: null, syncedLyrics: "[00:04.00]网上找的" },
  ]);
  const doc = await resolveLocalLyric(TRACK.path, TRACK, { read: async () => null, http });
  assert.equal(doc.source, "lrclib");
  assert.equal(doc.lines[0].startMs, 4000);
  assert.match(decodeURIComponent(calls[0]), /track_name=A/);
  assert.match(decodeURIComponent(calls[0]), /artist_name=张三/);
});

test("三路都空 → 抛「纯音乐」，不返回空 doc（界面要的是文案不是空白）", async () => {
  await assert.rejects(
    resolveLocalLyric(TRACK.path, TRACK, { read: async () => null, http: fakeHttp([]).http }),
    /纯音乐/,
  );
});

test("绑定原文 → doc：来源 manual，[offset:] 照旧换算（P0-19）", () => {
  const doc = bindingToDoc("[offset:+250]\n[00:01.00]挑的", "c:/music/a.mp3", 200_000);
  assert.equal(doc.source, "manual");
  assert.equal(doc.offsetMs, -250);
  assert.equal(doc.lines.length, 1);
});

test("未知歌手不拿去搜（扫描器兜底值会搜出无关结果）", async () => {
  const { http, calls } = fakeHttp([]);
  await assert.rejects(
    resolveLocalLyric(TRACK.path, { ...TRACK, artist: "未知歌手" }, { read: async () => null, http }),
    /纯音乐/,
  );
  assert.doesNotMatch(decodeURIComponent(calls[0]), /artist_name=未知歌手/);
});
