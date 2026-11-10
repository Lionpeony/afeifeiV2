import type { AppState, StageSkin, StageTone } from "../../../../../contracts/index.js";
import type { useStageData } from "../useStageData.js";
import type { useStageLyrics } from "../useStageLyrics.js";

/**
 * 皮肤目录（2026-11-10 第二代）。
 *
 * 一个皮肤 = 一个**物件**，不是一套配色：
 * 封套（摊在桌上）/ 唱机（一台机器在放）/ 校样（一张印厂校样）/ 棱镜（一束光被分解）。
 * 效果服从构成，动效只做这个物件真的会做的动作。
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
    id: "sleeve",
    name: "封套",
    en: "SLEEVE",
    desc: "一张唱片封套摊在桌上，黑胶从右侧抽出，封面随指针微微翻",
    thumb: "th-sl",
  },
  {
    id: "turntable",
    name: "唱机",
    en: "TURNTABLE",
    desc: "一整台唱机：盘在转、唱臂落下，右侧电平表跟着频谱跳",
    thumb: "th-tt",
  },
  {
    id: "proof",
    name: "校样",
    en: "PROOF",
    desc: "反白印刷校样：出血标题带套印偏移，歌词、曲目、参数分三栏",
    thumb: "th-pf",
  },
  {
    id: "prism",
    name: "棱镜",
    en: "PRISM",
    desc: "一束白光穿过棱镜散成五色，光束随低频呼吸，底部是发丝声浪",
    thumb: "th-pr",
  },
];

/** 四套版式共用的入参。 */
export interface SkinProps {
  state: AppState;
  data: ReturnType<typeof useStageData>;
  lyric: ReturnType<typeof useStageLyrics>;
  playing: boolean;
  tone: StageTone;
  /** 歌词层开关（stage.layers.lyric）。关掉时统一显示空态，不做假歌词。 */
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
