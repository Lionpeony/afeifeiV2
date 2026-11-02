/**
 * QQ 音乐通道（M6.1 P1）：全部走本地 `qqBackend` 服务的 HTTP 接口。
 *
 * 协议细节（扫码/登录态/vkey/签名）都在 `@yakult-green-tea/qq-music-api` 包内，
 * 这里只做「转发 + 数据归一化」。接口路径与参数为 2026-11-03 实测确认：
 *   - 搜索 `/search?keyword=&page=&limit=`（字段：mid/name/singer[]/album.mid|title）
 *   - 歌词 `/getLyric?songmid=`（`response.lyric` 为 LRC 文本）
 *   - 播放 `/getMusicPlay/:songmid`（未登录/无版权 → `data.playUrl[mid].url` 为空）
 *   - 扫码 `/login/qr/key` → `/login/qr/create?key=&channel=qq` → `/login/qr/check?key=`（801=未扫）
 */
import { fetchJson } from "./fetchJson.js";
import { qqApiUrl } from "./qqBackend.js";

interface QqBody {
  code?: number;
  message?: string;
  data?: unknown;
  response?: unknown;
}

async function callApi<T = QqBody>(pathAndQuery: string): Promise<T> {
  const { json } = await fetchJson(`${qqApiUrl()}${pathAndQuery}`);
  return json as T;
}

/** 渲染层可见的接口面：与旧实现同名，底层换服务。 */
const ALLOWED = new Set(["search", "lyric", "url", "qrStart", "qrPoll", "status", "logout"]);

export async function callQq(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!ALLOWED.has(method)) throw new Error(`不允许调用 QQ 接口：${method}`);
  switch (method) {
    case "search":
      return qqSearch(params);
    case "lyric":
      return qqLyric(params);
    case "url":
      return qqUrl(params);
    case "qrStart":
      return qqQrStart();
    case "qrPoll":
      return qqQrPoll();
    case "status":
      return qqStatus();
    case "logout":
      return callApi("/logout");
    default:
      throw new Error(`QQ 接口未实现：${method}`);
  }
}

/* ---------- 搜索 ---------- */

async function qqSearch(params: Record<string, unknown>): Promise<unknown> {
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const keyword = String(params.keyword ?? "").slice(0, 100);
  return callApi(`/search?keyword=${encodeURIComponent(keyword)}&page=${page + 1}&limit=30`);
}

/* ---------- 歌词 ---------- */

async function qqLyric(params: Record<string, unknown>): Promise<unknown> {
  const songmid = String(params.songmid ?? "");
  if (!/^[0-9A-Za-z]{6,20}$/.test(songmid)) throw new Error("非法 songmid");
  return callApi(`/getLyric?songmid=${encodeURIComponent(songmid)}`);
}

/* ---------- 播放地址（登录态） ---------- */

interface QqPlayBody {
  code?: number;
  data?: { playUrl?: Record<string, { url?: unknown; error?: unknown }> };
}

async function qqUrl(params: Record<string, unknown>): Promise<unknown> {
  const songmid = String(params.songmid ?? "");
  if (!/^[0-9A-Za-z]{6,20}$/.test(songmid)) throw new Error("非法 songmid");
  return callApi<QqPlayBody>(`/getMusicPlay/${encodeURIComponent(songmid)}`);
}

/* ---------- 扫码登录（包内三件套，语义与网易云对齐） ---------- */

async function qqQrStart(): Promise<unknown> {
  const keyBody = await callApi<{ code?: number; data?: { unikey?: string } }>("/login/qr/key");
  const key = keyBody?.data?.unikey;
  if (!key) throw new Error("获取二维码失败");
  // create 返回 data.qrimg = dataURL（2026-11-03 实测，channel=qq/wechat 均验证）
  const create = await callApi<{ code?: number; data?: { qrimg?: string } }>(
    `/login/qr/create?key=${encodeURIComponent(key)}&channel=qq`,
  );
  const qrImage = create?.data?.qrimg ?? "";
  if (!qrImage) throw new Error("QQ 登录页没有给出二维码");
  return { key, qrImage };
}

async function qqQrPoll(): Promise<unknown> {
  return callApi("/login/qr/check");
}

/* ---------- 登录态 ---------- */

async function qqStatus(): Promise<unknown> {
  return callApi("/login/status");
}
