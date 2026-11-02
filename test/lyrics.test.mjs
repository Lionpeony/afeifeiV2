import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, parseClock, parseLyrics, reflow } from "../dist-test/lyrics.mjs";

/* 样本取自旧仓库 tools/test-lyrics-pro.js（2026-11-02），时间单位改成毫秒 */
const LRC = `[ti:测试]
[ar:Afeifei]
[00:12.30]第一行歌词在这里
[00:16.80]第二行，有标点也有 <00:17.20>逐字<00:17.90>时间
[00:21.00]第三行`;

const QRC = `[ti:QRC]
[12030,3200]第一句(0,400)歌词(400,520)在这里(920,880)
[15300,2500]第二句(0,300)带(300,260)括号(560,340)的词(900,500)`;

const YRC = `[12030,3200](12030,400,0)第(12430,420,0)一(12850,380,0)句
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

/* ---------- LRC ---------- */

test("LRC：行数与时间", () => {
  const doc = parseLyrics(LRC);
  assert.equal(doc.format, "lrc");
  assert.equal(doc.lines.length, 3);
  assert.equal(doc.lines[0].at, 12300);
});

test("LRC：元数据行被跳过，文本干净", () => {
  const doc = parseLyrics(LRC);
  assert.equal(doc.lines[0].text, "第一行歌词在这里");
  assert.ok(!doc.plain.includes("ti:"));
});

test("LRC：增强逐字（尖括号时间）", () => {
  const doc = parseLyrics(LRC);
  const second = doc.words.filter((w) => w.line === 1);
  assert.ok(second.length >= 2, `逐字应有 ≥2 段，实际 ${second.length}`);
  assert.equal(doc.lines[1].text, "第二行，有标点也有 逐字时间");
  // 第一段文本从行首开始，后面的尖括号时间给的是"接下来那段"的起点
  assert.equal(second[0].at, 16800, "行首那段从行时间开始");
  assert.equal(second[1].at, 17200, "第二段从尖括号给的 17.20 开始");
});

test("LRC：一行多个时间标签展开成多行", () => {
  const doc = parseLyrics("[00:10.00][00:20.00]重复的一句");
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].at, 10000);
  assert.equal(doc.lines[1].at, 20000);
  assert.equal(doc.lines[0].text, doc.lines[1].text);
});

test("LRC：缺时长的行按下一行推算", () => {
  const doc = parseLyrics("[00:10.00]甲\n[00:14.00]乙");
  assert.equal(doc.lines[0].dur, 4000);
  assert.ok(doc.lines[1].dur > 0, "最后一行也要有时长");
});

/* ---------- QRC ---------- */

test("QRC：行数与时间", () => {
  const doc = parseLyrics(QRC);
  assert.equal(doc.format, "qrc");
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].at, 12030);
  assert.equal(doc.lines[0].dur, 3200);
});

test("QRC：文本是去掉括号后的拼接", () => {
  assert.equal(parseLyrics(QRC).lines[0].text, "第一句歌词在这里");
});

test("QRC：词的时间是相对行首，要加成绝对", () => {
  const doc = parseLyrics(QRC);
  const words = doc.words.filter((w) => w.line === 0);
  assert.equal(words.length, 3);
  assert.equal(words[0].char, "第一句");
  assert.equal(words[0].at, 12030);
  assert.equal(words[2].at, 12030 + 920);
});

/* ---------- YRC ---------- */

test("YRC：文本与逐字绝对时间", () => {
  const doc = parseLyrics(YRC);
  assert.equal(doc.format, "yrc");
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].text, "第一句");
  const words = doc.words.filter((w) => w.line === 0);
  assert.equal(words.length, 3);
  assert.equal(words[0].char, "第");
  assert.equal(words[1].at, 12430);
});

/* ---------- TTML ---------- */

test("TTML：p 与 span 都能解出来", () => {
  const doc = parseLyrics(TTML);
  assert.equal(doc.format, "ttml");
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].at, 12030);
  assert.equal(doc.lines[0].dur, 3200);
});

test("TTML：span 逐字与文本", () => {
  const doc = parseLyrics(TTML);
  const words = doc.words.filter((w) => w.line === 0);
  assert.equal(words.length, 3);
  assert.equal(words.map((w) => w.char).join(""), "第一句");
});

test("TTML：没有 span 的整行回落成纯文本", () => {
  const doc = parseLyrics(TTML);
  assert.equal(doc.lines[1].text, "整行没有逐字");
  assert.equal(doc.words.filter((w) => w.line === 1).length, 0);
});

/* ---------- 纯文本回落 ---------- */

test("纯文本：按行切开并均分时长", () => {
  const doc = parseLyrics("第一句\n第二句\n第三句", { totalMs: 9000 });
  assert.equal(doc.format, "plain");
  assert.equal(doc.lines.length, 3);
  assert.equal(doc.lines[0].at, 0);
  assert.equal(doc.lines[1].at, 3000);
  assert.ok(doc.lines.every((l) => l.dur > 0));
});

test("认不出的格式退回纯文本，不给空对象", () => {
  const doc = parseLyrics("<html><body>一段乱七八糟的东西</body></html>");
  assert.ok(doc.lines.length > 0, "至少要有一行");
  assert.ok(doc.plain.length > 0);
});

test("空输入得到空文档而不是抛错", () => {
  const doc = parseLyrics("");
  assert.equal(doc.lines.length, 0);
  assert.equal(doc.plain, "");
});

/* ---------- 智能重排 ---------- */

const LONG = "[00:01.00]这是一个非常非常长的句子，用来测试智能断行是否会把标点留在行尾而不是行首，并且避免最后一行只剩一个字。";

test("重排：长句被拆成多行", () => {
  const view = reflow(parseLyrics(LONG), { maxChars: 18 });
  assert.ok(view.lines.length >= 3, `应拆成 ≥3 行，实际 ${view.lines.length}`);
});

test("重排：行首不留标点", () => {
  const view = reflow(parseLyrics(LONG), { maxChars: 18 });
  const bad = view.lines.filter((l) => /^[，。、；：！？…—～,.;:!?]/.test(l.text));
  assert.equal(bad.length, 0, `行首标点：${bad.map((b) => b.text).join(" | ")}`);
});

test("重排：最后一行不是单字", () => {
  const view = reflow(parseLyrics(LONG), { maxChars: 18 });
  const last = view.lines[view.lines.length - 1];
  assert.ok(Array.from(last.text.replace(/\s/g, "")).length > 1, `末行：${last.text}`);
});

test("重排：每行都有时间与时长，且首尾相接", () => {
  const view = reflow(parseLyrics(LONG), { maxChars: 18 });
  for (const line of view.lines) {
    assert.ok(line.at >= 1000, `at=${line.at}`);
    assert.ok(line.dur > 0, `dur=${line.dur}`);
  }
  for (let i = 1; i < view.lines.length; i += 1) {
    assert.ok(
      Math.abs(view.lines[i].at - (view.lines[i - 1].at + view.lines[i - 1].dur)) <= 5,
      `第 ${i} 行与上一行之间有缝`,
    );
  }
});

test("重排：短行原样不动（不该把正常歌词也切了）", () => {
  const doc = parseLyrics("[00:01.00]短句");
  const view = reflow(doc, { maxChars: 18 });
  assert.equal(view.lines.length, 1);
  assert.equal(view.lines[0].text, "短句");
});

test("重排：逐字行不参与切分（切了逐字时间就对不上）", () => {
  const doc = parseLyrics("[00:01.00]这是一句特别特别长的歌词而且它还有逐字时间<00:02.00>后面还有更多字");
  const view = reflow(doc, { maxChars: 10 });
  const wordLines = new Set(doc.words.map((w) => w.line));
  if (wordLines.size > 0) {
    assert.equal(view.lines.length, doc.lines.length, "带逐字的行不该被切");
  }
});
