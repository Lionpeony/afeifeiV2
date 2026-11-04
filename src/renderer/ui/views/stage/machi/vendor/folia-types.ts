/**
 * folia 的歌词/主题类型（verbatim 子集）。
 *
 * 来源：folia-major `src/types.ts`（AGPL-3.0）。只取 machi 闭包用到的定义，
 * 字段一一照抄——类型形状变了会静默错位，宁多勿少。
 * 已在 THIRD-PARTY-NOTICES.md 登记。
 */

export interface LyricSyllable {
  text: string;
  startTime: number; // Seconds
  endTime: number; // Seconds
  obscene?: boolean;
  emptyBeat?: number;
}

export interface LyricAlternateText {
  role: 'translation' | 'romanization' | string;
  language?: string;
  text: string;
  syllables?: LyricSyllable[];
}

export interface Word {
  text: string;
  startTime: number; // Seconds
  endTime: number; // Seconds
  syllables?: LyricSyllable[];
}

export interface LyricBackgroundVocal {
  text: string;
  startTime: number; // Seconds
  endTime: number; // Seconds
  words: Word[];
  agentId?: string;
  translation?: string;
  romanization?: string;
  alternateTexts?: LyricAlternateText[];
}

export interface Line {
  words: Word[];
  startTime: number;
  endTime: number;
  fullText: string;
  translation?: string;
  id?: string;
  agentId?: string;
  songPart?: string;
  blockIndex?: number;
  romanization?: string;
  alternateTexts?: LyricAlternateText[];
  backgroundVocal?: LyricBackgroundVocal;
  backgroundVocals?: LyricBackgroundVocal[];
  renderHints?: import('./renderHints.js').LineRenderHints;
  isChorus?: boolean;
  chorusEffect?: 'bars' | 'circles' | 'beams';
  wordSegments?: string[];
  autoWordSegments?: string[];
}

export interface Theme {
  name: string;
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
  fontStyle: 'sans' | 'serif' | 'mono';
  fontFamily?: string;
  fontFamilyStack?: string[];
  fontWeight?: number;
  animationIntensity: 'calm' | 'normal' | 'chaotic';
  wordColors?: { word: string; color: string }[];
  lyricsIcons?: string[];
  provider?: string;
  description?: string;
}

/** folia 的音频频段（framer-motion MotionValue 的结构最小面，见 vendor/motion.ts）。 */
export interface AudioBands {
  bass: MotionValue<number>;
  lowMid: MotionValue<number>;
  mid: MotionValue<number>;
  vocal: MotionValue<number>;
  treble: MotionValue<number>;
  spectrum?: MotionValue<Uint8Array<ArrayBuffer>>;
}

export type LyricRenderScale = 0.5 | 0.75 | 1 | 1.5 | 2;
export type LyricAntialias = 'auto' | 'on' | 'off';
export interface LyricRenderQuality {
  scale: LyricRenderScale;
  antialias: LyricAntialias;
}
export interface LyricRenderOverride {
  scale: 'global' | LyricRenderScale;
  antialias: 'global' | 'on' | 'off';
}

/** framer-motion MotionValue 的结构最小面：machi 闭包只调 get/set。 */
export interface MotionValue<T> {
  get(): T;
  set(value: T): void;
}
