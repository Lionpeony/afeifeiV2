/**
 * 全局配色预设注册表（v4.2）。
 *
 * 只登记「是哪一档」，色值全部在 `ui/tokens.css` 的 `:root[data-theme="…"]` 块里——
 * 颜色唯一来源不能被这里分走（lint 规则 5 的 hex 白名单也只有 tokens.css）。
 * 设置页的分段按钮从这里生成，加新一档不用改 UI。
 * （forest「夜航」2026-11-10 删除；sepia「旧档」2026-11-16 并入明亮。）
 */

export const THEME_PRESET_IDS = ["light", "dark", "system"] as const;

export interface ThemePreset {
  id: (typeof THEME_PRESET_IDS)[number];
  name: string;
  hint: string;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: "light", name: "明亮", hint: "排练室 · 奶油粉白" },
  { id: "dark", name: "熄灯", hint: "排练室熄灯 · 深紫" },
  { id: "system", name: "跟随系统", hint: "随 Windows 明暗切换" },
];
