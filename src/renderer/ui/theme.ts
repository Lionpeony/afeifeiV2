/**
 * 全局配色主题（B-9）：四档预设 + 一份可导入的自定义覆盖。
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

export type Theme = (typeof THEME_PRESET_IDS)[number];

/** 持久化键（走 kv 端口，与 audio-eq / stage-ui 同一套）；旧值 light/dark 原样兼容。 */
export const THEME_KEY = "ui-theme";

export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEME_PRESET_IDS as readonly string[]).includes(v);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** 当前生效值以 DOM 为准（唯一写真点），避免各处闭包拿到陈旧 state。 */
export function currentTheme(): Theme {
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : "light";
}
