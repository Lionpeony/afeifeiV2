/**
 * 下载的执行器（M7）：订阅 store，把状态机驱成真实的字节流。
 *
 * 职责边界：
 *   - 并发/重试/配额的**策略**在 queue.ts（纯函数，可测）；
 *   - store 只记状态机转移（I2 单写者）；
 *   - 进度**不逐条进 store**——runner 手里攒着，每 500ms 节流 flush 一次
 *     （docs/04 M7 走偏表第一条）；
 *   - 完成 → `recordOp` 入曲库索引 + 内存曲库 upsert——本地播放链路零新代码。
 */
import type { DownloadItem } from "../../../contracts/index.js";
import type { DownloadPort, KeyValuePort, LibraryPort } from "../../../contracts/ports.js";
import { trackIdOf } from "../library/schema.js";
import { recordOp } from "../library/scan.js";
import { getTracks, setTracks } from "../library/state.js";
import { dispatch, getState, subscribe } from "../../kernel/index.js";
import {
  backoffMs,
  MAX_ACTIVE,
  oldestDone,
  overQuota,
  QUOTA_BYTES,
  retryDecision,
  sanitizeForRestore,
} from "./queue.js";

const FLUSH_MS = 500;
const SAVE_KEY = "downloads";

export interface DownloadRunnerDeps {
  port: DownloadPort;
  library: LibraryPort;
  kv: KeyValuePort;
  /** 拿播放直链（下载与播放同源：同一个 getUrl，CDN 直链有时效，启动时才取） */
  resolveUrl(sourceId: string, songId: string): Promise<string>;
}

