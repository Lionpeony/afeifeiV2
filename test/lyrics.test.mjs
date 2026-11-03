import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, parseClock, parseLyrics, reflow, withTranslation } from "../dist-test/lyrics.mjs";

/* 样本取自旧仓库 tools/test-lyrics-pro.js（2026-11-02），时间单位改成毫秒。
   模型只有一份：contracts/lyric.ts（21 §二）—— 行用 startMs/endMs，逐字用**行内相对**。 */
const OPTS = { trackId: "t1" };

const LRC = `[ti:测试]
[ar:Afeifei]
[00:12.30]第一行歌词在这里
[00:16.80]第二行，有标点也有 <00:17.20>逐字<00:17.90>时间
[00:21.00]第三行`;

const QRC = `[ti:QRC]
[12030,3200]第一句(0,400)歌词(400,520)在这里(920,880)
[15300,2500]第二句(0,300)带(300,260)括号(560,340)的词(900,500)`;

const YRC = `[ti:YRC]
[12030,3200](12030,400,0)第(12430,420,0)一(12850,380,0)句
[15300,2500](15300,300,0)第(15600,320,0)二(15920,300,0)句`;

const TTML = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"><body><div>
<p begin="00:00:12.030" end="00:00:15.230"><span begin="00:00:12.030" end="00:00:12.430">第</span><span begin="00:00:12.430" end="00:00:12.830">一</span><span begin="00:00:12.830" end="00:00:13.230">句</span></p>
<p begin="00:00:15.300" end="00:00:17.800">整行没有逐字</p>
</div></body></tt>`;

/* ---------- 格式识别 ---------- */

test("识别 LRC / QRC / YRC / TTML / 纯文本", () => {
  assert.equal(detect(LRC), "lrc");
  assert.equal(detect(QRC), "qrc");
  assert.equal(detect(YRC), "yrc");
  assert.equal(detect(TTML), "ttml");
  assert.equal(detect("随便几句\n没有时间轴"), "plain");
});

test("QRC 不会被误认成 LRC（行首是 [毫秒,时长]，没有冒号）", () => {
  assert.equal(detect("[12030,3200]第一句"), "qrc");
});

test("空串算纯文本，不抛错", () => {
  assert.equal(detect(""), "plain");
  assert.equal(detect("   "), "plain");
});

/* ---------- 时间解析 ---------- */

test("parseClock：mm:ss.xx", () => {
  assert.equal(parseClock("00:12.30"), 12300);
  assert.equal(parseClock("01:02.50"), 62500);
});

test("parseClock：老式 mm:ss:xx（百分秒）", () => {
  assert.equal(parseClock("00:12:30"), 12300);
});

test("parseClock：hh:mm:ss.xxx", () => {
  assert.equal(parseClock("01:02:03.500"), 3723500);
});

/* ---------- LyricDoc 基本形状（单模型） ---------- */

test("parseLyrics 必填 trackId，产物带 identity 与质量", () => {
  const doc = parseLyrics(LRC, OPTS);
  assert.equal(doc.trackId, "t1");
  assert.equal(doc.offsetMs, 0);
  assert.equal(doc.quality, "exact", "带逐字 = exact");
  assert.equal(doc.hasWordTiming, true);
  assert.ok(doc.fetchedAt > 0);
  for (const [i, line] of doc.lines.entries()) assert.equal(line.index, i, "行号 = 数组下标");
});

/* ---------- LRC ---------- */

test("LRC：行数与时间", () => {
  const doc = parseLyrics(LRC, OPTS);
  assert.equal(doc.lines.length, 3);
  assert.equal(doc.lines[0].startMs, 12300);
});

test("LRC：元数据行被跳过，文本干净", () => {
  const doc = parseLyrics(LRC, OPTS);
  assert.equal(doc.lines[0].text, "第一行歌词在这里");
  assert.ok(!doc.lines.some((l) => l.text.includes("Afeifei") || l.text.includes("ti:")));
});

test("LRC：增强逐字（尖括号时间）转成行内相对偏移", () => {
  const doc = parseLyrics(LRC, OPTS);
  const words = doc.lines[1].words;
  assert.equal(words.length, 3, `逐字应有 3 段，实际 ${words.length}`);
  assert.equal(doc.lines[1].text, "第二行，有标点也有 逐字时间");
  assert.equal(words[0].startMs, 0, "行首那段从行时间开始");
  assert.equal(words[1].startMs, 400, "第二段从尖括号给的 17.20 开始（行内相对）");
  assert.equal(words[2].startMs, 1100);
});

test("LRC：一行多个时间标签展开成多行，逐字跟着平移", () => {
  const doc = parseLyrics("[00:10.00][00:20.00]<00:10.00>重<00:10.50>复", OPTS);
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].startMs, 10000);
  assert.equal(doc.lines[1].startMs, 20000);
  assert.equal(doc.lines[0].text, doc.lines[1].text);
  assert.equal(doc.lines[1].words[0].startMs, 0);
  assert.equal(doc.lines[1].words[1].startMs, 500);
});

test("LRC：缺时长的行按下一行推算", () => {
  const doc = parseLyrics("[00:10.00]甲\n[00:14.00]乙", OPTS);
  assert.equal(doc.lines[0].startMs, 10000);
  assert.equal(doc.lines[0].endMs, 14000);
  assert.ok(doc.lines[1].endMs > doc.lines[1].startMs, "最后一行也要有时长");
});

test("LRC：行级歌词的质量是 estimated，且没有逐字", () => {
  const doc = parseLyrics("[00:10.00]甲\n[00:14.00]乙", OPTS);
  assert.equal(doc.hasWordTiming, false);
  assert.equal(doc.quality, "estimated");
  assert.deepEqual(doc.lines[0].words, []);
});

/* ---------- QRC ---------- */

test("QRC：行数与时间", () => {
  const doc = parseLyrics(QRC, OPTS);
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].startMs, 12030);
  assert.equal(doc.lines[0].endMs, 15230);
});

test("QRC：文本是去掉括号后的拼接", () => {
  assert.equal(parseLyrics(QRC, OPTS).lines[0].text, "第一句歌词在这里");
});

test("QRC：词的时间是相对行首，落在行内", () => {
  const words = parseLyrics(QRC, OPTS).lines[0].words;
  assert.equal(words.length, 3);
  assert.equal(words[0].text, "第一句");
  assert.equal(words[0].startMs, 0);
  assert.equal(words[2].startMs, 920);
  assert.ok(words[2].endMs <= 3200, "字尾不许越过行尾");
});

/* ---------- YRC ---------- */

test("YRC：文本与逐字相对时间", () => {
  const doc = parseLyrics(YRC, OPTS);
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].text, "第一句");
  const words = doc.lines[0].words;
  assert.equal(words.length, 3);
  assert.equal(words[0].text, "第");
  assert.equal(words[1].startMs, 400);
});

/* ---------- TTML ---------- */

test("TTML：p 与 span 都能解出来", () => {
  const doc = parseLyrics(TTML, OPTS);
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].startMs, 12030);
  assert.equal(doc.lines[0].endMs, 15230);
});

test("TTML：span 逐字与文本", () => {
  const doc = parseLyrics(TTML, OPTS);
  const words = doc.lines[0].words;
  assert.equal(words.length, 3);
  assert.equal(words.map((w) => w.text).join(""), "第一句");
});

test("TTML：没有 span 的整行回落成纯文本", () => {
  const doc = parseLyrics(TTML, OPTS);
  assert.equal(doc.lines[1].text, "整行没有逐字");
  assert.equal(doc.lines[1].words.length, 0);
});

/* ---------- 段落（segments） ---------- */

test("段落：有真实间隔才切段，没有间隔不假装分段", () => {
  const gapped = parseLyrics("[0,2000]甲(0,500)\n[10000,2000]乙(0,500)", OPTS);
  assert.ok(gapped.segments.length >= 2, `应切出 ≥2 段，实际 ${gapped.segments.length}`);
  assert.ok(gapped.segments.every((s) => s.lineIndexes.length > 0));

  const flat = parseLyrics("[00:10.00]甲\n[00:14.00]乙", OPTS);
  assert.deepEqual(flat.segments, [], "连成一片的 LRC 不该编出一个段");
});

/* ---------- 翻译 ---------- */

test("withTranslation：按行时间对齐，写进 line.translations", () => {
  const doc = parseLyrics("[00:10.00]hello\n[00:14.00]world", OPTS);
  const zh = withTranslation(doc, "[00:10.00]你好\n[00:14.00]世界", "zh");
  assert.equal(zh.lines[0].translations?.zh, "你好");
  assert.equal(zh.lines[1].translations?.zh, "世界");
  assert.equal(zh.lines[0].text, "hello", "主文本不许被翻译覆盖");
});

test("withTranslation：差太远的行不强行配对", () => {
  const doc = parseLyrics("[00:10.00]hello", OPTS);
  const zh = withTranslation(doc, "[00:30.00]无关", "zh");
  assert.equal(zh.lines[0].translations, undefined);
});

/* ---------- 纯文本回落 ---------- */

test("纯文本：按行切开并均分时长", () => {
  const doc = parseLyrics("第一句\n第二句\n第三句", { trackId: "t", totalMs: 9000 });
  assert.equal(doc.lines.length, 3);
  assert.equal(doc.lines[0].startMs, 0);
  assert.equal(doc.lines[1].startMs, 3000);
  assert.ok(doc.lines.every((l) => l.endMs > l.startMs));
  assert.equal(doc.quality, "estimated");
});

test("认不出的格式退回纯文本，不给空对象", () => {
  const doc = parseLyrics("<html><body>一段乱七八糟的东西</body></html>", OPTS);
  assert.ok(doc.lines.length > 0, "至少要有一行");
});

test("空输入得到空文档而不是抛错", () => {
  const doc = parseLyrics("", OPTS);
  assert.equal(doc.lines.length, 0);
  assert.equal(doc.quality, "none");
  assert.equal(doc.hasWordTiming, false);
});

/* ---------- 智能重排 ---------- */

const LONG = "[00:01.00]这是一个非常非常长的句子，用来测试智能断行是否会把标点留在行尾而不是行首，并且避免最后一行只剩一个字。";

test("重排：长句被拆成多行", () => {
  const view = reflow(parseLyrics(LONG, OPTS), { maxChars: 18 });
  assert.ok(view.lines.length >= 3, `应拆成 ≥3 行，实际 ${view.lines.length}`);
});

test("重排：行首不留标点", () => {
  const view = reflow(parseLyrics(LONG, OPTS), { maxChars: 18 });
  const bad = view.lines.filter((l) => /^[，。、；：！？…—～,.;:!?]/.test(l.text));
  assert.equal(bad.length, 0, `行首标点：${bad.map((b) => b.text).join(" | ")}`);
});

test("重排：最后一行不是单字", () => {
  const view = reflow(parseLyrics(LONG, OPTS), { maxChars: 18 });
  const last = view.lines[view.lines.length - 1];
  assert.ok(Array.from(last.text.replace(/\s/g, "")).length > 1, `末行：${last.text}`);
});

test("重排：每行都有时间区间，且首尾相接、总长不变", () => {
  const orig = parseLyrics(LONG, OPTS);
  const view = reflow(orig, { maxChars: 18 });
  assert.equal(view.lines[0].startMs, orig.lines[0].startMs);
  for (let i = 1; i < view.lines.length; i += 1) {
    assert.equal(view.lines[i].startMs, view.lines[i - 1].endMs, `第 ${i} 行与上一行之间有缝`);
  }
  assert.equal(view.lines[view.lines.length - 1].endMs, orig.lines[0].endMs, "总时长不许被切丢");
});

test("重排：短行原样不动（不该把正常歌词也切了）", () => {
  const view = reflow(parseLyrics("[00:01.00]短句", OPTS), { maxChars: 18 });
  assert.equal(view.lines.length, 1);
  assert.equal(view.lines[0].text, "短句");
});

test("重排：逐字行不参与切分（切了逐字时间就对不上）", () => {
  const doc = parseLyrics("[00:01.00]这是一句特别特别长的歌词而且它还有逐字时间<00:02.00>后面还有更多字", OPTS);
  assert.ok(doc.lines[0].words.length > 0, "样本必须带逐字");
  const view = reflow(doc, { maxChars: 10 });
  assert.equal(view.lines.length, doc.lines.length, "带逐字的行不该被切");
});
