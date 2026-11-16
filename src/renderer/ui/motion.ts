/**
 * 动效档位（v4.2）。
 *
 * 偏好：完整 / 轻动效 / 关闭 / 跟随系统（默认跟随系统）。
 * 生效值写到 `<html data-motion>`，只有 full / light / off 三种；
 * 全局降级规则在 `base.css`（off 与系统 reduced-motion 都是 ≤150ms 纯 opacity）。
 *
 * 跟随系统时读 `prefers-reduced-motion: reduce`：开了就 off，没开就 full。
 * 与主题一样，系统设置变化只重算 dataset，不重建组件。
 */
export const MOTION_KEY = "ui-motion";

export const MOTION_PREF_IDS = ["full", "light", "off", "system"] as const;
export type MotionPref = (typeof MOTION_PREF_IDS)[number];
export type MotionLevel = "full" | "light" | "off";

export interface MotionPreset {
  id: MotionPref;
  name: string;
  hint: string;
}

export const MOTION_PRESETS: readonly MotionPreset[] = [
  { id: "full", name: "完整", hint: "全部动效与循环动画" },
  { id: "light", name: "轻动效", hint: "去掉循环与大幅位移" },
  { id: "off", name: "关闭", hint: "只保留 150ms 透明度" },
  { id: "system", name: "跟随系统", hint: "随系统减少动效设置" },
];

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

let pref: MotionPref = "system";
const listeners = new Set<() => void>();

function systemReduce(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCE_QUERY).matches
    : false;
}

export function isMotionPref(v: unknown): v is MotionPref {
  return typeof v === "string" && (MOTION_PREF_IDS as readonly string[]).includes(v);
}

export function resolveMotion(p: MotionPref, reduce: boolean = systemReduce()): MotionLevel {
  if (p === "system") return reduce ? "off" : "full";
  return p;
}

export function applyMotion(level: MotionLevel): void {
  document.documentElement.dataset.motion = level;
}

export function getMotionPref(): MotionPref {
  return pref;
}

export function subscribeMotionPref(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

function applyResolved(): void {
  applyMotion(resolveMotion(pref));
  notify();
}

/** 启动时调用一次：把持久化值转成偏好并立即落到 DOM。未知值回落 system。 */
export function initMotionPref(raw: unknown): MotionPref {
  pref = isMotionPref(raw) ? raw : "system";
  applyResolved();
  return pref;
}

export function setMotionPref(next: MotionPref): MotionPref {
  pref = next;
  applyResolved();
  return pref;
}

/** 系统「减少动效」变化：只有偏好是 system 时才重算。返回取消函数。 */
export function watchSystemMotion(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCE_QUERY);
  const onChange = (): void => {
    if (pref === "system") applyResolved();
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
