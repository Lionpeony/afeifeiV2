/**
 * 探针：匿名登录（/register/anonimous）→ 拿 cookie → 再试 klyric。
 * 判断「逐字需要登录态」这个假设是否成立。
 * 跑法：npx tsx scripts/probe-netease-anon.ts
 */
import crypto from "node:crypto";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function postForm(url: string, form: Record<string, string>): Promise<{ status: number; json: any; cookies: string[] }> {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Referer: "https://music.163.com/",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  return { status: r.status, json: await r.json().catch(() => null), cookies };
}

async function getJson(url: string, cookie?: string): Promise<any> {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: "https://music.163.com/",
      Accept: "application/json, text/plain, */*",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

void (async () => {
  /* 1. 匿名登录 */
  const rand = String(Math.random()).slice(2, 10);
  const pwd = crypto.createHash("md5").update(rand).digest("hex");
  const anon = await postForm("https://music.163.com/register/anonimous", {
    username: rand,
    password: pwd,
    rememberLogin: "true",
  });
  console.log("匿名登录状态:", anon.status, "code:", anon.json?.code);
  const setCookies = anon.cookies.join("; ");
  const musicU = /MUSIC_U=([^;]+)/.exec(setCookies)?.[1];
  console.log("拿到 MUSIC_U:", musicU ? `${musicU.slice(0, 12)}…(${musicU.length})` : "无");
  if (!musicU) {
    console.log("Set-Cookie 原文（前 300）：", setCookies.slice(0, 300));
  }
  const cookie = musicU ? `MUSIC_U=${musicU}` : undefined;

  /* 2. 用匿名 cookie 调歌词接口，看 klyric 是否出现 */
  const probes: [string, string][] = [
    ["漠河舞厅", "柳爽"],
    ["晴天", "周杰伦"],
    ["起风了", "买辣椒也用券"],
  ];
  for (const [track, artist] of probes) {
    const q = encodeURIComponent(`${track} ${artist}`);
    const s = await getJson(
      `https://music.163.com/api/search/get?s=${q}&type=1&limit=2&offset=0`,
      cookie,
    );
    const song = s.json?.result?.songs?.[0];
    if (!song) {
      console.log(`  ${track}: 搜索无结果`);
      continue;
    }
    const l = await getJson(
      `https://music.163.com/api/song/lyric?os=pc&id=${song.id}&lv=1&kv=1&tv=-1`,
      cookie,
    );
    const k = l.json?.klyric?.lyric ?? "";
    const lr = l.json?.lrc?.lyric ?? "";
    console.log(
      `  ${song.name} / ${(song.artists ?? []).map((a: any) => a.name).join(",")}` +
        `  klyric=${String(k.length).padStart(5)} lrc=${String(lr.length).padStart(5)}` +
        (k ? `  逐字✓ 样例:${JSON.stringify(k.slice(0, 100))}` : ""),
    );
  }
})();
