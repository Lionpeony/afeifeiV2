/**
 * 四套播放页预设（50 §9.2 参数表，参数写死不是形容词）。
 *
 * **预设只是同一组场景层 token 的不同取值**（50 §9.3）——换预设 = 换一组 CSS 变量，
 * 不重建 store、不重解码封面。加第五套之前先问：四套是否已肉眼明显不同。
 *
 * 参数来源：50 §9.2 的表，逐项照抄；暗色基底与设计稿的纸色差由场景层吸收。
 */
import type { LyricRenderer, StageConfig, StageLayer, StagePreset } from "../../../../contracts/index.js";

export interface StagePresetDef {
  id: StagePreset;
  name: string;
  /** 场景层 token 覆盖。键必须是 STAGE_TOKEN_KEYS 里的（启动断言守着）。 */
  tokens: Record<string, string>;
  /** L-a 用当前封面做高斯模糊壁纸（电影感） */
  wallpaperFromCover: boolean;
  /** 切到这套时联动的歌词渲染器（50 §9.2 四套各对应一个） */
  lyricRenderer: LyricRenderer;
}

export const STAGE_TOKEN_KEYS = [
  "--stage-bg",
  "--stage-fg",
  "--stage-fg-dim",
  "--stage-tint",
  "--stage-wallpaper",
  "--stage-cover-size",
  "--stage-cover-radius",
  "--stage-cover-frame",
  "--stage-cover-shadow",
  "--stage-cover-spin",
  "--stage-lyric-size",
  "--stage-lyric-weight",
  "--stage-dur",
  "--stage-ease",
] as const;

export const PRESETS: StagePresetDef[] = [
  {
    id: "paper",
    name: "纸面剧场",
    wallpaperFromCover: false,
    lyricRenderer: "press",
    tokens: {
      "--stage-bg": "var(--bg)",
      "--stage-fg": "var(--fg)",
      "--stage-fg-dim": "var(--fg-dim)",
      // 未取到色就是 transparent：兜底成 accent 会把整屏染成粉墙（::after 18% 铺满）
      "--stage-tint": "transparent",
      "--stage-wallpaper":
        // 纸噪点（SVG feTurbulence data-uri，opacity 0.035 按 50 §9.2）+ 底部微光渐变，双层叠加
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")," +
        "radial-gradient(ellipse at 50% 28%, rgba(232, 230, 227, 0.04), transparent 62%)",
      "--stage-cover-size": "320px",
      "--stage-cover-radius": "8px",
      "--stage-cover-frame": "1px solid var(--line)", // 设计稿另有 4px 内边距，暗色基底上以细框为先
      "--stage-cover-shadow": "none",
      "--stage-cover-spin": "0s",
      "--stage-lyric-size": "22px",
      "--stage-lyric-weight": "600",
      "--stage-dur": "200ms",
      "--stage-ease": "ease-out",
    },
  },
  {
    id: "vinyl",
    name: "黑胶唱机",
    wallpaperFromCover: false,
    lyricRenderer: "minimal",
    tokens: {
      "--stage-bg": "var(--bg)",
      "--stage-fg": "var(--fg)",
      "--stage-fg-dim": "var(--fg-dim)",
      // 未取到色就是 transparent：兜底成 accent 会把整屏染成粉墙（::after 18% 铺满）
      "--stage-tint": "transparent",
      "--stage-wallpaper":
        "repeating-radial-gradient(circle at 50% 40%, rgba(232, 230, 227, 0.028) 0 2px, transparent 2px 8px)",
      "--stage-cover-size": "360px",
      "--stage-cover-radius": "50%",
      "--stage-cover-frame": "1px solid var(--line-soft)",
      "--stage-cover-shadow": "none",
      "--stage-cover-spin": "1.8s", // 33⅓ rpm ≈ 1.8s/圈
      "--stage-lyric-size": "18px",
      "--stage-lyric-weight": "400",
      "--stage-dur": "320ms",
      "--stage-ease": "ease-out",
    },
  },
  {
    id: "minimal",
    name: "极简留白",
    wallpaperFromCover: false,
    lyricRenderer: "karaoke",
    tokens: {
      "--stage-bg": "var(--bg)",
      "--stage-fg": "var(--fg)",
      "--stage-fg-dim": "var(--fg-dim)",
      // 未取到色就是 transparent：兜底成 accent 会把整屏染成粉墙（::after 18% 铺满）
      "--stage-tint": "transparent",
      "--stage-wallpaper": "none",
      "--stage-cover-size": "min(62vw, 460px)",
      "--stage-cover-radius": "4px",
      "--stage-cover-frame": "none",
      "--stage-cover-shadow": "none",
      "--stage-cover-spin": "0s",
      "--stage-lyric-size": "24px",
      "--stage-lyric-weight": "700",
      "--stage-dur": "200ms",
      "--stage-ease": "ease-out",
    },
  },
  {
    id: "cinema",
    name: "电影感",
    wallpaperFromCover: true, // 封面 blur 48px / scale 1.15 / 亮度 -18%
    lyricRenderer: "theatrical",
    tokens: {
      // 深色封面模糊底上墨字不可读：cinema 显式用纸色字（2026-11-03 纸面化换装）
      "--stage-bg": "#17150f",
      "--stage-fg": "#f3f1ea",
      "--stage-fg-dim": "rgba(243, 241, 234, 0.6)",
      // 未取到色就是 transparent：兜底成 accent 会把整屏染成粉墙（::after 18% 铺满）
      "--stage-tint": "transparent",
      "--stage-wallpaper": "none", // 壁纸由封面图层承担（wallpaperFromCover）
      "--stage-cover-size": "300px",
      "--stage-cover-radius": "12px",
      "--stage-cover-frame": "none",
      "--stage-cover-shadow": "0 16px 48px rgba(0, 0, 0, 0.5)",
      "--stage-cover-spin": "0s",
      "--stage-lyric-size": "20px",
      "--stage-lyric-weight": "500",
      "--stage-dur": "400ms",
      "--stage-ease": "ease-in-out",
    },
  },
];

