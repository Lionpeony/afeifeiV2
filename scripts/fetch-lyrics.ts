/**
 * 找一首**真带逐字时间轴**的歌词（LRCLIB 增强 LRC），写 design/v2/lyrics-sample.js。
 * 跑法：npx tsx scripts/fetch-lyrics.ts
 *
 * 为什么非要逐字：a2 的田字格是"逐字点亮"，行级歌词验证不了它；
 * 而且 A-04（逐字卡拉OK）必须有真数据才算数。
 */
import fs from "node:fs";
import { parseLrc } from "../src/renderer/domain/lyrics/parse-lrc";
import { clusterSegments } from "../src/renderer/domain/lyrics/segment";
import { pickBest, searchLrclib } from "../src/renderer/domain/lyrics/fetch-lrclib";

const http = {
  fetchJson: async (url: string) => {
    const r = await fetch(url, { headers: { "User-Agent": "afeifei/0.1 (vertical slice)" } });
    return {
      status: r.status,
      json: await r.json().catch(() => null),
      setCookie: [] as string[],
    };
  },
};

const CANDIDATES: [string, string][] = [
  ["Bohemian Rhapsody", "Queen"],
  ["Let It Be", "The Beatles"],
  ["Hey Jude", "The Beatles"],
  ["Yesterday", "The Beatles"],
  ["Breathe", "The Prodigy"],
  ["River flows in you", "Yiruma"],
  ["Thunderstruck", "AC/DC"],
  ["Believer", "Imagine Dragons"],
  ["Perfect", "Ed Sheeran"],
  ["Shape of You", "Ed Sheeran"],
  ["Rolling in the Deep", "Adele"],
  ["Hotel California", "Eagles"],
  ["Sunflower", "Post Malone"],
  ["Radioactive", "Imagine Dragons"],
  ["The Less I Know The Better", "Tame Impala"],
  ["Take Me to Church", "Hozier"],
  ["Someone Like You", "Adele"],
  ["The Winner Takes It All", "ABBA"],
  ["Dancing Queen", "ABBA"],
  ["Nothing Else Matters", "Metallica"],
  ["Numb", "Linkin Park"],
  ["In the End", "Linkin Park"],
  ["Billie Jean", "Michael Jackson"],
  ["Thriller", "Michael Jackson"],
  ["Careless Whisper", "Wham"],
  ["My Heart Will Go On", "Celine Dion"],
  ["Hallelujah", "Leonard Cohen"],
  ["Imagine", "John Lennon"],
  ["No Woman No Cry", "Bob Marley"],
  ["Redemption Song", "Bob Marley"],
];

void (async () => {
  const results: {
    title: string;
    artist: string;
    lines: number;
    words: number;
    segments: number;
    synced: string;
  }[] = [];

  await Promise.all(
    CANDIDATES.map(async ([trackName, artistName]) => {
      try {
        const hits = await searchLrclib(http, { trackName, artistName });
        const best = pickBest(hits);
        if (!best?.syncedLyrics) return;
        const doc = parseLrc(best.syncedLyrics, { trackId: "sample", source: "lrclib" });
        const words = doc.lines.reduce((n, l) => n + l.words.length, 0);
        results.push({
          title: trackName,
          artist: artistName,
          lines: doc.lines.length,
          words,
          segments: clusterSegments(doc.lines).length,
          synced: best.syncedLyrics,
        });
      } catch {
        /* 单首失败不影响整体 */
      }
    }),
  );

  results.sort((a, b) => b.words - a.words || b.lines - a.lines);
  console.log("— 命中情况（按逐字数排序，前 12）—");
  results.slice(0, 12).forEach((r) =>
    console.log(`  逐字=${String(r.words).padStart(4)} 行=${String(r.lines).padStart(3)}  ${r.title} / ${r.artist}`),
  );

  const pick = results.find((r) => r.words > 0) ?? results[0];
  if (!pick) {
    console.error("没有候选拿到同步歌词");
    process.exit(1);
  }

  const doc = parseLrc(pick.synced, { trackId: "sample", source: "lrclib" });
  doc.segments = clusterSegments(doc.lines);
  const json = JSON.stringify(doc, null, 2);
  const meta = `window.__LYRIC_META = { title: ${JSON.stringify(pick.title)}, artist: ${JSON.stringify(pick.artist)}, durationMs: ${Math.round(doc.lines[doc.lines.length - 1].endMs)} };`;
  fs.writeFileSync("design/v2/lyrics-sample.json", json);
  fs.writeFileSync("design/v2/lyrics-sample.js", `${meta}\nwindow.__LYRIC_DOC = ${json};`);

  console.log(`\n已写入 design/v2/lyrics-sample.js —— ${pick.title} / ${pick.artist}`);
  console.log(`   ${doc.lines.length} 行 · ${doc.segments.length} 段 · 逐字=${doc.hasWordTiming} · 质量=${doc.quality}`);
  console.log(`   段名：${doc.segments.map((s) => s.name).join(" / ")}`);
})();
