import type { KeyValuePort } from "../../../contracts/ports.js";

/**
 * 「换一批」的种子偏移（salt）。切页/重启后仍接着上次的那一批——
 * 之前是组件 useState，离开漫游就归零，用户换出来的批次留不住。
 *
 * 存 { d, n }：d 是日期串，跨天自动作废——每日推荐的底种子本来就按天换，
 * 旧 salt 留着只会无限累加，没有意义。
 */

const KEY = "daily-salt";

let salt = 0;
let port: KeyValuePort | null = null; // loadSalt 时注入；没注入只影响落盘，内存里照常换
const listeners = new Set<() => void>();

export const getSalt = (): number => salt;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

function dayOf(at = new Date()): string {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}

/** 唯一写入口：换一批 = +1 并落盘。返回新值。 */
export function bumpSalt(): number {
  salt += 1;
  notify();
  void port?.write(KEY, JSON.stringify({ d: dayOf(), n: salt })).catch(() => undefined);
  return salt;
}

export async function loadSalt(kv: KeyValuePort): Promise<number> {
  port = kv;
  const raw = await kv.read(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { d?: unknown; n?: unknown };
      if (parsed.d === dayOf() && typeof parsed.n === "number" && Number.isInteger(parsed.n) && parsed.n > 0) {
        salt = parsed.n;
        notify();
      } else if (parsed.d !== dayOf()) {
        // 跨天归零：底种子已经按天换了，旧偏移没有意义，留着只会一直累加
        salt = 0;
        notify();
      }
    } catch {
      /* 坏档当没换过，不要因此让应用起不来 */
    }
  }
  return salt;
}
