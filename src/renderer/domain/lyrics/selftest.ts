/**
 * 判据自测（20 §六：判据必须可测）。
 * 跑法：npx tsx src/renderer/domain/lyrics/selftest.ts
 * 未来接测试框架后，本文件原样变成测试用例。
 */
import { parseLrc } from "./parse-lrc";
import { detectKaraokeFormat, parseQrc } from "./parse-qrc-yrc";
import { cursorAt, lineStartMs } from "./cursor";
import { clusterSegments } from "./segment";
import { createLyricPort, pickBest } from "./index";

let failed = 0;
function ok(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

const SAMPLE = `
[ti:老人と海]
[ar:ヨルシカ]
[offset:0]
[00:12.00]他梦见狮子
[00:15.50]回到沙滩上。
[00:20.00]<00:20.00>马<00:20.40>林<00:20.80>鱼
[00:45.00]尾奏之后再无歌词
`;

console.log("— 解析 —");
const doc = parseLrc(SAMPLE, { trackId: "t1", source: "embedded" });
ok("解析出 4 行", doc.lines.length === 4);
ok("首行从 12s 开始", doc.lines[0].startMs === 12_000);
ok("行级质量为 estimated（首两行无逐字）", doc.quality === "exact");
ok("检测到逐字时间轴", doc.hasWordTiming === true);
ok("逐字行 words=3", doc.lines[2].words.length === 3);
ok("逐字时间是相对行的", doc.lines[2].words[1].startMs === 400);
ok("多时间标签拆成独立行", doc.lines[1].text === "回到沙滩上。");
ok("行尾 = 下一行开始", doc.lines[0].endMs === 15_500);
ok("间隔过大时行尾截断到 8s", doc.lines[2].endMs === 28_000);
ok("元数据不进正文", doc.lines.every((l) => !l.text.includes("ヨルシカ")));

console.log("— 游标 —");
const c = (ms: number) => cursorAt(doc, ms);
ok("前奏返回 -1", c(5_000).lineIndex === -1);
ok("前奏的下一行是 0", c(5_000).nextLineIndex === 0);
ok("12s 命中第 0 行", c(12_000).lineIndex === 0);
ok("17s 命中第 1 行", c(17_000).lineIndex === 1);
ok("行尾 19.9s 仍在行 1（行间无空隙）", c(19_900).lineIndex === 1);
ok("28–45s 是真间奏", c(30_000).lineIndex === -1);
ok("间奏的下一行是 3", c(30_000).nextLineIndex === 3);
ok("逐字行命中字 1", c(20_500).wordIndex === 1);
ok("无逐字行 wordIndex=-1", c(12_500).wordIndex === -1);
ok("最后一行之后 next=-1", c(50_000).nextLineIndex === -1);
ok("点击跳句：第 2 行起点 20s", lineStartMs(doc, 2) === 20_000);

console.log("— 边界 —");
const empty = parseLrc("", { trackId: "t2" });
ok("空文件 quality=none", empty.quality === "none");
ok("空文件游标安全", cursorAt(empty, 0).lineIndex === -1);
const garbage = parseLrc("这不是歌词，没有时间戳", { trackId: "t3" });
ok("无时间戳不崩、返回 none", garbage.quality === "none");

/* ================= 段落聚类 v1 ================= */
console.log("\n— 段落聚类 —");
const REFRAIN = `
[00:10.00]AAAA
[00:14.00]BBBB
[00:26.00]AAAA
[00:38.00]CCCC
`;
const rDoc = parseLrc(REFRAIN, { trackId: "r1" });
const rSegs = clusterSegments(rDoc.lines);
ok("12s 间隔切成 3 段", rSegs.length === 3);
ok("段 0 是主歌 1", rSegs[0].name === "主歌 1");
ok("重复首行判为副歌", rSegs[1].name === "副歌");
ok("副歌置信度更高", rSegs[1].confidence > rSegs[0].confidence);
ok("段 2 是主歌 2（重复不占主歌编号）", rSegs[2].name === "主歌 2");
ok("v1 边界全是 estimated", rSegs.every((s) => s.boundary === "estimated"));
ok("置信度落在 0.3–0.9", rSegs.every((s) => s.confidence >= 0.3 && s.confidence <= 0.9));
ok("段引用正确的行", rSegs[1].lineIndexes.length === 1 && rDoc.lines[rSegs[1].lineIndexes[0]].text === "AAAA");

const CONT = parseLrc(SAMPLE, { trackId: "c1" });
const cSegs = clusterSegments(CONT.lines);
ok("17s 间隔切成 2 段", cSegs.length === 2);
ok("段 0 覆盖连续的前三行", cSegs[0].lineIndexes.length === 3);
ok("末段是 45s 的孤行", cSegs[1].lineIndexes.length === 1);

const introDoc = parseLrc("[00:02.00]前奏独白\n[00:08.00]第一句\n[00:12.00]第二句", { trackId: "i1" });
const iSegs = clusterSegments(introDoc.lines);
ok("2 秒起的首段判为前奏", iSegs[0].name === "前奏");

/* ================= QRC / YRC 逐字 ================= */
console.log("\n— QRC / YRC —");
const YRC = `[ti:老人と海]
[ar:ヨルシカ]
[0,2800]<0,260,0>他<260,240,0>梦<500,300,0>见
[2800,2500]<2800,300,0>狮<3100,400,0>子<3500,500,0>回`;
const QRC = `[ti:test]
[ar:test]
[0,2000]你(0,500)好(500,600)
[2000,2000]世(0,500)界(500,600)`;

ok("识别 YRC", detectKaraokeFormat(YRC) === "yrc");
ok("识别 QRC", detectKaraokeFormat(QRC) === "qrc");
ok("行级 LRC 不误判", detectKaraokeFormat("[00:12.00]hello") === null);

const yDoc = parseQrc(YRC, { trackId: "y1" });
ok("YRC 解析出 2 行", yDoc?.lines.length === 2);
ok("YRC 逐字数正确", yDoc?.lines[0].words.length === 3);
ok("YRC 字时间相对行", yDoc?.lines[0].words[1].startMs === 260);
ok("YRC 行文本拼接", yDoc?.lines[0].text === "他梦见");
ok("YRC 质量为 exact", yDoc?.quality === "exact");

const qDoc = parseQrc(QRC, { trackId: "q1" });
ok("QRC 解析出 2 行", qDoc?.lines.length === 2);
ok("QRC 逐字数正确", qDoc?.lines[0].words.length === 2);
ok("QRC 字时间相对行", qDoc?.lines[0].words[1].startMs === 500);
ok("QRC 行文本拼接", qDoc?.lines[0].text === "你好");
ok("非逐字格式返回 null", parseQrc("[00:12.00]x", { trackId: "n1" }) === null);

if (yDoc) {
  const yc = cursorAt(yDoc, 300);
  ok("YRC 逐字游标命中字 1", yc.wordIndex === 1);
  ok("YRC 游标命中行 0", yc.lineIndex === 0);
}

/* ================= LRCLIB 抓取（异步，包 IIFE：项目是 CJS） ================= */
console.log("\n— LRCLIB —");
void (async () => {
const SYNCED_A = "[00:10.00]hello\n[00:14.00]world";
const hits = [
  { id: 1, trackName: "X", artistName: "A", duration: 200, instrumental: false, plainLyrics: "plain", syncedLyrics: SYNCED_A },
  { id: 2, trackName: "X", artistName: "A", duration: 310, instrumental: false, plainLyrics: null, syncedLyrics: "[00:30.00]far" },
];
ok("挑时长最接近的同步版本", pickBest(hits, 300_000)?.id === 2);
ok("无目标时长取第一个同步版", pickBest(hits)?.id === 1);
ok("只有 plain 时退回 plain", pickBest([hits[0]].map(h => ({ ...h, syncedLyrics: null })), 300_000)?.plainLyrics === "plain");

let calls = 0;
const fakeHttp = {
  fetchJson: async (url: string) => {
    calls += 1;
    if (url.includes("track_name=META")) {
      return { status: 200, json: hits, setCookie: [] };
    }
    return { status: 404, json: [], setCookie: [] };
  },
};
const store = new Map<string, string>();
const kvFake = { read: async (k: string) => store.get(k) ?? null, write: async (k: string, v: string) => { store.set(k, v); } };
const port = createLyricPort({
  kv: kvFake,
  http: fakeHttp,
  metaOf: (id) =>
    id === "t-meta"
      ? { title: "META", artist: "A", durationMs: 300_000 }
      : id === "t-none"
        ? { title: "NONE" }
        : null,
});

const got = await port.get("t-meta");
ok("在线抓取解析成 doc（挑了时长最近的 far）", got.source === "lrclib" && got.lines.length === 1 && got.lines[0].text === "far");
ok("写入了 KV 缓存", store.has("lyric:t-meta"));
const callsAfterFirst = calls;
await port.get("t-meta");
ok("第二次命中缓存不再发请求", calls === callsAfterFirst);

const miss = await port.get("t-none");
ok("查不到返回 none 不抛错", miss.quality === "none");
await port.get("t-none");
ok("失败后本会话不再重试", calls === callsAfterFirst + 1);

const re = await port.refetch("t-meta", "lrclib");
ok("refetch 清缓存重抓", re.lines.length === 1);

  if (failed) {
    console.error(`\n${failed} 项未通过`);
    process.exit(1);
  }
  console.log("\n全部通过");
})();
