/**
 * 段落聚类 v1（21 §二实施顺序第 3 步）。
 * **间隔法 + 重复文本检测**，全部启发式 → `boundary:"estimated"`（v1 没有逐字证据可证边界）。
 * 命名规则（可解释，写在这里而不是藏在代码里）：
 *   首段且起点 ≤5s            → 前奏
 *   首行文本与此前某段相同     → 副歌（重复是副歌最强的可检测信号）
 *   其余                      → 主歌 N（按出现顺序编号）
 */
import type { LyricLine, LyricSegment } from "../../../contracts/lyric";

/** 行间隔达到这个值就算段落边界。4 秒左右：太短会把慢歌切开，太长会漏。 */
export const SEGMENT_GAP_MS = 3_200;

/** 副歌判据：段首行文本与此前任一段的首行文本完全一致。 */
function isRefrain(group: LyricLine[], priorFirstTexts: string[]): boolean {
  const first = group[0]?.text?.trim();
  return !!first && priorFirstTexts.includes(first);
}

export function clusterSegments(
  lines: LyricLine[],
  options: { gapMs?: number; totalMs?: number } = {},
): LyricSegment[] {
  if (!lines.length) return [];
  const gapMs = options.gapMs ?? SEGMENT_GAP_MS;

  // 1. 按"行间隔 ≥ gapMs"切组
  const groups: LyricLine[][] = [];
  let cur: LyricLine[] = [lines[0]];
  for (let i = 1; i < lines.length; i += 1) {
    const gap = lines[i].startMs - lines[i - 1].endMs;
    if (gap >= gapMs) {
      groups.push(cur);
      cur = [lines[i]];
    } else {
      cur.push(lines[i]);
    }
  }
  groups.push(cur);

  // 2. 命名 + 置信度
  const priorFirstTexts: string[] = [];
  let verseNo = 0;
  let refrainNo = 0;

  const segs: LyricSegment[] = groups.map((group, gi) => {
    const startMs = group[0].startMs;
    const endMs = group[group.length - 1].endMs;
    const gapBefore = gi === 0 ? Number.POSITIVE_INFINITY : startMs - groups[gi - 1][groups[gi - 1].length - 1].endMs;

    let name: string;
    let confidence = 0.5;

    if (gi === 0 && startMs <= 5_000) {
      name = "前奏";
      confidence += 0.15;
    } else if (isRefrain(group, priorFirstTexts)) {
      refrainNo += 1;
      name = refrainNo > 1 ? `副歌 ${refrainNo}` : "副歌";
      confidence += 0.25;   // 重复文本是副歌最强的可检测信号
    } else {
      verseNo += 1;
      name = `主歌 ${verseNo}`;
      confidence += 0.05;
    }

    if (gapBefore >= 5_000) confidence += 0.15;
    else if (gapBefore >= gapMs) confidence += 0.08;

    priorFirstTexts.push(group[0].text.trim());

    return {
      index: gi,
      name,
      startMs,
      endMs,
      lineIndexes: group.map((l) => l.index),
      confidence: Math.min(0.9, Math.max(0.3, Number(confidence.toFixed(2)))),
      // v1 全部 estimated：间隔法给不出"逐字级证据"（21 §二决定 4）
      boundary: "estimated" as const,
    };
  });

  return segs;
}
