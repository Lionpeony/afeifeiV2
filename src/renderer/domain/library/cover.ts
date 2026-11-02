import type { LibraryPort } from "../../../contracts/ports.js";

/**
 * 封面缓存的渲染层那一半。
 *
 * LRU 上限 200：可视区最多几十行，200 足够覆盖反复滚动，
 * 再多就是拿内存换一点点命中率（每张 160px 的 dataURL 约 20KB，200 张 ≈ 4MB）。
 */

const MAX = 200;
const byId = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

/** 已缓存则直接返回（undefined = 还没请求过；null = 确实没有封面）。 */
export function peekCover(id: string): string | null | undefined {
  return byId.get(id);
}

function remember(id: string, url: string | null): void {
  if (byId.size >= MAX) {
    const oldest = byId.keys().next();
    if (!oldest.done) byId.delete(oldest.value);
  }
  byId.set(id, url);
}

/** 同一张图并发请求只发一次 —— 快速滚动时同一行会被挂载两次。 */
export async function loadCover(port: LibraryPort, id: string, path: string): Promise<string | null> {
  const hit = byId.get(id);
  if (hit !== undefined) return hit;

  const inflight = pending.get(id);
  if (inflight) return inflight;

  const task = port
    .cover(path)
    .then((url) => {
      remember(id, url);
      pending.delete(id);
      return url;
    })
    .catch(() => {
      pending.delete(id);
      return null;
    });

  pending.set(id, task);
  return task;
}
