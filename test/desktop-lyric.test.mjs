import { test } from "node:test";
import assert from "node:assert/strict";
import { desktopLyricState } from "../dist-test/desktop-lyric.mjs";

/**
 * P0-21 判据：桌面歌词窗的投影 —— **同一份 doc + 同一时刻 → 一行字 + 已唱几个字**。
 * 逐字进度复用播放页的 karaokeState，所以这里同时钉住"两边不会错开半个字"。
 */

const line = (startMs, endMs, text, words = []) => ({ index: 0, startMs, endMs, text, words });

const doc = (lines, offsetMs = 0) => ({
  trackId: "t",
  source: "local",
  hasWordTiming: false,
  lines,
  segments: [],
  offsetMs,
  quality: "estimated",
  fetchedAt: 0,
});

test("前奏/空 doc：整条空，窗口不该挂着上一首的句子", () => {
  assert.deepEqual(desktopLyricState(null, 0), { text: "", translation: "", lit: 0, progress: 0 });
  assert.equal(desktopLyricState(doc([line(2000, 4000, "还没到")]), 500).text, "");
});

test("有逐字数据：按已唱完的词累计字数（唱一个字亮一个字）", () => {
  const d = doc([
    line(1000, 3000, "你好世界", [
      { startMs: 0, endMs: 500, text: "你" },
      { startMs: 500, endMs: 1000, text: "好" },
      { startMs: 1000, endMs: 2000, text: "世界" },
    ]),
  ]);
  assert.equal(desktopLyricState(d, 1600).lit, 1, "1000+600 只唱完「你」");
  assert.equal(desktopLyricState(d, 2100).lit, 2, "1000+1100 唱完「你好」");
  assert.equal(desktopLyricState(d, 3100).lit, 4, "行末整句点亮");
});

test("没有逐字数据：按行进度折算，不装成逐字", () => {
  const d = doc([line(0, 2000, "一二三")]);
  assert.equal(desktopLyricState(d, 0).lit, 0);
  assert.equal(desktopLyricState(d, 1000).lit, 2, "半行 → 3 个字里亮 2 个");
  assert.equal(desktopLyricState(d, 2000).lit, 3);
});

test("译文：优先中文标签，没有就取第一条（上游标签不统一）", () => {
  const zh = doc([{ ...line(0, 2000, "hello"), translations: { en: "english", zh: "你好" } }]);
  assert.equal(desktopLyricState(zh, 100).translation, "你好");
  const onlyEn = doc([{ ...line(0, 2000, "hello"), translations: { en: "english" } }]);
  assert.equal(desktopLyricState(onlyEn, 100).translation, "english");
  assert.equal(desktopLyricState(doc([line(0, 2000, "hello")]), 100).translation, "");
});

test("用户偏移在这里同样生效（与播放页同一时刻口径）", () => {
  const d = doc([line(1000, 3000, "词")], 500);
  assert.equal(desktopLyricState(d, 1400).text, "", "偏移 +500 = 词晚 0.5s，1400 还没到 1500");
  assert.equal(desktopLyricState(d, 1600).text, "词");
});

test("越界不越界：lit 不超过文本长度（窗口按前缀切字，多一个就是空白）", () => {
  const d = doc([line(0, 1000, "两个字")]);
  assert.ok(desktopLyricState(d, 5000).lit <= "两个字".length);
});
