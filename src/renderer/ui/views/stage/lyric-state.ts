/**
 * 歌词视图状态（M4）：**解析一次、判定一次、呈现四种**（50 §7.4）。
 *
 * 行判定只有 `activeLine` 一份 —— 四个渲染器的差异只准出现在"怎么呈现"，
 * 不准各自再算一遍"现在唱到哪行"。对拍判据（同一份时间轴、活动行一致）
 * 由这个结构保证，`compareRenderers` 再用测试钉死（M4 判据：diff = 0）。
 *
 * 全部纯函数：LyricDoc + t → 视图状态。不碰 DOM、不起 rAF（t 来自合成器）。
 * 模型只有 `contracts/lyric.ts` 一份（21 §二）：行用 startMs/endMs，逐字用**行内相对**。
 */
import type { LyricDoc, LyricLine } from "../../../../contracts/lyric.js";

/** 当前活动行：最后一个 startMs <= t 的行；t 在第一行之前返回 -1。二分，5000 行也不怕。 */
export function activeLine(lines: Pick<LyricLine, "startMs">[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 用户偏移只在这一个地方生效：四个渲染器都从这里取"歌词时刻"。
 * 偏移为正 = 歌词整体提前（用户觉得歌词慢半拍时往右调）。
 */
const cue = (doc: LyricDoc, t: number): number => activeLine(doc.lines, t - doc.offsetMs);

export interface PressState {
  renderer: "press";
  active: number;
  /** 滚动偏移：活动行上方还有几行（× 行高 = translateY） */
  offset: number;
}

export interface MinimalState {
  renderer: "minimal";
  active: number;
  text: string;
}

export interface KaraokeState {
  renderer: "karaoke";
  active: number;
  text: string;
  /** 整行进度（无逐字数据时用） */
  progress: number;
  /** 逐字进度。没有 words 时为空数组，UI 回落整行进度 */
  chars: { char: string; progress: number }[];
}

export interface TheatricalState {
  renderer: "theatrical";
  active: number;
  /** 同 press 的滚动偏移（位移交给 CSS 按距离衰减） */
  offset: number;
  /** 每行到活动行的距离（0 = 活动行），UI 用它算透明度与缩放 */
  distances: number[];
}

export function pressState(doc: LyricDoc, t: number): PressState {
  const active = cue(doc, t);
  return { renderer: "press", active, offset: Math.max(0, active) };
}

export function minimalState(doc: LyricDoc, t: number): MinimalState {
  const active = cue(doc, t);
  return { renderer: "minimal", active, text: active >= 0 ? doc.lines[active].text : "" };
}

export function karaokeState(doc: LyricDoc, t: number): KaraokeState {
  const active = cue(doc, t);
  if (active < 0) return { renderer: "karaoke", active, text: "", progress: 0, chars: [] };
  const line = doc.lines[active];
  const at = t - doc.offsetMs; // 逐字进度也走同一时刻，否则字会与行错开
  const progress = clamp01((at - line.startMs) / Math.max(1, line.endMs - line.startMs));
  const chars = line.words.map((w) => ({
    char: w.text,
    progress: clamp01((at - (line.startMs + w.startMs)) / Math.max(1, w.endMs - w.startMs)),
  }));
  return { renderer: "karaoke", active, text: line.text, progress, chars };
}

export function theatricalState(doc: LyricDoc, t: number): TheatricalState {
  const active = cue(doc, t);
  const distances = doc.lines.map((_, i) => (active < 0 ? 999 : Math.abs(i - active)));
  return { renderer: "theatrical", active, offset: Math.max(0, active), distances };
}

/**
 * 田字格点亮几个字（A-04 判据「逐字着色；无逐字数据时降级为整行」）。
 *
 * 抽成纯函数是因为这段分支原来埋在组件的每帧回调里，测试碰不到：
 * 只能靠肉眼判断"这屏到底是不是逐字"。现在三种输入三种输出，各有判据：
 * ① 有逐字数据且与格子数一一对应 → 按字点亮（唱过一个亮一个）；
 * ② 没有逐字数据 + press（田字格）→ 整句一次落墨（这是 press 的语义，不是退化成动画）；
 * ③ 没有逐字数据 + karaoke → 按行进度折算，宁可粗也不装出逐字。
 */
export function litCount(renderer: "press" | "karaoke", k: KaraokeState, boxes: number): number {
  if (boxes <= 0) return 0;
  if (k.chars.length === boxes) return k.chars.filter((c) => c.progress >= 1).length;
  if (renderer === "press") return boxes;
  return Math.round(clamp01(k.progress) * boxes);
}

/**
 * 对拍：四个渲染器在同一 (doc, t) 下的活动行必须一致。
 * 返回 null = diff 为 0；否则返回一段能直接贴进 issue 的差异描述。
 */
export function compareRenderers(doc: LyricDoc, t: number): string | null {
  const a = pressState(doc, t).active;
  const b = minimalState(doc, t).active;
  const c = karaokeState(doc, t).active;
  const d = theatricalState(doc, t).active;
  return a === b && b === c && c === d
    ? null
    : `t=${t}：press=${a} minimal=${b} karaoke=${c} theatrical=${d}`;
}
