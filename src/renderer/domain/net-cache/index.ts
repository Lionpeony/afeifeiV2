/**
 * 会话级联网缓存（Ring 1）：同一次运行内切页不重拉。
 *
 * 不落盘：账号数据一天一换，跨重启的旧值反而容易误导；启动预取会把首屏需要的那几份
 * 提前装满，所以冷启动只拉一次，之后切页全部命中。
 *
 * key 约定（调用方负责拼）：
 *   account:<sourceId>:<kind>   kind = daily | liked | week | fm
 *   charts:toplists:<sourceId>
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
};

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
}
