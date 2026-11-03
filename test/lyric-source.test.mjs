import { test } from "node:test";
import assert from "node:assert/strict";
import { clearLyric, loadLyric, lyricState, subscribeLyric } from "../dist-test/lyric-source.mjs";

/**
 * A-02 判据「桌面歌词未进播放页也有词」的机制部分：
 * 取词收口到一个模块，外壳切歌时取、播放页与歌词桥都只订阅。
 * 这里断的是**收敛性**（不重复取、慢响应不盖新歌、切歌立刻清行），
 * 真机那张截图（不进播放页也有词）由 stage-shots 之外的桥验证。
 */

const doc = (id) => ({ lines: [{ t: 0, ms: 0, text: `词 ${id}` }], offsetMs: 0 });

test("取到词后 doc 就位、note 清空", async () => {
  clearLyric("");
  await loadLyric("netease", "1", async () => doc("1"));
  const s = lyricState();
  assert.ok(s.doc, "应当有 doc");
  assert.equal(s.note, "");
  clearLyric("");
});

test("同一首第二次 load 不再发请求（缓存层之外再挡一层）", async () => {
  clearLyric("");
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return doc("x");
  };
  await loadLyric("netease", "2", fetch);
  await loadLyric("netease", "2", fetch);
  assert.equal(calls, 1, "同一 sourceId+songId 只该取一次");
  clearLyric("");
});

test("切歌立刻清行（订阅者在取词完成前就看到空 doc）", async () => {
  clearLyric("");
  await loadLyric("netease", "3", async () => doc("3"));
  const seen = [];
  const off = subscribeLyric(() => seen.push(lyricState().doc ? "有词" : "空"));
  let release;
  const pending = loadLyric(
    "netease",
    "4",
    () =>
      new Promise((resolve) => {
        release = () => resolve(doc("4"));
      }),
  );
  assert.deepEqual(seen, ["空"], "load 一开始就该清空，不许挂着上一首");
  release();
  await pending;
  assert.deepEqual(seen, ["空", "有词"]);
  off();
  clearLyric("");
});

test("慢响应的旧歌不许盖掉新歌", async () => {
  clearLyric("");
  let releaseSlow;
  const slow = loadLyric(
    "netease",
    "old",
    () =>
      new Promise((resolve) => {
        releaseSlow = () => resolve(doc("old"));
      }),
  );
  await loadLyric("netease", "new", async () => doc("new"));
  releaseSlow();
  await slow;
  assert.equal(lyricState().doc.lines[0].text, "词 new", "旧响应必须被丢弃");
  clearLyric("");
});

test("取词失败给文案，且允许重试（失败不占位）", async () => {
  clearLyric("");
  await loadLyric("netease", "5", async () => {
    throw new Error("版权限制");
  });
  assert.equal(lyricState().doc, null);
  assert.equal(lyricState().note, "版权限制");

  let retried = 0;
  await loadLyric("netease", "5", async () => {
    retried += 1;
    return doc("5");
  });
  assert.equal(retried, 1, "失败后再进要能重新取");
  assert.ok(lyricState().doc);
  clearLyric("");
});

test("clearLyric 幂等：同样的空态不重复通知", () => {
  clearLyric("");
  let n = 0;
  const off = subscribeLyric(() => {
    n += 1;
  });
  clearLyric("");
  clearLyric("");
  assert.equal(n, 0, "状态没变就不该惊动订阅者");
  clearLyric("本地曲目暂无歌词");
  assert.equal(n, 1);
  clearLyric("本地曲目暂无歌词");
  assert.equal(n, 1);
  off();
});
