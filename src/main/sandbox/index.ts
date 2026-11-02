/**
 * 用户源宿主（50 §7.3）：主进程侧的 fork 与消息路由。
 *
 * 子进程（child.ts）崩溃 → exit 监听把挂起的调用全部置错、置空句柄，
 * 下一次调用自动重新 fork —— **崩溃不扩散到主窗**。
 *
 * manifest 校验是纯函数（可单测）：id 规范、能力键白名单、值必须 boolean。
 */
import path from "node:path";
import { utilityProcess, type UtilityProcess } from "electron";
import { log } from "../log/index.js";

export interface UserManifest {
  id: string;
  name: string;
  capabilities: string[];
}

/** 方法名白名单：用户源能声明的就这几个，与 SourceProvider 的方法对齐。 */
export const USER_SOURCE_METHODS = ["search", "getLyric", "getUrl", "getDetail"] as const;

const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;

/** 任意来源 → 合法 manifest。坏结构直接抛，绝不带病注册。 */
export function validateManifest(raw: unknown): UserManifest {
  if (!raw || typeof raw !== "object") throw new Error("用户源返回的 manifest 不是对象");
  const r = raw as { id?: unknown; name?: unknown; capabilities?: unknown };
  if (typeof r.id !== "string" || !ID_RE.test(r.id)) {
    throw new Error(`用户源 id 非法（需小写字母开头的短横线串）：${String(r.id).slice(0, 40)}`);
  }
  if (typeof r.name !== "string" || !r.name.trim()) throw new Error("用户源缺少名字");
  if (r.capabilities !== undefined && !Array.isArray(r.capabilities)) {
    throw new Error("用户源 capabilities 必须是方法名数组");
  }
  const caps = ((r.capabilities ?? []) as unknown[]).map(String);
  for (const c of caps) {
    if (!(USER_SOURCE_METHODS as readonly string[]).includes(c)) {
      throw new Error(`用户源声明了未知能力：${c}`);
    }
  }
  return { id: r.id, name: r.name, capabilities: caps };
}

interface SandboxMsg {
  seq: number;
  kind: "load" | "call";
  sourceId?: string;
  code?: string;
  method?: string;
  params?: unknown;
}

/** 子进程回包：结果 / 错误 / 日志三种共用一条通道（联合，不是交集）。 */
type Reply =
  | { seq: number; ok: true; data?: unknown }
  | { seq: number; ok: false; error?: string }
  | { kind: "log"; level: "info" | "warn"; msg?: string };

let child: UtilityProcess | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function ensureChild(): UtilityProcess {
  if (child) return child;
  child = utilityProcess.fork(path.join(__dirname, "sandbox-child.js"));

  child.on("message", (msg: Reply) => {
    if ("kind" in msg) {
      log(msg.level === "warn" ? "warn" : "info", `[user] ${msg.msg ?? ""}`);
      return;
    }
    const p = pending.get(msg.seq);
    if (!p) return;
    pending.delete(msg.seq);
    if (msg.ok) p.resolve(msg.data);
    else p.reject(new Error(msg.error ?? "用户源调用失败"));
  });

  child.on("exit", () => {
    child = null;
    for (const [, p] of pending) p.reject(new Error("用户源进程已退出"));
    pending.clear();
    log("warn", "[sandbox] 用户源进程退出（将在下次调用时自动重启）");
  });

  return child;
}

function request<T>(msg: Omit<SandboxMsg, "seq">, timeoutMs = 8000): Promise<T> {
  const c = ensureChild();
  const s = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(s, { resolve: resolve as (v: unknown) => void, reject });
    c.postMessage({ seq: s, ...msg });
    setTimeout(() => {
      if (pending.has(s)) {
        pending.delete(s);
        reject(new Error("用户源响应超时"));
      }
    }, timeoutMs);
  });
}

/** 装载用户源代码，返回校验过的 manifest。 */
export function installUserSource(sourceId: string, code: string): Promise<UserManifest> {
  return request<UserManifest>({ kind: "load", sourceId, code }).then(validateManifest);
}

/** 调用用户源方法（渲染层只按 manifest 声明过的方法调用）。 */
export function callUserSource<T = unknown>(
  sourceId: string,
  method: string,
  params: unknown,
): Promise<T> {
  return request<T>({ kind: "call", sourceId, method, params });
}
