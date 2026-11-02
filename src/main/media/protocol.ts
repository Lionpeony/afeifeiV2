import fs from "node:fs";
import { Readable } from "node:stream";
import { protocol } from "electron";
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

/** 与其他 scheme 一次性注册（多次调用会互相覆盖，见 host/index.ts 的说明）。 */
export const MEDIA_SCHEME = {
  scheme: "appmedia",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
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
        headers: { "content-type": type, "content-length": String(size), "accept-ranges": "bytes" },
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
      },
    });
  });
}
