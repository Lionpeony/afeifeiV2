import type { AppState } from "../../contracts/index.js";
import type { StoragePort } from "../../contracts/ports.js";

/**
 * 状态持久化（50 §4.3）。写盘节流 1s —— 所以重启后位置允许有 1s 误差，
 * 这条误差是设计好的，不是 bug（50 §18 第 7 条）。
 */

const VERSION = 1;

interface Snapshot {
  v: number;
  trackId: string | null;
  positionMs: number;
  volume: number;
  queue: AppState["queue"];
}

export interface Persister {
  restore(): Promise<Snapshot | null>;
  schedule(get: () => AppState, positionOf: () => number): void;
  flush(get: () => AppState, positionOf: () => number): Promise<void>;
}

export function createPersister(port: StoragePort, delayMs = 1000): Persister {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reading: { get: () => AppState; positionOf: () => number } | null = null;

  const serialize = (get: () => AppState, positionOf: () => number): string => {
    const s = get();
    const snap: Snapshot = {
      v: VERSION,
      trackId: s.player.trackId,
      positionMs: Math.round(positionOf()),
      volume: s.player.volume,
      queue: s.queue,
    };
    return JSON.stringify(snap);
  };

  return {
    async restore(): Promise<Snapshot | null> {
      const raw = await port.load();
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Snapshot;
        if (parsed.v !== VERSION) return null; // 版本不符就当没存过，M2 会补迁移器
        return parsed;
      } catch {
        return null; // 半截文件不该让应用起不来
      }
    },

    schedule(get, positionOf): void {
      reading = { get, positionOf };
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const r = reading;
        if (!r) return;
        void port.save(serialize(r.get, r.positionOf));
      }, delayMs);
    },

    async flush(get, positionOf): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await port.save(serialize(get, positionOf));
    },
  };
}
