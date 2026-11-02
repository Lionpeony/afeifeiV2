/**
 * 用户源宿主子进程（50 §7.3）。
 *
 * 由 main/sandbox/index.ts 用 utilityProcess.fork 拉起 —— **独立进程**，
 * 崩溃不影响主窗（M5 判据：恶意源被拒，主窗无感）。
 *
 * 用户代码在 node:vm 里执行，context 里**没有 require / process / fs / net**，
 * 能碰的只有 `host`（http 代理 / log / cache）和一组无害全局。
 * 约定：用户代码定义 `function createProvider(host)` 并返回 provider 对象。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { dataDir } from "../paths.js";

interface SandboxMsg {
  seq: number;
  kind: "load" | "call";
  sourceId?: string;
  code?: string;
  method?: string;
  params?: unknown;
}

interface Reply {
  seq: number;
  ok: boolean;
  data?: unknown;
  error?: string;
  kind?: "log";
  level?: "info" | "warn";
  msg?: string;
}

const CALL_TIMEOUT = 8000; // 50 §7.3：单次 8s
const CACHE_TTL_MAX = 60 * 60 * 1000;
const CACHE_VALUE_MAX = 100_000;

const cache = new Map<string, { value: string; expire: number }>();

/* ---- host.cache 的持久化：内存为主，变更后 2s 节流写快照，启动读回 ----
 * 上限 5MB（对齐 00 §6.3 的缓存预算）；写失败不影响宿主（缓存本来就可丢）。 */
const CACHE_FILE = (): string => path.join(dataDir(), "cache", "sandbox-cache.json");
const CACHE_DISK_MAX = 5_000_000;
let cacheFlushTimer: NodeJS.Timeout | null = null;

function loadCacheFromDisk(): void {
  try {
    const raw = fs.readFileSync(CACHE_FILE(), "utf8");
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, { value?: unknown; expire?: unknown }>)) {
      if (typeof v?.value === "string" && typeof v.expire === "number") {
        cache.set(k, { value: v.value, expire: v.expire });
      }
    }
  } catch {
    /* 没有快照/坏快照都从空开始 */
  }
}

function scheduleCacheFlush(): void {
  if (cacheFlushTimer) return;
  cacheFlushTimer = setTimeout(() => {
    cacheFlushTimer = null;
    try {
      const obj: Record<string, { value: string; expire: number }> = {};
      let size = 0;
      for (const [k, v] of cache) {
        obj[k] = v;
        size += k.length + v.value.length;
        if (size > CACHE_DISK_MAX) break;
      }
      fs.mkdirSync(path.dirname(CACHE_FILE()), { recursive: true });
      fs.writeFileSync(CACHE_FILE(), JSON.stringify(obj), "utf8");
    } catch {
      /* 缓存写失败不影响宿主 */
    }
  }, 2000);
}

loadCacheFromDisk();

const post = (msg: Reply): void => process.parentPort.postMessage(msg);

const host = {
  /** http 是**宿主代理**，不是让脚本自己发请求 —— cookie / UA / 限流仍在我们手里。 */
  async http(req: { url: string; method?: string; headers?: Record<string, string>; body?: string }) {
    if (typeof req?.url !== "string" || !/^https:\/\//.test(req.url)) {
      throw new Error("host.http 只允许 https");
    }
    const res = await fetch(req.url, {
      method: req.method === "POST" ? "POST" : "GET",
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(CALL_TIMEOUT),
    });
    return { status: res.status, body: (await res.text()).slice(0, 500_000) };
  },
  log(level: "info" | "warn", msg: string) {
    post({ seq: -1, ok: true, kind: "log", level, msg: String(msg).slice(0, 500) });
  },
  cache: {
    async get(k: string) {
      const e = cache.get(k);
      if (!e) return null;
      if (Date.now() > e.expire) {
        cache.delete(k);
        return null;
      }
      return e.value;
    },
    async set(k: string, v: string, ttlMs: number) {
      cache.set(k, {
        value: String(v).slice(0, CACHE_VALUE_MAX),
        expire: Date.now() + Math.min(Number(ttlMs) || 0, CACHE_TTL_MAX),
      });
      scheduleCacheFlush();
    },
  },
};

function makeContext(): vm.Context {
  return vm.createContext({
    host,
    JSON,
    Math,
    Date,
    Promise,
    URL,
    URLSearchParams,
    isNaN,
    parseInt,
    parseFloat,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    Map,
    Set,
    console: {
      log: (...a: unknown[]) => host.log("info", a.map(String).join(" ")),
      warn: (...a: unknown[]) => host.log("warn", a.map(String).join(" ")),
    },
  });
}

/** sourceId → 已装载的 provider。 */
const providers = new Map<string, { ctx: vm.Context; p: Record<string, unknown> }>();

function loadCode(sourceId: string, code: string): unknown {
  const ctx = makeContext();
  // 脚本自身 8s 同步上限；异步部分在 call 时再用 Promise.race 兜底
  const script = new vm.Script(
    `"use strict";\n${code}\n;globalThis.__provider = (typeof createProvider === "function") ? createProvider(host) : null;`,
  );
  script.runInContext(ctx, { timeout: CALL_TIMEOUT });
  const p = (ctx as Record<string, unknown>).__provider;
  if (!p || typeof p !== "object") {
    throw new Error("用户源没有返回 provider：需要定义 createProvider(host) 并返回对象");
  }
  // 键必须与 manifest.id 同源（provider 自报的 id 优先）—— 否则 call 永远找不到已装载的源
  const key = String((p as Record<string, unknown>).id ?? sourceId);
  providers.set(key, { ctx, p: p as Record<string, unknown> });
  return {
    id: key,
    name: String((p as Record<string, unknown>).name ?? sourceId),
    capabilities: (p as Record<string, unknown>).capabilities ?? {},
  };
}

async function callMethod(sourceId: string, method: string, params: unknown): Promise<unknown> {
  const entry = providers.get(sourceId);
  if (!entry) throw new Error(`用户源未装载：${sourceId}`);
  const fn = entry.p[method];
  if (typeof fn !== "function") throw new Error(`用户源未实现方法：${method}`);
  return await Promise.race([
    Promise.resolve((fn as (arg: unknown) => unknown).call(entry.p, params)),
    new Promise((_, rej) => setTimeout(() => rej(new Error("用户源响应超时（8s）")), CALL_TIMEOUT)),
  ]);
}

process.parentPort.on("message", (e: { data: SandboxMsg }) => {
  const m = e.data;
  void (async () => {
    try {
      if (m.kind === "load") {
        post({ seq: m.seq, ok: true, data: loadCode(String(m.sourceId ?? ""), String(m.code ?? "")) });
      } else if (m.kind === "call") {
        const data = await callMethod(String(m.sourceId ?? ""), String(m.method ?? ""), m.params);
        post({ seq: m.seq, ok: true, data: data ?? null });
      }
    } catch (err) {
      post({ seq: m.seq, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
});
