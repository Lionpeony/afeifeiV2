/**
 * 游标：给定播放位置，返回当前行/字。
 * **纯函数** —— 六套播放样式、歌词页、报告页都调这一个（21 §二决定 6）。
 * 二分查找，O(log n)，每帧调用无压力。
 */
import type { LyricCursor, LyricDoc } from "../../../contracts/lyric";

/** 二分：返回最后一个 startMs <= pos 的行下标；没有则 -1。 */
function findLine(doc: LyricDoc, positionMs: number): number {
  const { lines } = doc;
  if (!lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= positionMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** 行内二分：返回最后一个 startMs <= rel 的字下标；没有则 -1。 */
function findWord(words: { startMs: number }[], rel: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].startMs <= rel) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function cursorAt(doc: LyricDoc, positionMs: number): LyricCursor {
  const empty: LyricCursor = { lineIndex: -1, wordIndex: -1, nextLineIndex: doc.lines.length ? 0 : -1 };
  if (!doc.lines.length) return empty;

  const pos = positionMs - doc.offsetMs;
  const li = findLine(doc, pos);
  if (li < 0) return { lineIndex: -1, wordIndex: -1, nextLineIndex: 0 };

  const line = doc.lines[li];
  // 行尾之后 = 间奏（下一行开始前）；已是最后一行则没有"下一行"
  if (pos >= line.endMs) {
    const next = li + 1 < doc.lines.length ? li + 1 : -1;
    return { lineIndex: -1, wordIndex: -1, nextLineIndex: next };
  }

  let wordIndex = -1;
  if (line.words.length) {
    wordIndex = findWord(line.words, pos - line.startMs);
  }

  return {
    lineIndex: li,
    wordIndex,
    nextLineIndex: li + 1 < doc.lines.length ? li + 1 : -1,
  };
}

/** 反向：点击第 i 行跳转时用（A-21 歌词点击跳句的落点）。 */
export function lineStartMs(doc: LyricDoc, lineIndex: number): number | null {
  const line = doc.lines[lineIndex];
  return line ? line.startMs + doc.offsetMs : null;
}
