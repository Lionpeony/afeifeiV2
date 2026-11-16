/**
 * 全局配色主题（v4.2）：亮 / 暗 / 跟随系统。
 *
 * 设计系统把「偏好」和「生效值」分开：
 *  - 偏好 `ThemePref` 是用户选的，存在 `ui-theme`，可以是 `system`；
 *  - 生效值 `Theme` 只有 light / dark，写到 `<html data-theme>`，CSS 只认它。
 * 这样跟随系统时不需要任何额外主题块，系统一变只重算 dataset。
 *
 * 与播放页主题包的关系（用户原来抱怨「两者不通用」）：
 *  - **文件 IO 通用了**：都走 `theme:export / theme:import` 同一条 IPC；
 *  - **token 白名单仍然分开**：播放页只能写 `--stage-*`（A-10 不变式，
 *    `test/stage-theme` 钉住），全局包只能写结构层/材质层。合成一套会让
 *    「切夜间把播放页翻黑」这个老 bug 立刻复活。
 *
 * 只改 `<html data-theme>` / inline style，不重建组件、不重排 DOM（docs/09 B4）。
 */
import { THEME_PRESET_IDS } from "./theme/presets.js";

/** 用户偏好：明亮 / 熄灯 / 跟随系统。 */
export type ThemePref = (typeof THEME_PRESET_IDS)[number];
/** 实际生效：system 解析之后只剩亮或暗。 */
export type Theme = "light" | "dark";

/** 持久化键（走 kv 端口）；旧值 light/dark 原样兼容，sepia 归档为 light。 */
export const THEME_KEY = "ui-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

let pref: ThemePref = "light";
const listeners = new Set<() => void>();

function systemDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

export function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark";
}

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === "string" && (THEME_PRESET_IDS as readonly string[]).includes(v);
}

export function resolveTheme(p: ThemePref, dark: boolean = systemDark()): Theme {
  return p === "system" ? (dark ? "dark" : "light") : p;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** 当前生效值以 DOM 为准（唯一写真点），避免各处闭包拿到陈旧 state。 */
export function currentTheme(): Theme {
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : "light";
}

export function getThemePref(): ThemePref {
  return pref;
}

export function subscribeThemePref(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

function applyResolved(): void {
  applyTheme(resolveTheme(pref));
  notify();
}

/** 启动时调用一次：把持久化值转成偏好并立即落到 DOM。 */
export function initThemePref(raw: unknown): ThemePref {
  pref = isThemePref(raw) ? raw : raw === "sepia" ? "light" : "light";
  applyResolved();
  return pref;
}

export function setThemePref(next: ThemePref): ThemePref {
  pref = next;
  applyResolved();
  return pref;
}

/** 系统明暗变化：只有偏好是 system 时才重算。返回取消函数。 */
export function watchSystemTheme(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  const onChange = (): void => {
    if (pref === "system") applyResolved();
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * `rgb(r, g, b)` / `rgba(r, g, b, a)` → `#rrggbb`。
 *
 * 存在的理由：无框窗口的系统三键（titleBarOverlay）只收 `#rrggbb`（`main/ipc/window.ts`
 * 的白名单校验），而 token 可以是 rgba()/oklch()（导入的配色包、`--stage-line`）。
 * 三键取的是 bg/fg 两个实色 token，转换失败返回 null —— 调用方跳过这次同步即可。
 */
export function rgbToHex(resolved: string): string | null {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(resolved);
  if (!m) return null;
  const to = (v: string): string => Math.round(Number(v)).toString(16).padStart(2, "0");
  return `#${to(m[1])}${to(m[2])}${to(m[3])}`;
}
