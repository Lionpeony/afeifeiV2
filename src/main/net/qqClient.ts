/**
 * QQ 音乐通道（M6.1：搜索/歌词匿名 + getUrl 登录态）。
 *
 * **先验后写（2026-11-02 node 直打实测，2026-11-03 补登录态方案）**：
 *   - 搜索 `musicu.fcg` DoSearchForQQMusicDesktop：匿名 200 / code 0
 *   - 歌词 `fcg_query_lyric_new.fcg`：匿名 200 / code 0，`nobase64=1` 时 lrc 是明文
 *   - 播放地址：匿名全拿不到 vkey（40000/500003/104003）→ 登录态走 GetEVkey，
 *     cookie 由 session 自动携带（登录见 main/net/qqSession.ts）
 */
import { fetchJson } from "./fetchJson.js";

const MUSICU = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const LYRIC = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg";
const QQ_HEADERS = { Referer: "https://y.qq.com/", Origin: "https://y.qq.com" };
/** QQ 专属会话分区（M6 P0）：登录 cookie 与网易云等其它源彻底隔离，persist: 前缀跨重启保留。 */
export const QQ_PARTITION = "persist:qq-login";

/** 收敛接口面：渲染层只能调这几个，与 netease 通道同规矩 */
const ALLOWED = new Set(["search", "lyric", "url"]);

/** 音质前缀：128k=M500、320k=M800（flac=F000 暂不放开，qualities 只声明到 320k）。 */
function filePrefix(quality: string): string {
  return quality === "320k" ? "M800" : "M500";
}

export async function callQq(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!ALLOWED.has(method)) throw new Error(`不允许调用 QQ 接口：${method}`);
  if (method === "search") return qqSearch(params);
  if (method === "url") return qqUrl(params);
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
    partition: QQ_PARTITION,
  });
  return json;
}

async function qqLyric(params: Record<string, unknown>): Promise<unknown> {
  const songmid = String(params.songmid ?? "");
  if (!/^[0-9A-Za-z]{6,20}$/.test(songmid)) throw new Error("非法 songmid");
  const url =
    `${LYRIC}?songmid=${encodeURIComponent(songmid)}` +
    "&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1";
  const { json } = await fetchJson(url, { headers: QQ_HEADERS, partition: QQ_PARTITION });
  return json;
}

/** 登录态取 vkey。未登录时上游不给 vkey —— 调用方（渲染层 capability）负责把错误翻译成人话。 */
async function qqUrl(params: Record<string, unknown>): Promise<unknown> {
  const songmid = String(params.songmid ?? "");
  if (!/^[0-9A-Za-z]{6,20}$/.test(songmid)) throw new Error("非法 songmid");
  const quality = String(params.quality ?? "128k");
  const prefix = filePrefix(quality);
  const filename = `${prefix}${songmid}.mp3`;
  const body = {
    comm: { uin: 0, format: "json", ct: 24, cv: 0 },
    req: {
      module: "music.vkey.GetEVkey",
      method: "GetEVkey",
      param: {
        guid: "1234567890",
        song_mid: songmid,
        song_id: 0,
        filename: [filename],
        songtype: [0],
        uin: 0,
        loginflag: 1,
        platform: "20",
      },
    },
  };
  const { json } = await fetchJson(MUSICU, {
    method: "POST",
    headers: { ...QQ_HEADERS, "Content-Type": "application/json" },
    json: body,
    partition: QQ_PARTITION,
  });
  return json;
}
