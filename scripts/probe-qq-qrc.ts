/**
 * 探针：QQ 音乐 GetPlayLyricInfo 带 qrc:1 是否回逐字（songMID 直查，不先换 songID）。
 * 跑法：npx tsx scripts/probe-qq-qrc.ts
 */
void (async () => {
  const mids: [string, string][] = [
    ["0039MnYb0qxYhV", "晴天 周杰伦"],
    ["001J5QJL1p0QYQ", "泡沫 G.E.M."],
    ["003aAYrm3GE0Xg", "海阔天空 Beyond"],
  ];
  for (const [mid, name] of mids) {
    const r = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://y.qq.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 Chrome/86.0.4240.198 Safari/537.36",
      },
      body: JSON.stringify({
        comm: { ct: 19, cv: 1873, uin: 0 },
        req: {
          method: "GetPlayLyricInfo",
          module: "music.musichallSong.PlayLyricInfo",
          param: {
            songMID: mid,
            songName: "",
            singerName: "",
            albumName: "",
            interval: 0,
            format: "json",
            crypt: 1,
            ct: 19,
            cv: 1873,
            lrc_t: 0,
            qrc: 1,
            qrc_t: 0,
            roma: 0,
            roma_t: 0,
            trans: 1,
            trans_t: 0,
            type: -1,
          },
        },
      }),
    });
    const body = (await r.json()) as { code?: number; req?: { code?: number; data?: Record<string, unknown> } };
    const data = body.req?.data ?? {};
    const lyric = String(data.lyric ?? "");
    console.log(name, mid, "http=" + r.status, "code=" + body.code + "/" + body.req?.code, "lyric.hex=" + lyric.length, "trans=" + String(data.trans ?? "").length, "qrc 字段=" + String(data.qrc ?? "").length);
    if (lyric) console.log("  密文头:", lyric.slice(0, 48));
  }
})();
