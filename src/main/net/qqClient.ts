/**
 * QQ 音乐通道（匿名接口）。
 *
 * **先验后写（2026-11-02 用 node 直打实测，不靠记忆）**：
 *   - 搜索 `musicu.fcg` DoSearchForQQMusicDesktop：匿名 200 / code 0
 *   - 歌词 `fcg_query_lyric_new.fcg`：匿名 200 / code 0，`nobase64=1` 时 lrc 是明文
 *   - 播放地址 GetEVkey / GetVkey / GetPlayUrl / express_mobile3：匿名全部拿不到 vkey
 *     （code 40000 / 500003 / 104003，要么要 sign 要么要登录）
 *     → getUrl 暂不实现（canGetUrl: false），QQ 真号联调后再开
 */
import { fetchJson } from "./fetchJson.js";

const MUSICU = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const LYRIC = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg";
const QQ_HEADERS = { Referer: "https://y.qq.com/", Origin: "https://y.qq.com" };

/** 收敛接口面：渲染层只能调这几个，与 netease 通道同规矩 */
const ALLOWED = new Set(["search", "lyric"]);

export async function callQq(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!ALLOWED.has(method)) throw new Error(`不允许调用 QQ 接口：${method}`);
  if (method === "search") return qqSearch(params);
  return qqLyric(params);
}

async function qqSearch(params: Record<string, unknown>): Promise<unknown> {
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const body = {
    comm: { ct: 19, cv: 1845 },
    req_1: {
      method: "DoSearchForQQMusicDesktop",
      module: "music.search.SearchCgiService",
      param: {
        search_type: 0,
        query: String(params.keyword ?? "").slice(0, 100),
        page_num: page + 1,
        num_per_page: 30,
      },
    },
  };
  const { json } = await fetchJson(MUSICU, {
    method: "POST",
    headers: { ...QQ_HEADERS, "Content-Type": "application/json" },
    json: body,
  });
  return json;
}

async function qqLyric(params: Record<string, unknown>): Promise<unknown> {
  const songmid = String(params.songmid ?? "");
  if (!/^[0-9A-Za-z]{6,20}$/.test(songmid)) throw new Error("非法 songmid");
  const url =
    `${LYRIC}?songmid=${encodeURIComponent(songmid)}` +
    "&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1";
  const { json } = await fetchJson(url, { headers: QQ_HEADERS });
  return json;
}
