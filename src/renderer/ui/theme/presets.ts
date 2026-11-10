/**
 * 全局配色预设注册表（B-9）。
 *
 * 只登记「是哪一档」，色值全部在 `ui/tokens.css` 的 `:root[data-theme="…"]` 块里——
 * 颜色唯一来源不能被这里分走（lint 规则 5 的 hex 白名单也只有 tokens.css）。
 * 设置页的分段按钮与顶栏的「换一套」都从这里生成，加新一档不用改 UI。
 * （forest「夜航」档 2026-11-10 删除：旧主题残留，老存档在 bootstrap 回落 dark。）
 */

export const THEME_PRESET_IDS = ["light", "dark", "sepia"] as const;

export interface ThemePreset {
  id: (typeof THEME_PRESET_IDS)[number];
  name: string;
  hint: string;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: "light", name: "纸色", hint: "冷米白 · 朱砂印" },
  { id: "dark", name: "墨色", hint: "暖墨底 · 提亮朱砂" },
  { id: "sepia", name: "旧档", hint: "牛皮纸 · 赭石" },
];