export function startDownloadRunner(deps: DownloadRunnerDeps): () => void {
  const { port, library, kv, resolveUrl } = deps;
  const starting = new Set<string>();
  /** 进度攒在这里，500ms 一笔进 store（docs/04 M7 走偏表：进度每毫秒进 store = 走偏） */
  const pending = new Map<string, { received: number; total: number; lastReceived: number; lastAt: number }>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---- 启动恢复：KV 里的任务清单位读回，active 落回 queued（.part 还在，续传靠它） ---- */
  void (async () => {
    try {
      const raw = await kv.read(SAVE_KEY);
      if (raw) {
        const items = sanitizeForRestore(JSON.parse(raw));
        if (items.length > 0) dispatch({ type: "download/restore", items });
      }
    } catch {
      /* 坏快照当没有 */
    }
    pump();
  })();

  const scheduleSave = (): void => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void kv.write(SAVE_KEY, JSON.stringify(getState().download.items)).catch(() => undefined);
    }, 1000);
  };

  const items = (): DownloadItem[] => getState().download.items;
  const byId = (id: string): DownloadItem | undefined => items().find((i) => i.id === id);

  const flushProgress = (): void => {
    const now = performance.now();
    for (const [id, p] of pending) {
      const dt = (now - p.lastAt) / 1000;
      const speed = dt > 0 ? Math.max(0, (p.received - p.lastReceived) / dt) : 0;
      dispatch({ type: "download/progress", id, received: p.received, total: p.total, speed });
      p.lastReceived = p.received;
      p.lastAt = now;
    }
    // 没变化的条目清掉，免得 Map 无限长
    for (const id of pending.keys()) {
      const item = byId(id);
      if (!item || item.state !== "active") pending.delete(id);
    }
  };

  /** 配额（I5）：超了就按"最旧先删"淘汰 done，直到装得下或没得删。 */
  const makeRoom = async (incomingBytes: number): Promise<boolean> => {
    let usage = await port.usage();
    while (overQuota(usage, incomingBytes)) {
      const victim = oldestDone(items());
      if (!victim) return false; // 没有可淘汰的：让调用方报"空间不足"
      await port.remove(victim.destPath).catch(() => undefined);
      dispatch({ type: "download/remove", id: victim.id });
      usage = await port.usage();
    }
    return true;
  };

  const start = async (item: DownloadItem): Promise<void> => {
    starting.add(item.id);
    dispatch({ type: "download/start", id: item.id });
    try {
      // total 已知才做配额预判；未知（上游没给长度）只能事后失败
      if (item.total > 0) {
        const usage = await port.usage();
        if (overQuota(usage, item.total - item.received, QUOTA_BYTES)) {
          const ok = await makeRoom(item.total - item.received);
          if (!ok) {
            dispatch({
              type: "download/fail",
              id: item.id,
              requeue: false,
              error: "下载空间不足（上限 2GB），请在「下载」页清理已完成的项目",
            });
            return;
          }
        }
      }

      const url = await resolveUrl(item.sourceId, item.songId);
      pending.set(item.id, {
        received: item.received,
        total: item.total,
        lastReceived: item.received,
        lastAt: performance.now(),
      });
      const { bytes } = await port.fetch(item.id, url, item.destPath, (received, total) => {
        pending.set(item.id, { received, total, lastReceived: received, lastAt: performance.now() });
      });
      pending.delete(item.id);
      dispatch({ type: "download/done", id: item.id });
      void ingestToLibrary(item, bytes);
    } catch (err) {
      pending.delete(item.id);
      const msg = err instanceof Error ? err.message : String(err);
      const cur = byId(item.id);
      // 暂停/取消后的 reject 不是失败——状态机已经先转移了
      if (!cur || (cur.state !== "active" && cur.state !== "queued")) return;
      const decision = retryDecision(cur);
      dispatch({ type: "download/fail", id: item.id, error: msg, requeue: decision === "requeue" });
      if (decision === "requeue") {
        setTimeout(() => pump(), backoffMs(cur.tries + 1));
      }
    } finally {
      starting.delete(item.id);
      setTimeout(pump, 0);
    }
  };

  /** 下载完成 → 曲库可见（M7 判据：不入库的文件不播）。本地播放链路零新代码。 */
  const ingestToLibrary = async (item: DownloadItem, bytes: number): Promise<void> => {
    try {
      const metas = await library.readTags([item.destPath]);
      const meta = metas[0];
      const track = {
        id: trackIdOf(item.destPath),
        path: item.destPath,
        title: meta?.title || item.title,
        artist: meta?.artist || "未知歌手",
        album: meta?.album || "在线下载",
        durationMs: meta?.durationMs ?? 0,
        size: meta?.size ?? bytes,
        mtimeMs: meta?.mtimeMs ?? Date.now(),
        hasCover: meta?.hasCover ?? false,
      };
      await recordOp(library, { op: "upsert", track });
      setTracks([...getTracks().filter((t) => t.id !== track.id), track]);
    } catch {
      // 标签解析失败也入库不了就先不入——文件在磁盘上，重扫描仍会把它收进来
      void bytes;
    }
  };

  function pump(): void {
    flushProgress();
    while (activeCountOf() < MAX_ACTIVE) {
      const next = nextQueuedOf();
      if (!next || starting.has(next.id)) break;
      void start(next);
    }
    scheduleSave();
  }

  const activeCountOf = (): number => items().filter((i) => i.state === "active").length;
  const nextQueuedOf = (): DownloadItem | null =>
    items().find((i) => i.state === "queued" && !starting.has(i.id)) ?? null;

  const progressTimer = setInterval(flushProgress, FLUSH_MS);
  const unsubscribe = subscribe(() => {
    // 暂停/重新排队 = 断开在途连接（.part 留着）。abort 幂等，未知 id 静默。
    for (const i of items()) {
      if ((i.state === "paused" || i.state === "queued") && pending.has(i.id)) port.cancel(i.id);
    }
    scheduleSave();
    pump();
  });

  // runner 与应用同生命周期；挂这套钩子是为了测试里能干净拆除
  return () => {
    clearInterval(progressTimer);
    unsubscribe();
  };
}
