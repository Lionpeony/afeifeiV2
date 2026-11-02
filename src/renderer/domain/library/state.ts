import type { TrackId } from "../../../contracts/index.js";
import { matchKey, scoreKey, searchKeyOf, type SearchKey } from "../search/pinyin.js";
import type { Track } from "./schema.js";

/**
 * 曲库状态（Ring 1）。与 kernel 的播放状态是两个域，各自一个写者：
 * 播放状态的写入口是 dispatch，曲库的写入口是 setTracks / setQuery。
 *
 * 5000 条不进 kernel store —— 那个 store 每次变化都通知所有订阅者，
 * 而曲库只需要"列表变了"和"搜索词变了"两个通知。
 */

let all: Track[] = [];
let keys = new Map<TrackId, SearchKey>();
let query = "";
let filtered: Track[] = [];

const listeners = new Set<() => void>();

export const getTracks = (): Track[] => all;
export const getFiltered = (): Track[] => filtered;
export const getQuery = (): string => query;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

/** 唯一写入口：只在扫描完成或启动恢复时调用。 */
export function setTracks(next: Track[]): void {
  all = next;
  keys = new Map(next.map((t) => [t.id, searchKeyOf(t)]));
  // 必须通知：曲库加载完不通知，界面会永远停在"0 首"
  applyQuery(query, true);
}

export function setQuery(next: string): void {
  if (next === query) return;
  query = next;
  applyQuery(next, true);
}

function applyQuery(raw: string, shouldNotify: boolean): void {
  const keyword = raw.trim();
  if (!keyword) {
    filtered = all;
  } else {
    const hits: { track: Track; score: number }[] = [];
    for (const track of all) {
      const key = keys.get(track.id);
      if (!key || !matchKey(key, keyword)) continue;
      hits.push({ track, score: scoreKey(key, keyword) });
    }
    // 稳定排序：同分保持原有顺序（通常是文件名顺序），不会在打字时乱跳
    hits.sort((a, b) => a.score - b.score);
    filtered = hits.map((h) => h.track);
  }

  if (shouldNotify) notify();
}

export function trackById(id: TrackId): Track | undefined {
  return all.find((t) => t.id === id);
}
