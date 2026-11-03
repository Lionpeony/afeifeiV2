/**
 * 从网易云抓真歌词（行级）+ 真曲目元信息，写 design/v2/lyrics-sample.js。
 * 跑法：npx tsx scripts/fetch-netease.ts
 *
 * 用途：给竖切页（design/v2/a2.html）喂**真实中文歌的真实歌词**，
 * 证明「SourceAdapter → LyricDoc → 界面」这条路是通的。
 */
import fs from "node:fs";
import { parseLrc } from "../src/renderer/domain/lyrics/parse-lrc";
import { parseQrc } from "../src/renderer/domain/lyrics/parse-qrc-yrc";
import { clusterSegments } from "../src/renderer/domain/lyrics/segment";
import { fetchNeteaseLyric, searchNetease } from "../src/renderer/domain/source/netease";

const http = {
  fetchJson: async (url: string, options?: { headers?: Record<string, string> }) => {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Referer: "https://music.163.com/",
        Accept: "application/json, text/plain, */*",
        ...(options?.headers ?? {}),
      },
    });
    return {
      status: r.status,
      json: await r.json().catch(() => null),
      setCookie: [] as string[],
    };
  },
};

const QUERY = process.argv[2] ?? "漠河舞厅 柳爽";

void (async () => {
  const songs = await searchNetease(http, QUERY, 8);
  if (!songs.length) {
    console.error("搜索无结果");
    process.exit(1);
  }
  console.log(`搜索「${QUERY}」命中 ${songs.length} 首：`);
  songs.forEach((s) =>
    console.log(`  ${String(s.id).padEnd(12)} ${s.name} / ${(s.artists ?? []).map((a) => a.name).join(",")} ${s.duration}ms`),
  );

  for (const song of songs) {
    const l = await fetchNeteaseLyric(http, song.id);
    if (!l.lrc.trim()) continue;

    /* 逐字优先：klyric（YRC）拿不到时退回行级 lrc */
    const karaoke = l.karaoke ? parseQrc(l.karaoke, { trackId: "sample" }) : null;
    const doc = karaoke ?? parseLrc(l.lrc, { trackId: "sample", source: "netease" });
    doc.segments = clusterSegments(doc.lines);

    const artist = (song.artists ?? []).map((a) => a.name).join(", ");
    const meta = `window.__LYRIC_META = { title: ${JSON.stringify(song.name)}, artist: ${JSON.stringify(artist)}, durationMs: ${song.duration ?? 0} };`;
    const json = JSON.stringify(doc, null, 2);
    fs.writeFileSync("design/v2/lyrics-sample.json", json);
    fs.writeFileSync("design/v2/lyrics-sample.js", `${meta}\nwindow.__LYRIC_DOC = ${json};`);

    console.log(`\n已写入 —— ${song.name} / ${artist}`);
    console.log(`   ${doc.lines.length} 行 · ${doc.segments.length} 段 · 逐字=${doc.hasWordTiming} · 质量=${doc.quality}`);
    console.log(`   段名：${doc.segments.map((s) => s.name).join(" / ")}`);
    console.log(`   首行：${doc.lines[0]?.text ?? ""}`);
    process.exit(0);
  }
  console.error("命中的歌都没有歌词");
  process.exit(1);
})();
