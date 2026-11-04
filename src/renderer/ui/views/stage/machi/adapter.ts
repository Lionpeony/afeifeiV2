/**
 * C-13 町景适配层：afeifei 的播放器状态 → folia machi 的输入形状。
 *
 * 这一层的纪律：**纯函数 + 可测**。换歌/换主题/每帧音频都走这里映射，
 * 拷贝来的 machi 引擎一行不改语义。已在 THIRD-PARTY-NOTICES.md 登记。
 */
import type { LyricDoc } from "../../../../../contracts/lyric.js";
import type { Track } from "../../../../domain/library/schema.js";
import type {
  Line as FoliaLine,
  MotionValue,
  Theme as FoliaTheme,
  Word as FoliaWord,
} from "./vendor/folia-types.js";
import { INTERLUDE_FULL_TEXT } from "./vendor/parserCore.js";
import { hashVisualizerSeed } from "./vendor/visualizerSeedHash.js";
import type { MachiSongContext } from "./createMachiRuntime.js";

/**
 * framer-motion MotionValue 的最小实现：machi 引擎只调 get/set，
 * 我们把每帧的播放进度和音频能量从合成器 onTick 推进来。
 */
export class MachiValue<T> implements MotionValue<T> {
  private v: T;
  constructor(initial: T) {
    this.v = initial;
  }
  get(): T {
    return this.v;
  }
  set(value: T): void {
    this.v = value;
  }
}

/** folia Line：秒为单位的绝对时间轴；无逐字时 words 空（引擎自己降级到字素布局）。 */
export function toFoliaLines(doc: LyricDoc | null): FoliaLine[] {
  if (!doc) return [];
  return doc.lines.map((l) => {
    const interlude = l.text.trim() === "" || l.text.trim() === "♪" || l.text.trim() === "○";
    const words: FoliaWord[] = l.words.map((w) => ({
      text: w.text,
      startTime: (l.startMs + w.startMs) / 1000,
      endTime: (l.startMs + w.endMs) / 1000,
    }));
    return {
      fullText: interlude ? INTERLUDE_FULL_TEXT : l.text,
      startTime: l.startMs / 1000,
      endTime: l.endMs / 1000,
      words,
      translation: l.translations?.zh,
      wordSegments: words.length > 0 ? undefined : Array.from(l.text),
    } satisfies FoliaLine;
  });
}

/** 播放页主题 token → folia Theme（招牌、灯光、天空全部从这四个色派生）。 */
export function buildMachiTheme(colors: {
  bg: string;
  fg: string;
  accent: string;
  dim: string;
  line: string;
}, intensity: 0 | 1 | 2): FoliaTheme {
  return {
    name: "afeifei-stage",
    backgroundColor: colors.bg || "#0b0d12",
    primaryColor: colors.fg || "#e8e6e1",
    accentColor: colors.accent || "#c8553d",
    secondaryColor: colors.dim || colors.line || "#8a8f98",
    fontStyle: "sans",
    fontWeight: 600,
    animationIntensity: intensity === 0 ? "calm" : intensity === 1 ? "normal" : "chaotic",
    wordColors: [],
    lyricsIcons: [],
  };
}

/** 一首歌的 machi 上下文：seed 用 trackId 派生（同曲同景），isInstrumental 按「无歌词」判。 */
export function buildSongContext(track: Track | null, doc: LyricDoc | null): MachiSongContext {
  const key = track?.id ?? "no-song";
  return {
    seed: hashVisualizerSeed(key),
    lines: toFoliaLines(doc),
    isInstrumental: !doc || doc.quality === "none",
    title: track?.title ?? "",
    artist: track?.artist ?? "",
    album: track?.album ?? "",
  };
}

/** AudioBands 的零值实现：machi 引擎目前只吃 audioPower，频段摆着备用。 */
export function zeroBands(): {
  bass: MotionValue<number>;
  lowMid: MotionValue<number>;
  mid: MotionValue<number>;
  vocal: MotionValue<number>;
  treble: MotionValue<number>;
} {
  const z = new MachiValue(0);
  return { bass: z, lowMid: new MachiValue(0), mid: z, vocal: new MachiValue(0), treble: new MachiValue(0) };
}

/** 一帧频谱（0–1 值数组）→ 整体能量 0–1。对数权重低频：市街景的呼吸感主要来自鼓点。 */
export function spectrumPower(bins: readonly number[]): number {
  if (bins.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < bins.length; i += 1) {
    sum += bins[i] * (1 + 0.5 * (1 - i / bins.length));
  }
  const avg = sum / bins.length;
  return Math.max(0, Math.min(1, avg));
}
