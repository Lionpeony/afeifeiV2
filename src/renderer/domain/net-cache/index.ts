/**
 * 会话级联网缓存（Ring 1）：同一次运行内切页不重拉。
 *
 * 账号数据（`account:*`）只留内存：一天一换，跨重启的旧值反而容易误导。
 * **清单类**（`charts:toplists:` / `playlists:list:`）可以落盘：它们是「有哪些榜 / 有哪些歌单」，
 * 变化慢、丢了也不影响播放，落盘后冷启动首帧就有内容，有网再补（stale-while-revalidate）。
 * 落盘由 UI 层用 `attachNetPersistence` 注入，本模块不认识 KV。
 *
 * key 约定（调用方负责拼）：
 *   account:<sourceId>:<kind>   kind = daily | liked | week | fm
 *   charts:toplists:<sourceId>
 *   charts:tracks:<sourceId>:<listId>:<page>
 *   playlists:list:<sourceId>
 *   playlists:tracks:<sourceId>:<playlistId>:<page>
 */

type Loader<T> = () => Promise<T>;

const values = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
/** 每次失效递增；旧请求回来时 epoch 对不上就丢弃，防止「刷新后旧响应盖掉新数据」 */
const epochs = new Map<string, number>();
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const fn of listeners) fn();
};

export function subscribeNet(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getNet<T>(key: string): T | undefined {
  return values.has(key) ? (values.get(key) as T) : undefined;
}

/** 命中就回缓存；未命中时同一个 key 的并发请求合并成一次。只缓存成功结果。 */
export function loadNet<T>(key: string, loader: Loader<T>): Promise<T> {
  if (values.has(key)) return Promise.resolve(values.get(key) as T);
  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const epoch = epochs.get(key) ?? 0;
  const p = loader()
    .then((value) => {
      if ((epochs.get(key) ?? 0) === epoch) {
        values.set(key, value);
        schedulePersist();
        notify();
      }
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p as Promise<unknown>);
  return p;
}

const bump = (key: string): void => {
  epochs.set(key, (epochs.get(key) ?? 0) + 1);
  values.delete(key);
  inflight.delete(key);
  schedulePersist(); // 失效也要落盘：否则重启后旧清单又回来了
};

/* ---------- 落盘（清单类，stale-while-revalidate） ----------
 * 只存白名单前缀，键里带时间戳；超过 TTL 的条目在 hydrate 时直接丢 ——
 * 三天前的榜单名比空列表更误导。
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface PersistEntry {
  at?: unknown;
  value?: unknown;
}

let persist: { match(key: string): boolean; save(data: Record<string, unknown>): void } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** 从磁盘快照恢复清单。坏 JSON / 坏条目逐条跳过，不整份放弃。 */
export function hydrateNet(raw: string | null): void {
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const now = Date.now();
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    const e = entry as PersistEntry | null;
    if (!e || typeof e.at !== "number" || e.value === undefined) continue;
    if (now - e.at > MAX_AGE_MS) continue;
    values.set(key, e.value);
  }
}

/** UI 层注入落盘实现（domain 不认识 KV）。 */
export function attachNetPersistence(opts: { match(key: string): boolean; save(data: Record<string, unknown>): void }): void {
  persist = opts;
}

/** 800ms 合并写：一次进页会同时写入清单和曲目，逐条写会把盘打爆。 */
function schedulePersist(): void {
  if (!persist || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!persist) return;
    const at = Date.now();
    const out: Record<string, unknown> = {};
    for (const [key, value] of values) {
      if (persist.match(key)) out[key] = { at, value };
    }
    persist.save(out);
  }, 800);
  (saveTimer as unknown as { unref?: () => void }).unref?.();
}

/** 手动刷新：让这些 key 失效，下一次 loadNet 重新请求。 */
export function refreshNet(...keys: string[]): void {
  for (const key of keys) bump(key);
  notify();
}

export function invalidatePrefix(prefix: string): void {
  let hit = false;
  for (const key of [...values.keys(), ...inflight.keys()]) {
    if (key.startsWith(prefix)) {
      bump(key);
      hit = true;
    }
  }
  if (hit) notify();
}

/** 局部改缓存（取消红心后删行）。updater 返回 undefined = 删掉这个 key。 */
export function updateNet<T>(key: string, updater: (prev: T | undefined) => T | undefined): void {
  const next = updater(values.get(key) as T | undefined);
  if (next === undefined) values.delete(key);
  else values.set(key, next);
  notify();
}

/** 只给测试用。 */
export function __resetNetCache(): void {
  values.clear();
  inflight.clear();
  epochs.clear();
  listeners.clear();
  persist = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
