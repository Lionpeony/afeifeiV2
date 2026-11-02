import { net } from "electron";
import { log } from "../log/index.js";

/**
 * 主进程的网络出口（50 §2：环 0–4 不许直接碰网络）。
 *
 * 用 Electron 的 `net.fetch` 而不是 Node 的 `fetch`：它走 Chromium 网络栈，
 * **自动带上 session 里的 cookie**。网易云扫码登录成功后 Set-Cookie 写进 session，
 * 后续所有请求就都带着登录态了 —— 不需要自己实现 CookieJar。
 */

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  /** application/x-www-form-urlencoded 的字段 */
  form?: Record<string, string | number | boolean>;
  /** 直接以 JSON 发出的请求体（QQ 的 musicu.fcg 只认 JSON body）。与 form 互斥，json 优先。 */
  json?: unknown;
  /** 额外请求头。**不要在这里塞 Cookie** —— Chromium 会忽略，cookie 只能走 session。 */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface FetchJsonResult {
  status: number;
  json: unknown;
  /** 响应头里的 set-cookie，登录接口要用 */
  setCookie: string[];
}

const DEFAULT_TIMEOUT = 15000;

/** 只放行 https，且不接受超长 URL —— 渲染层可信，但信任边界仍要校验。 */
function validate(url: string): void {
  if (typeof url !== "string" || url.length === 0 || url.length > 4096) {
    throw new Error("非法 URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`非法 URL：${url.slice(0, 80)}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`只允许 https：${parsed.protocol}`);
  }
}

export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<FetchJsonResult> {
  validate(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT);

  try {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { ...(options.headers ?? {}) };

    let body: string | undefined;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers["content-type"] = "application/json";
    } else if (options.form) {
      body = new URLSearchParams(
        Object.entries(options.form).map(([k, v]) => [k, String(v)]),
      ).toString();
      headers["content-type"] = "application/x-www-form-urlencoded";
    }

    const response = await net.fetch(url, { method, headers, body, signal: controller.signal });

    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // 不是 JSON 就交给上层判断（登录接口可能返回空体）
      json = null;
    }

    const setCookie = response.headers.getSetCookie?.() ?? [];

    if (!response.ok) {
      log("warn", `[net] HTTP ${response.status} ${url.slice(0, 120)}`);
    }

    return { status: response.status, json, setCookie };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error("timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
