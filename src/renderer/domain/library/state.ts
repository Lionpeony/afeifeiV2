import type { TrackId } from "../../../contracts/index.js";
import { matchKey, scoreKey, searchKeyOf, type SearchKey } from "../search/pinyin.js";
import type { Track } from "./schema.js";
import { normalizePath } from "./schema.js";
import { applyMeta, type MetaOverrides } from "./meta.js";

/**
 * 曲库状态（Ring 1）。与 kernel 的播放状态是两个域，各自一个写者：
 * 播放状态的写入口是 dispatch，曲库的写入口是 setTracks / setQuery / setMetaOverrides。
 *
 * 5000 条不进 kernel store —— 那个 store 每次变化都通知所有订阅者，
 * 而曲库只需要"列表变了"和"搜索词变了"两个通知。
 *
 * 元数据编辑（M11）是"索引之上的一层覆盖"：`raw` 是文件里读到的值，
 * `all` 是覆盖后的展示值。搜索索引必须按展示值重建——改了歌手名搜新名字要搜得到。
 */

/** 文件里读到的原值（扫描/恢复写这里，不直接被界面消费）。 */
let raw: Track[] = [];
let all: Track[] = [];
let overrides: MetaOverrides = {};
let keys = new Map<TrackId, SearchKey>();
let query = "";
let filtered: Track[] = [];

const listeners = new Set<() => void>();

export const getTracks = (): Track[] => all;
export const getFiltered = (): Track[] => filtered;
export const getQuery = (): string => query;
/** 当前生效的覆盖表（编辑框用它判断"这一项是不是改过"）。 */
export const getMetaOverrides = (): MetaOverrides => overrides;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

function rebuild(shouldNotify: boolean): void {
  all = raw.map((t) => applyMeta(t, overrides[t.id]));
  keys = new Map(all.map((t) => [t.id, searchKeyOf(t)]));
  applyQuery(query, shouldNotify);
}

/** 唯一写入口：只在扫描完成或启动恢复时调用。 */
export function setTracks(next: Track[]): void {
  raw = next;
  // 必须通知：曲库加载完不通知，界面会永远停在"0 首"
  rebuild(true);
}

/** 覆盖表变了（编辑元数据 / 启动读回）：重建展示值与搜索索引，再通知。 */
export function setMetaOverrides(next: MetaOverrides): void {
  overrides = next;
  rebuild(true);
}

export function setQuery(next: string): void {
  if (next === query) return;
  query = next;
  applyQuery(next, true);
}

function rank(keyword: string): { track: Track; score: number }[] {
  const kw = keyword.trim();
  if (!kw) return [];
  const hits: { track: Track; score: number }[] = [];
  for (const track of all) {
    const key = keys.get(track.id);
    if (!key || !matchKey(key, kw)) continue;
    hits.push({ track, score: scoreKey(key, kw) });
  }
  // 稳定排序：同分保持原有顺序（通常是文件名顺序），不会在打字时乱跳
  hits.sort((a, b) => a.score - b.score);
  return hits;
}

function applyQuery(raw: string, shouldNotify: boolean): void {
  filtered = raw.trim() ? rank(raw).map((h) => h.track) : all;
  if (shouldNotify) notify();
}

/**
 * 一次性查询（命令面板用）：**不动全局 query、不触发通知**。
 * 与曲库搜索共用同一份拼音索引缓存，5000 条下无额外建键成本。
 */
export function searchTracks(keyword: string, limit = 12): Track[] {
  return rank(keyword)
    .slice(0, limit)
    .map((h) => h.track);
}

/** 按 id 查曲目：队列里存的是原始路径（Windows 盘符大写、反斜杠），先归一化再比。 */
export function trackById(id: TrackId): Track | undefined {
  const want = normalizePath(id);
  return all.find((t) => t.id === want);
}
