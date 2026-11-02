/**
 * 明暗主题（docs/09 B4）：只改 `<html data-theme>`，不重建组件、不重排 DOM。
 *
 * 两套值全在 tokens.css，这里只管"哪个生效"。
 * 判据（docs/08 §4.2）：换主题 ≤200ms 且只覆盖 CSS 变量——瞬时改属性即 0ms 生效，
 * 所以这里不做过渡动画（底色过场会带来一帧不协调的中间色）。
 */

export type Theme = "light" | "dark";

/** 持久化键（走 kv 端口，与 audio-eq / stage-ui 同一套）。 */
export const THEME_KEY = "ui-theme";

export function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark";
}

/** 挂到 <html> 上；CSS 侧 `:root[data-theme="dark"]` 覆盖结构层变量。 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** 当前生效值以 DOM 为准（唯一写真点），避免各处闭包拿到陈旧 state。 */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
