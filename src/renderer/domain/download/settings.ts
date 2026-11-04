import { NAME_TEMPLATE_DEFAULT, NAME_TEMPLATE_MAX } from "./naming.js";

/**
 * 下载设置（Ring 1）：命名模板 + 并发上限。KV `download-settings`。
 *
 * 并发原来是 `queue.ts` 里写死的 `MAX_ACTIVE = 2`（docs/00 §6.3 不变式）。
 * 放开为 1–6 后，**默认值仍是 2**，不变式的「上限」改由这里的 clamp 保证；
 * 超过 3 会在设置页提示「太多并发容易被上游限流」（lx 也是这么劝的）。
 */

export const DOWNLOAD_SETTINGS_KEY = "download-settings";
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 6;
export const DEFAULT_CONCURRENCY = 2;

export interface DownloadSettings {
  template: string;
  concurrency: number;
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  template: NAME_TEMPLATE_DEFAULT,
  concurrency: DEFAULT_CONCURRENCY,
};

function clampConcurrency(value: unknown): number {
  const n = typeof value === "number" ? Math.round(value) : DEFAULT_CONCURRENCY;
  if (!Number.isFinite(n)) return DEFAULT_CONCURRENCY;
  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, n));
}

/** KV 读回：坏数据逐项回落默认值，不让一条坏 JSON 把下载器弄瘫。 */
export function parseDownloadSettings(raw: string | null): DownloadSettings {
  if (!raw) return { ...DEFAULT_DOWNLOAD_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad shape");
    const o = parsed as Partial<DownloadSettings>;
    const template =
      typeof o.template === "string" && o.template.trim()
        ? o.template.trim().slice(0, NAME_TEMPLATE_MAX)
        : NAME_TEMPLATE_DEFAULT;
    return { template, concurrency: clampConcurrency(o.concurrency) };
  } catch {
    return { ...DEFAULT_DOWNLOAD_SETTINGS };
  }
}

export const serializeDownloadSettings = (settings: DownloadSettings): string => JSON.stringify(settings);

/** 当前生效值（runner 每次 pump 读它，改设置后立即生效）。 */
let current: DownloadSettings = { ...DEFAULT_DOWNLOAD_SETTINGS };
const listeners = new Set<() => void>();

export const getDownloadSettings = (): DownloadSettings => current;

export function setDownloadSettings(next: DownloadSettings): DownloadSettings {
  current = {
    template:
      typeof next.template === "string" && next.template.trim()
        ? next.template.trim().slice(0, NAME_TEMPLATE_MAX)
        : NAME_TEMPLATE_DEFAULT,
    concurrency: clampConcurrency(next.concurrency),
  };
  for (const fn of listeners) fn();
  return current;
}

export function subscribeDownloadSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
