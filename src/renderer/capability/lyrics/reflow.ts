import type { LyricDoc, LyricLine } from "../../../contracts/lyric.js";
import { clusterSegments } from "../../domain/lyrics/segment.js";

/**
 * 智能重排（50 §7.4）：把一整句长歌词切成能看的多行。
 *
 * 三条规则，都是被真实排版坑出来的：
 *   1. **行首不留标点** —— 标点应该跟着上一行结尾；
 *   2. **最后一行不留单字** —— 孤零零一个字挂在下面很难看；
 *   3. **时间按字数比例分配** —— 不能平均分，长段本来就该显示得久。
 *
 * 逐字行不参与重排：它按字显示，切了反而破坏时间轴。
 */

const PUNCT = /[，。、；：！？…—～·,.;:!?]/;
/** 够长才在标点处断，否则太短的行会碎成一小截一小截 */
const PUNCT_BREAK_RATIO = 0.6;

const countChars = (s: string): number => Array.from(s).length;

export interface ReflowOptions {
  /** 每行最多几个字符 */
  maxChars?: number;
}

function splitLine(text: string, maxChars: number): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  let buf = "";

  for (const ch of chars) {
    buf += ch;
    if (PUNCT.test(ch) && countChars(buf) >= maxChars * PUNCT_BREAK_RATIO) {
      out.push(buf);
      buf = "";
    } else if (countChars(buf) >= maxChars) {
      out.push(buf);
      buf = "";
    }
  }

  if (buf) {
    // 最后一行只剩一个字 → 并进上一行，避免"孤字"
    if (out.length > 0 && countChars(buf) < 2) out[out.length - 1] += buf;
    else out.push(buf);
  }

  return out.length > 0 ? out : [text];
}

/** 把一行拆成多行，时间按字数比例分。 */
function reflowLine(line: LyricLine, maxChars: number): LyricLine[] {
  if (countChars(line.text) <= maxChars) return [line];

  const pieces = splitLine(line.text, maxChars);
  if (pieces.length <= 1) return [line];

  const total = pieces.reduce((sum, p) => sum + countChars(p), 0) || 1;
  const span = Math.max(1, line.endMs - line.startMs);
  let cursor = line.startMs;

  return pieces.map((text, index) => {
    const share =
      index === pieces.length - 1
        ? Math.max(0, line.endMs - cursor)
        : Math.max(300, Math.round((span * countChars(text)) / total));
    const built: LyricLine = { index: 0, startMs: cursor, endMs: cursor + share, text, words: [] };
    cursor += share;
    return built;
  });
}

export function reflow(doc: LyricDoc, options: ReflowOptions = {}): LyricDoc {
  const maxChars = Math.max(6, options.maxChars ?? 18);

  const lines: LyricLine[] = [];
  for (const line of doc.lines) {
    // 逐字行不切：切了逐字时间就对不上
    const produced = line.words.length > 0 ? [line] : reflowLine(line, maxChars);
    for (const l of produced) lines.push({ ...l, index: lines.length });
  }

  const segments = lines.length > 0 ? clusterSegments(lines) : [];
  return { ...doc, lines, segments: segments.length >= 2 ? segments : [] };
}
