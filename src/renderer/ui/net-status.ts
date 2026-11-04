/**
 * 离线态（P0-25）：`online` / `offline` 事件的**去抖确认**。
 *
 * 为什么不用 `navigator.onLine` 直接判断：这个值在 Electron 里反映的是"网卡有没有
 * 连上"，Wi-Fi 连上了但没出口时它照样是 `true`；反过来刚开机网卡还在初始化时它会
 * 短暂是 `false`。所以它只用来取**初始值**，之后一律跟事件走。
 *
 * 为什么要延迟确认：切 Wi-Fi、插拔网线会瞬间来一串 offline → online，
 * 每个都立刻画横幅就是"闪屏"。`delayMs`（默认 300ms）后仍成立才改状态 ——
 * 判据"断网 1s 内出横幅"因此仍然成立（300ms + 一次渲染）。
 *
 * 逻辑全部通过 `NetEnv` 注入，所以能在 node 里确定性地测（见 `test/net-status.test.mjs`）。
 */

export type NetStatus = "online" | "offline";

export interface NetEnv {
  /** 初始值：`navigator.onLine` */
  online(): boolean;
  /** 订阅系统 online/offline 事件 */
  listen(cb: (status: NetStatus) => void): () => void;
  /** 延迟确认：返回取消函数 */
  later(fn: () => void, ms: number): () => void;
}

export interface NetWatcher {
  /** 开始监听，返回停止函数 */
  start(): () => void;
  status(): NetStatus;
  /** 订阅（会立刻回调一次当前值，UI 不用另外初始化） */
  subscribe(cb: (status: NetStatus) => void): () => void;
}

export function createNetStatus(env: NetEnv, opts: { delayMs?: number } = {}): NetWatcher {
  const delayMs = opts.delayMs ?? 300;
  let current: NetStatus = env.online() ? "online" : "offline";
  const listeners = new Set<(status: NetStatus) => void>();
  let cancel: (() => void) | null = null;

  const apply = (next: NetStatus): void => {
    if (next === current) return; // 同一个状态连报两次只算一次
    current = next;
    for (const cb of listeners) cb(next);
  };

  return {
    start(): () => void {
      return env.listen((next) => {
        cancel?.(); // 后到的事件作废前一个待确认
        cancel = env.later(() => {
          cancel = null;
          apply(next);
        }, delayMs);
      });
    },
    status: (): NetStatus => current,
    subscribe(cb: (status: NetStatus) => void): () => void {
      listeners.add(cb);
      cb(current);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

/** 真实浏览器环境（只在渲染层用；测试注入假 env）。 */
export function browserNetEnv(): NetEnv {
  return {
    online: () => navigator.onLine,
    listen: (cb) => {
      const on = (): void => cb("online");
      const off = (): void => cb("offline");
      window.addEventListener("online", on);
      window.addEventListener("offline", off);
      return () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", off);
      };
    },
    later: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  };
}
