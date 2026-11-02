/**
 * 歌词视图状态（M4）：**解析一次、判定一次、呈现四种**（50 §7.4）。
 *
 * 行判定只有 `activeLine` 一份 —— 四个渲染器的差异只准出现在"怎么呈现"，
 * 不准各自再算一遍"现在唱到哪行"。对拍判据（同一份时间轴、活动行一致）
 * 由这个结构保证，`compareRenderers` 再用测试钉死（M4 判据：diff = 0）。
 *
 * 全部纯函数：LyricDoc + t → 视图状态。不碰 DOM、不起 rAF（t 来自合成器）。
 */
import type { LyricDoc, LyricLine } from "../../../../contracts/capability.js";

/** 当前活动行：最后一个 at <= t 的行；t 在第一行之前返回 -1。二分，5000 行也不怕。 */
export function activeLine(lines: Pick<LyricLine, "at">[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].at <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

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
  const active = activeLine(doc.lines, t);
  return { renderer: "press", active, offset: Math.max(0, active) };
}

export function minimalState(doc: LyricDoc, t: number): MinimalState {
  const active = activeLine(doc.lines, t);
  return { renderer: "minimal", active, text: active >= 0 ? doc.lines[active].text : "" };
}

export function karaokeState(doc: LyricDoc, t: number): KaraokeState {
  const active = activeLine(doc.lines, t);
  if (active < 0) return { renderer: "karaoke", active, text: "", progress: 0, chars: [] };
  const line = doc.lines[active];
  const end = line.at + line.dur;
  const progress = clamp01((t - line.at) / Math.max(1, end - line.at));
  const words = doc.words.filter((w) => w.line === active).map((w) => ({
    char: w.char,
    progress: clamp01((t - w.at) / Math.max(1, w.dur)),
  }));
  return { renderer: "karaoke", active, text: line.text, progress, chars: words };
}

export function theatricalState(doc: LyricDoc, t: number): TheatricalState {
  const active = activeLine(doc.lines, t);
  const distances = doc.lines.map((_, i) => (active < 0 ? 999 : Math.abs(i - active)));
  return { renderer: "theatrical", active, offset: Math.max(0, active), distances };
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
