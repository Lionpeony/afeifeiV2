import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * 一次性文件访问令牌（50 §11）：渲染层永远拿不到裸路径，
 * 只拿一个会过期的 id，主进程凭 id 换回路径。
 */

const TTL_MS = 30 * 60 * 1000;

/** 只放行音频扩展名。这是最低限度的边界：令牌不能变成任意读文件的通行证。 */
const ALLOWED = new Set([".mp3", ".flac", ".m4a", ".wav", ".opus", ".ogg", ".aac"]);

const byToken = new Map<string, { filePath: string; expires: number }>();
/** 同一路径复用一个令牌，否则切歌几百次这张表会一直涨。 */
const byPath = new Map<string, string>();

export function grant(filePath: string): string | null {
  if (!ALLOWED.has(path.extname(filePath).toLowerCase())) return null;

  const existing = byPath.get(filePath);
  if (existing && byToken.has(existing)) {
    byToken.get(existing)!.expires = Date.now() + TTL_MS;
    return existing;
  }

  const id = randomUUID();
  byToken.set(id, { filePath, expires: Date.now() + TTL_MS });
  byPath.set(filePath, id);
  return id;
}

export function resolveToken(id: string): string | null {
  const hit = byToken.get(id);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    byToken.delete(id);
    byPath.delete(hit.filePath);
    return null;
  }
  return hit.filePath;
}

export function sweep(): void {
  const now = Date.now();
  for (const [id, v] of byToken) {
    if (v.expires < now) {
      byToken.delete(id);
      byPath.delete(v.filePath);
    }
  }
}
