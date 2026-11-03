/** 探针：看 LRCLIB 真实返回的格式（逐字标签到底有没有） */
import { searchLrclib } from "../src/renderer/domain/lyrics/fetch-lrclib";

const http = {
  fetchJson: async (url: string) => {
    const r = await fetch(url, { headers: { "User-Agent": "afeifei/0.1 (probe)" } });
    return { status: r.status, json: await r.json().catch(() => null), setCookie: [] as string[] };
  },
};

void (async () => {
  const hits = await searchLrclib(http, { trackName: "Shape of You" });
  console.log("命中条数:", hits.length);
  const s = hits[0]?.syncedLyrics ?? "";
  console.log("syncedLyrics 前 300 字：");
  console.log(JSON.stringify(s.slice(0, 300)));
  console.log("含逐字标签 <>:", /<[^>]+>/.test(s));
  console.log("含 QRC 风格 [start,dur]:", /\[\d+,\d+\]/.test(s));
  const withAngle = hits.filter((h) => /<[^>]+>/.test(h.syncedLyrics ?? ""));
  console.log(`${hits.length} 条里有逐字标签的: ${withAngle.length}`);
  if (withAngle[0]) console.log("样例:", JSON.stringify(withAngle[0].syncedLyrics!.slice(0, 300)));
})();
