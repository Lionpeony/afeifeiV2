import fs from "node:fs/promises";
import path from "node:path";
import { protocol } from "electron";

/**
 * 用自定义协议 `app://` 提供界面资源，不用 file://。
 *
 * 原因很实际：file:// 页面的 origin 是 opaque，CSP 里的 `'self'` 匹配不到任何 URL，
 * 于是 `<script src="app.js">` 被静默拦掉 —— 窗口一片空白，控制台还看不出原因。
 * 换成 standard scheme 之后 'self' 就是 `app://afeifei`，CSP 才真正起作用。
 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * 必须在 app ready 之前、与其他 scheme **一次性**注册。
 * `registerSchemesAsPrivileged` 多次调用会互相覆盖 —— 分两次写会让后一次抹掉前一次的特权，
 * 症状是页面 HTML 能加载、`<script src>` 却被静默拦掉。
 */
export const APP_SCHEME = {
  scheme: "app",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
} as const;

/** 必须在 app ready 之后调用。 */
export function registerAppProtocol(rootDir: string): void {
  const root = path.resolve(rootDir);

  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(path.join(root, rel));

    // 目录穿越（app://afeifei/../../..）必须挡住
    if (!file.startsWith(root)) return new Response("forbidden", { status: 403 });

    try {
      const body = await fs.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      return new Response(body, { headers: { "content-type": type } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}
