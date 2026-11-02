import type { TrackId } from "../../../contracts/index.js";
import type { KeyValuePort } from "../../../contracts/ports.js";

/**
 * 播放历史（Ring 1）。最多留 300 条，新的在前。
 *
 * 连续播同一首不重复记：单曲循环一晚上会写出几万条一样的记录，
 * 那既不是"历史"也没有任何用途。
 */

const KEY = "history";
const MAX_ENTRIES = 300;

export interface HistoryEntry {
  trackId: TrackId;
  at: number;
}

let entries: HistoryEntry[] = [];
const listeners = new Set<() => void>();

export const getHistory = (): readonly HistoryEntry[] => entries;
export const historyIds = (): TrackId[] => entries.map((e) => e.trackId);

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

/** 唯一写入口：记一次播放。返回是否真的记了。 */
export function pushHistory(trackId: TrackId, at = Date.now()): boolean {
  if (entries[0]?.trackId === trackId) return false; // 连续同一首不重复记

  const next = [{ trackId, at }, ...entries.filter((e) => e.trackId !== trackId)];
  entries = next.slice(0, MAX_ENTRIES);
  notify();
  return true;
}

export function clearHistory(): void {
  if (entries.length === 0) return;
  entries = [];
  notify();
}

export function setHistory(next: HistoryEntry[]): void {
  entries = next.slice(0, MAX_ENTRIES);
  notify();
}

export async function loadHistory(port: KeyValuePort): Promise<number> {
  const raw = await port.read(KEY);
  if (!raw) return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const clean = parsed.filter(
        (x): x is HistoryEntry =>
          !!x && typeof x === "object" && typeof (x as HistoryEntry).trackId === "string",
      );
      setHistory(clean);
    }
  } catch {
    /* 坏文件当没有历史 */
  }
  return entries.length;
}

export async function saveHistory(port: KeyValuePort): Promise<void> {
  await port.write(KEY, JSON.stringify(entries));
}
