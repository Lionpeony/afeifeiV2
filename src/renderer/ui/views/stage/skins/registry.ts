import type { AppState, StageSkin, StageTone } from "../../../../../contracts/index.js";
import type { useStageData } from "../useStageData.js";
import type { useStageLyrics } from "../useStageLyrics.js";

/**
 * 皮肤目录（2026-11-10）。
 *
 * 与 presets.ts 的区别：preset 是"同一版式的四组配色"，skin 是**不同版式**。
 * （classic 旧版面已随 StageMainLayout 删除，老存档的 "classic" 由 sanitize 迁移到 editorial。）
 */
export interface SkinDef {
  id: StageSkin;
  name: string;
  en: string;
  desc: string;
  /** 缩略图用的 class（CSS 里用渐变画，不加载图片） */
  thumb: string;
}

export const SKINS: SkinDef[] = [
  {
    id: "editorial",
    name: "唱片内页",
    en: "VINYL EDITORIAL",
    desc: "一张真唱片当舞台，盘面转起来，字从盘沿长出来",
    thumb: "th-ed",
  },
  {
    id: "nebula",
    name: "声云",
    en: "NEBULA",
    desc: "不摆物件只摆光，歌词占满屏，底部一条会呼吸的地平线",
    thumb: "th-nb",
  },
  {
    id: "desk",
    name: "转播台",
    en: "BROADCAST DESK",
    desc: "时间码、频谱柱、走带刻度，整页是一张仪表台",
    thumb: "th-dk",
  },
];

/** 三套版式共用的入参。 */
export interface SkinProps {
  state: AppState;
  data: ReturnType<typeof useStageData>;
  lyric: ReturnType<typeof useStageLyrics>;
  playing: boolean;
  tone: StageTone;
  /** 歌词层开关（stage.layers.lyric）。关掉时三套新版式统一显示空态，不做假歌词。 */
  lyricOn: boolean;
  live: boolean;
  durationMs(): number;
  positionMs(): number;
  spectrum(bins: number): number[] | null;
  notify(n: { text: string; url?: string } | null): void;
  /** 打开样式库 */
  onShelf(): void;
  /** 打开视图菜单（原有的细项设置） */
  onView(): void;
  shelfOpen: boolean;
  viewOpen: boolean;
}
