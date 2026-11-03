/**
 * 探针：网易云搜索 + 歌词接口的真实返回（重点看 klyric 是不是 YRC 逐字）。
 * 跑法：npx tsx scripts/probe-netease.ts
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function getJson(url: string, cookie?: string): Promise<any> {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: "https://music.163.com/",
      Accept: "application/json, text/plain, */*",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const t = await r.text();
  try {
    return { status: r.status, json: JSON.parse(t) };
  } catch {
    return { status: r.status, json: null, head: t.slice(0, 200) };
  }
}

/** 匿名 cookie：网易云的 NMTID */
const ANON_COOKIE = `NMTID=${Math.random().toString(36).slice(2, 14).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;

void (async () => {
  const q = encodeURIComponent("老人と海 ヨルシカ");
  const s = await getJson(
    `https://music.163.com/api/search/get?s=${q}&type=1&limit=6&offset=0`,
  );
  console.log("搜索状态:", s.status);
  const songs = s.json?.result?.songs ?? [];
  console.log("命中:", songs.length);
  songs.slice(0, 5).forEach((x: any) =>
    console.log(`  ${x.id}  ${x.name} / ${(x.artists ?? []).map((a: any) => a.name).join(",")}  ${x.duration}ms`),
  );
  if (!songs.length) {
    console.log("响应头部:", s.head ?? "");
    process.exit(1);
  }

  /* 批量找有 klyric（逐字）的歌：逐字库主要覆盖华语流行 */
  const probes: [string, string][] = [
    ["晴天", "周杰伦"],
    ["江南", "林俊杰"],
    ["演员", "薛之谦"],
    ["消愁", "毛不易"],
    ["稻香", "周杰伦"],
    ["起风了", "买辣椒也用券"],
    ["漠河舞厅", "柳爽"],
    ["海阔天空", "Beyond"],
    ["光辉岁月", "Beyond"],
    ["Lemon", "米津玄師"],
  ];
  console.log("\n— 找有逐字（klyric）的歌 —");
  for (const [track, artist] of probes) {
    const q2 = encodeURIComponent(`${track} ${artist}`);
    const s2 = await getJson(`https://music.163.com/api/search/get?s=${q2}&type=1&limit=3&offset=0`);
    const list = s2.json?.result?.songs ?? [];
    for (const song of list.slice(0, 2)) {
      const l2 = await getJson(
        `https://music.163.com/api/song/lyric?os=pc&id=${song.id}&lv=1&kv=1&tv=-1`,
      );
      const k = l2.json?.klyric?.lyric ?? "";
      const lr = l2.json?.lrc?.lyric ?? "";
      console.log(
        `  ${String(song.id).padEnd(12)} ${song.name} / ${(song.artists ?? []).map((a: any) => a.name).join(",")}` +
          `  klyric=${String(k.length).padStart(5)} lrc=${String(lr.length).padStart(5)}` +
          (k ? `  逐字✓ 样例:${JSON.stringify(k.slice(0, 120))}` : ""),
      );
    }
  }
})();
