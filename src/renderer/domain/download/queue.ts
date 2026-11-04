/**
 * 下载队列的策略纯函数（M7，00 §2.1：下载是业务，全在环 1）。
 *
 * store（kernel）只做状态机转移；**调度策略**——并发上限、重试退避、
 * 磁盘配额与淘汰顺序——全在这里，能穷举单测（M7 判据：单测 ≥ 15 项）。
 * 参数写死不是形容词：并发 ≤2、重试 3 次、配额 2GB、淘汰最旧优先（00 §6.3）。
 */
import type { DownloadItem, DownloadState } from "../../../contracts/index.js";

export const MAX_ACTIVE = 2;
export const MAX_TRIES = 3;
/** 磁盘预算（I5）：默认 2GB。要改先改 00 §6.3 的表。 */
export const QUOTA_BYTES = 2 * 1024 * 1024 * 1024;

export const activeCount = (items: DownloadItem[]): number =>
  items.filter((i) => i.state === "active").length;

/** 下一个该启动的任务：最早的 queued；并发占满或没有时为 null。 */
export function nextQueued(items: DownloadItem[]): DownloadItem | null {
  if (activeCount(items) >= MAX_ACTIVE) return null;
  return items.find((i) => i.state === "queued") ?? null;
}

/**
 * 失败后的去向：tries+1 < MAX_TRIES → 重新排队（退避由 runner 算延时），否则落 error。
 * received 保留——重试从 .part 续传，不从头来。
 */
export function retryDecision(item: DownloadItem): "requeue" | "error" {
  return item.tries + 1 < MAX_TRIES ? "requeue" : "error";
}

/** 重试退避延时（毫秒）：第 n 次重试等 2^n 秒（1s、2s、4s…），封顶 30s。 */
export function backoffMs(tries: number): number {
  return Math.min(30_000, 2 ** Math.max(0, tries) * 1000);
}

/** 队列里按"最旧优先"挑一个可淘汰的 done 任务（active/queued/paused 不动）。 */
export function oldestDone(items: DownloadItem[]): DownloadItem | null {
  return items.find((i) => i.state === "done") ?? null;
}

/**
 * 「刚刚下完」：只认 active → done 这一步。
 * 启动时从 KV 恢复的 done 条目不算——它们早就下完了，不该再弹一次系统通知。
 */
export function justFinished(prev: DownloadItem[], next: DownloadItem[]): DownloadItem | null {
  return (
    next.find((i) => i.state === "done" && prev.some((p) => p.id === i.id && p.state === "active")) ?? null
  );
}

/**
 * 配额判定（I5）：已用 + 这个任务还要写的字节数 是否超预算。
 * total 为 0（上游没给长度）时按 0 计——无法预判的只能事后失败。
 */
export function overQuota(usageBytes: number, incomingBytes: number, cap = QUOTA_BYTES): boolean {
  return usageBytes + incomingBytes > cap;
}

/** 状态里允许持久化的形态：恢复时 active 一律落回 queued（进程死了，.part 还在）。 */
export function sanitizeForRestore(items: DownloadItem[]): DownloadItem[] {
  return items
    .filter((i) => i.state !== "error" || !!i.error) // error 必须带原因，坏数据直接丢
    .map((i) => ({
      ...i,
      state: (i.state === "active" || i.state === "queued" ? "queued" : i.state) as DownloadState,
      speed: 0,
    }));
}

/** 把任意外来数据（KV 读回）压成合法 DownloadItem 列表：坏条目丢弃，不抛。 */
export function restoreItems(raw: unknown): DownloadItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DownloadItem[] = [];
  for (const x of raw) {
    const i = x as Partial<DownloadItem>;
    if (
      typeof i.id === "string" &&
      typeof i.sourceId === "string" &&
      typeof i.songId === "string" &&
      typeof i.title === "string" &&
      typeof i.destPath === "string" &&
      typeof i.received === "number" &&
      typeof i.total === "number" &&
      typeof i.tries === "number"
    ) {
      out.push({
        id: i.id,
        sourceId: i.sourceId,
        songId: i.songId,
        title: i.title,
        destPath: i.destPath,
        state: i.state === "done" || i.state === "paused" || i.state === "error" ? i.state : "queued",
        received: i.received,
        total: i.total,
        tries: i.tries,
        speed: 0,
        error: typeof i.error === "string" ? i.error : null,
      });
    }
  }
  return out;
}

/** 进度收敛：received 不越过 total（total 未知时放行），负数归零。 */
export function clampProgress(received: number, total: number): { received: number; total: number } {
  const r = Number.isFinite(received) && received > 0 ? received : 0;
  const t = Number.isFinite(total) && total > 0 ? total : 0;
  return { received: t > 0 ? Math.min(r, t) : r, total: t };
}
