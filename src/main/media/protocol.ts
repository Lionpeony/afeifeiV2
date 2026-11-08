import fs from "node:fs";
import { Readable } from "node:stream";
import { net, protocol } from "electron";
import { resolveToken } from "./tokens.js";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
};

function mimeOf(filePath: string): string {
  return MIME[filePath.slice(filePath.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";
}

/** 与其他 scheme 一次性注册（多次调用会互相覆盖，见 host/index.ts 的说明）。
    corsEnabled：封面取色（tint-client）用 crossOrigin 采样，响应必须允许跨源，
    否则本地封面的 canvas 一样被污染，取色永远静默失败。 */
export const MEDIA_SCHEME = {
  scheme: "appmedia",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
} as const;

/** 必须在 app ready 之后调用。 */
export function registerMediaProtocol(): void {
  protocol.handle("appmedia", async (request) => {
    // appmedia://<token> —— token 是 UUID，URL 会把 hostname 转小写，正好匹配
    const token = new URL(request.url).hostname;
    const filePath = resolveToken(token);
    if (!filePath) return new Response("token expired", { status: 410 });

    let size = 0;
    try {
      size = (await fs.promises.stat(filePath)).size;
    } catch {
      return new Response("not found", { status: 404 });
    }

    const type = mimeOf(filePath);
    const range = request.headers.get("range");

    // 没有 Range 就整块读；有 Range 就 206 —— 拖进度条必须有它，否则一拖就卡住
    if (!range) {
      const body = await fs.promises.readFile(filePath);
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": type,
          "content-length": String(size),
          "accept-ranges": "bytes",
          "access-control-allow-origin": "*",
        },
      });
    }

    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Number(m[2]) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response("bad range", { status: 416, headers: { "content-range": `bytes */${size}` } });
    }

    const stream = fs.createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "content-type": type,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1),
        "accept-ranges": "bytes",
        "access-control-allow-origin": "*",
      },
    });
  });
}

/** 与其他 scheme 一次性注册（见 main/index.ts 的说明）。 */
export const STREAM_SCHEME = {
  scheme: "appstream",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
} as const;

/**
 * 远端音频必须走本代理：直连的跨源 http 流没有 CORS 头，
 * 进 MediaElementSource（EQ/频谱图）会被 Chromium 消成静音——表现正是
 * 「进度条在走但没声音」。appstream 是自家特权协议，无跨源问题。
 *
 * 编码格式：`appstream://<hex(utf8(远端地址))>`。用 hex 是因为 URL host
 * 会被转小写，base64url 大小写敏感会损坏；hex 全小写安全。
 * 渲染层的编码端在 renderer/capability/audio/streamSrc.ts，改格式两边一起改。
 */
export function registerStreamProtocol(): void {
  protocol.handle("appstream", async (request) => {
    const host = new URL(request.url).hostname;
    let remote = "";
    try {
      remote = Buffer.from(host, "hex").toString("utf8");
    } catch {
      return new Response("bad stream url", { status: 400 });
    }
    if (!/^https?:\/\//i.test(remote)) return new Response("bad stream url", { status: 400 });

    const range = request.headers.get("range");
    try {
      // 在主进程转发：Range 透传（拖进度条必须有），cookie 不带（CDN 直链用不上）
      const upstream = await net.fetch(remote, range ? { headers: { range } } : {});
      const headers = new Headers();
      for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const v = upstream.headers.get(name);
        if (v) headers.set(name, v);
      }
      if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch {
      return new Response("upstream fetch failed", { status: 502 });
    }
  });
}
