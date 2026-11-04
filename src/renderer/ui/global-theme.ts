/**
 * 全局配色包（B-9）：结构层/材质层 token 的导入、净化、应用。
 *
 * 与播放页主题包共用 `theme:export / theme:import` 这条「主进程只管文件」的 IPC，
 * 但白名单各一份——播放页那份只认 `--stage-*`，全局这份只认结构层与材质层。
 * 导入的 `scope: "global"` 会明确拒掉播放页的包，免得用户拿着一份文件到处试。
 */

export const GLOBAL_THEME_KEY = "ui-global-tokens";

/** 允许被自定义包覆盖的 token。**不含** --stage-*，也不含字体/尺寸。 */
export const GLOBAL_TOKEN_KEYS = [
  "--bg",
  "--fg",
  "--fg-dim",
  "--line",
  "--line-soft",
  "--row-hover",
  "--accent",
  "--accent-ink",
  "--brass",
  "--danger",
  "--bg-raised",
  "--mask",
  "--glass-bg",
  "--glass-border",
  "--grain-opacity",
  "--grain-blend",
] as const;

/**
 * 值只允许颜色 / 半透明 / 关键字 / 小数：
 * 白名单 key 已经限定范围，值再放开 `url()`、`;` 之类就会有 CSS 注入面。
 */
const VALUE_OK = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d.,%\s]+\)|[a-zA-Z-]{2,24}|[0-9]*\.?[0-9]+)$/;

export type GlobalTokens = Record<string, string>;

export function sanitizeGlobalTokens(raw: unknown): GlobalTokens | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = ((raw as { tokens?: unknown }).tokens ?? raw) as Record<string, unknown>;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const out: GlobalTokens = {};
  for (const [key, value] of Object.entries(source)) {
    if (!(GLOBAL_TOKEN_KEYS as readonly string[]).includes(key)) continue;
    if (typeof value !== "string") continue;
    const v = value.trim();
    if (v.length === 0 || v.length > 80 || !VALUE_OK.test(v)) continue;
    out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface GlobalThemeFile {
  name: string;
  version: 1;
  scope: "global";
  tokens: GlobalTokens;
}

export const globalThemeFile = (tokens: GlobalTokens): GlobalThemeFile => ({
  name: "阿飞飞全局配色",
  version: 1,
  scope: "global",
  tokens,
});

let current: GlobalTokens | null = null;
const listeners = new Set<() => void>();

export const getGlobalTokens = (): GlobalTokens | null => current;

export function subscribeGlobalTokens(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * 应用/清除一份覆盖：inline style 挂在 `<html>` 上，优先级高于
 * `:root[data-theme="x"]`，所以四档预设仍然能当底色、包只盖它改过的键。
 */
export function setGlobalTokens(next: GlobalTokens | null): void {
  if (typeof document !== "undefined") {
    for (const key of GLOBAL_TOKEN_KEYS) document.documentElement.style.removeProperty(key);
    if (next) {
      for (const [key, value] of Object.entries(next)) {
        if ((GLOBAL_TOKEN_KEYS as readonly string[]).includes(key)) {
          document.documentElement.style.setProperty(key, value);
        }
      }
    }
  }
  current = next;
  for (const fn of listeners) fn();
}
