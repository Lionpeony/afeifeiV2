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
  /* 在线直链/内联图不进主进程读文件：port.cover 只认本地路径，
     https 与 data: 送进去必 null（底栏只剩占位而 hero 有图的根因，2026-11-12 实锤）。
     CSP img-src 已放开 https/http 与 data，渲染层直接可用。
     不占 LRU 坑位——地址稳定且浏览器自带缓存，坑位留给真正要解析的本地封面。 */
  if (/^(https?:|data:)/i.test(path)) return path;

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