export const LAYER_KEYS: StageLayer[] = ["wallpaper", "visual", "cover", "lyric", "controls"];

const PRESET_IDS = PRESETS.map((p) => p.id);
const RENDERERS: LyricRenderer[] = ["press", "karaoke", "minimal", "theatrical"];

/** 任意来源（KV 读回）→ 合法 StageConfig。cover / controls 强制 true（不可关）。 */
export function sanitizeStageConfig(raw: unknown): StageConfig {
  const fallback: StageConfig = {
    preset: "paper",
    intensity: 1,
    layers: { wallpaper: true, visual: true, cover: true, lyric: true, controls: true },
    lyricRenderer: "press",
    customTokens: null,
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as {
    preset?: unknown;
    intensity?: unknown;
    layers?: unknown;
    lyricRenderer?: unknown;
    customTokens?: unknown;
  };
  const layers = { ...fallback.layers };
  if (r.layers && typeof r.layers === "object") {
    const l = r.layers as Record<string, unknown>;
    for (const key of LAYER_KEYS) {
      if (key !== "cover" && key !== "controls") layers[key] = l[key] !== false;
    }
  }
  return {
    preset: PRESET_IDS.includes(r.preset as StagePreset) ? (r.preset as StagePreset) : fallback.preset,
    intensity: (r.intensity === 0 || r.intensity === 1 || r.intensity === 2 ? r.intensity : 1) as 0 | 1 | 2,
    layers,
    lyricRenderer: RENDERERS.includes(r.lyricRenderer as LyricRenderer)
      ? (r.lyricRenderer as LyricRenderer)
      : fallback.lyricRenderer,
    customTokens: sanitizeThemeTokens(r.customTokens),
  };
}

/** 主题包里的 token：键必须在白名单内、值必须是短字符串。空集返回 null（等于没包）。 */
export function sanitizeThemeTokens(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(STAGE_TOKEN_KEYS as readonly string[]).includes(k)) continue; // 未登记的键直接丢，不报错（导入要宽容）
    if (typeof v !== "string" || v.length === 0 || v.length > 200) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 预设缺 token 明确报错（M4 判据：丢目录/缺 token 不能静默）——这里是数据完整性断言。 */
export function assertPresetComplete(p: StagePresetDef): void {
  for (const key of STAGE_TOKEN_KEYS) {
    if (!(key in p.tokens)) throw new Error(`预设 ${p.id} 缺少 token：${key}`);
  }
  const unknown = Object.keys(p.tokens).filter((k) => !(STAGE_TOKEN_KEYS as readonly string[]).includes(k));
  if (unknown.length > 0) throw new Error(`预设 ${p.id} 带了未登记的 token：${unknown.join(", ")}`);
}
