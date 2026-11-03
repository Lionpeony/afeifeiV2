/**
 * QRC / YRC 解析（**逐字歌词的真实来源**）。
 *
 * 为什么需要它（2026-11-03 实测结论）：
 *   LRCLIB 的 syncedLyrics **全部是行级 LRC**（探针实测：20 条命中 0 条带逐字标签），
 *   所以 LRCLIB 只能做行级兜底；逐字必须从音源侧拿：
 *     · 网易云 YRC：[行开始ms,行时长ms]<字相对ms,字时长ms,0>字
 *     · QQ    QRC：[行开始ms,行时长ms]字(字相对ms,字时长ms)
 *   本地 LRC 文件里的增强 LRC（<mm:ss.xx>字）由 parse-lrc 处理。
 *
 * 两种格式的字时间都是**相对行开始**的毫秒。
 */
import type { LyricDoc, LyricLine, LyricWord } from "../../../contracts/lyric";
import type { TrackId } from "../../../contracts/index";

/** 行标签：[数字,数字] */
const LINE_TAG = /^\[(\d+),(\d+)\]/;
/** YRC 逐字：<相对ms,时长ms,0>字 —— 字在标签**之后** */
const YRC_WORD = /<(\d+),(\d+),\d*>([^<]*)/g;
/** QRC 逐字：字(相对ms,时长ms) */
const QRC_WORD = /([^(]*)\((\d+),(\d+)\)/g;

export interface ParseQrcOptions {
  trackId: TrackId;
  offsetMs?: number;
}

/** 自动判格式：YRC 有 <>，QRC 有 ()。都不是则返回 null（交给行级 LRC 兜底）。 */
export function detectKaraokeFormat(raw: string): "yrc" | "qrc" | null {
  const line = raw.split(/\r?\n/).find((l) => LINE_TAG.test(l)) ?? "";
  if (!line) return null;
  if (YRC_WORD.test(line)) {
    YRC_WORD.lastIndex = 0;
    return "yrc";
  }
  if (QRC_WORD.test(line)) {
    QRC_WORD.lastIndex = 0;
    return "qrc";
  }
  return null;
}

export function parseQrc(raw: string, options: ParseQrcOptions): LyricDoc | null {
  const format = detectKaraokeFormat(raw);
  if (!format) return null;

  const drafts: { startMs: number; endMs: number; text: string; words: LyricWord[] }[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const lm = LINE_TAG.exec(rawLine);
    if (!lm) continue;
    const lineStart = Number(lm[1]);
    const lineDur = Number(lm[2]);
    const body = rawLine.slice(lm[0].length);

    const words: LyricWord[] = [];
    let text = "";

    if (format === "yrc") {
      YRC_WORD.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = YRC_WORD.exec(body))) {
        const wStart = Number(m[1]);
        const wDur = Number(m[2]);
        const w = m[3].trim();
        if (!w) continue;
        words.push({ startMs: wStart, endMs: wStart + wDur, text: w });
        text += w;
      }
    } else {
      QRC_WORD.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = QRC_WORD.exec(body))) {
        const w = m[1].trim();
        const wStart = Number(m[2]);
        const wDur = Number(m[3]);
        if (!w) continue;
        words.push({ startMs: wStart, endMs: wStart + wDur, text: w });
        text += w;
      }
    }

    if (!text) continue;
    drafts.push({
      startMs: lineStart,
      endMs: lineStart + lineDur,
      text,
      words,
    });
  }

  if (!drafts.length) return null;
  drafts.sort((a, b) => a.startMs - b.startMs);

  const lines: LyricLine[] = drafts.map((d, i) => ({
    index: i,
    startMs: d.startMs,
    endMs: d.endMs,
    text: d.text,
    words: d.words,
  }));

  return {
    trackId: options.trackId,
    source: "manual",
    hasWordTiming: true,
    lines,
    segments: [],
    offsetMs: options.offsetMs ?? 0,
    quality: "exact",
    fetchedAt: Date.now(),
  };
}
