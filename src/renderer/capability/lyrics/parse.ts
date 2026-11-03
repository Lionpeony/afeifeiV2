import type {
  LyricDoc,
  LyricFormat,
  LyricLine,
  LyricQuality,
  LyricSourceId,
  LyricWord,
} from "../../../contracts/lyric.js";
import type { TrackId } from "../../../contracts/index.js";
import { clusterSegments } from "../../domain/lyrics/segment.js";
import { detect } from "./detect.js";

/**
 * 歌词解析：LRC / 增强 LRC / QRC / YRC / TTML / 纯文本（50 §7.4）。
 *
 * **全部纯字符串处理，不依赖 DOM** —— 因为测试跑在 node 里，而且解析在主进程也要能用
 * （主进程没有 DOMParser）。用正则解 TTML 听起来糙，但 TTML 歌词的结构就那几种标签，
 * 上 XML parser 反而是给一首歌词装一台编译器。
 *
 * **产物只有一种模型**：`contracts/lyric.ts` 的 LyricDoc（21 §二）。
 * 时间一律毫秒，与 clock 同单位；**逐字时间相对行首**，行内不再做绝对/相对换错的机会。
 */

const toMs = (sec: number): number => Math.round(sec * 1000);

/** "mm:ss.xx" / "mm:ss.xxx" / "hh:mm:ss.xxx" / 老式 "mm:ss:xx"（百分秒）→ 毫秒 */
export function parseClock(raw: string): number {
  const text = raw.trim();
  const parts = text.split(":");
  if (parts.length === 1) return toMs(Number(text) || 0);
  if (parts.length === 2) {
    return toMs((Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0));
  }

  const [a, b, c] = parts;
  // 三段且最后一段没有小数点、≤ 99、小时位为 0 → 是 mm:ss:xx（百分秒），不是 hh:mm:ss
  if (!c.includes(".") && Number(c) <= 99 && Number(a) === 0) {
    return toMs((Number(a) || 0) * 60 + (Number(b) || 0) + (Number(c) || 0) / 100);
  }
  return toMs((Number(a) || 0) * 3600 + (Number(b) || 0) * 60 + (Number(c) || 0));
}

/** 解析中间态：时间仍是绝对毫秒，转成契约模型时一次性改成行内相对。 */
interface RawWord {
  at: number;
  dur: number;
  text: string;
}

interface RawLine {
  at: number;
  dur: number;
  text: string;
  words: RawWord[];
}

const LRC_META = /^\[(ti|ar|al|by|offset|length|re|ve|kana):/i;
const LRC_LEAD = /^(?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/;
const LRC_STAMP = /\[(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const LRC_WORD_SPLIT = /<(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)>/;

function parseLrc(raw: string): RawLine[] {
  const lines: RawLine[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || LRC_META.test(line)) continue;

    const lead = line.match(LRC_LEAD);
    if (!lead) continue;

    const stamps = [...lead[0].matchAll(LRC_STAMP)].map((m) => parseClock(m[1]));
    if (stamps.length === 0) continue;

    const body = line.slice(lead[0].length);
    const segments = body.split(LRC_WORD_SPLIT);
    const text = segments.filter((_, i) => i % 2 === 0).join("").trim();

    // 逐字：segments 是 [文本, 时间, 文本, 时间, 文本…]，每段文本从它前面那个时间开始
    const pieces: { at: number; text: string }[] = [];
    if (segments.length > 1) {
      let cursor = stamps[0];
      for (let i = 0; i < segments.length; i += 1) {
        if (i % 2 === 0) {
          if (segments[i]) pieces.push({ at: cursor, text: segments[i] });
        } else {
          cursor = parseClock(segments[i]);
        }
      }
    }

    // 一行多个时间标签 = 这句在歌里出现多次，展开成多行
    for (const stamp of stamps) {
      lines.push({
        at: stamp,
        dur: 0,
        text,
        words: pieces.map((p) => ({ at: p.at + (stamp - stamps[0]), dur: 0, text: p.text })),
      });
    }
  }

  return lines;
}

const QRC_LINE = /^\s*\[(\d+),(\d+)\](.*)$/;
const QRC_WORD = /\((\d+),(\d+)\)/g;

function parseQrc(raw: string): RawLine[] {
  const lines: RawLine[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const matched = QRC_LINE.exec(rawLine);
    if (!matched) continue;

    const start = Number(matched[1]);
    const dur = Number(matched[2]);
    const body = matched[3];
    const words: RawWord[] = [];

    // QRC 的形状是 `文本(时间,时长)文本(时间,时长)` —— **文本在括号之前**。
    // 字标记的时间基准有两种（2026-11-03 实测）：QQ QRC 是**绝对毫秒**
    // （第二行起 ≥ 行 start，lx 同样做此判断）；行内相对（< start）则加上行 start。
    let pos = 0;
    for (const mark of body.matchAll(QRC_WORD)) {
      const segment = body.slice(pos, mark.index);
      pos = mark.index + mark[0].length;
      if (!segment) continue;
      const markAt = Number(mark[1]);
      words.push({ at: markAt >= start ? markAt : start + markAt, dur: Number(mark[2]), text: segment });
    }

    lines.push({ at: start, dur, text: body.replace(QRC_WORD, "").trim(), words });
  }

  return lines;
}

const YRC_LINE = /^\s*\[(\d+),(\d+)\](.*)$/;
const YRC_WORD = /\((\d+),(\d+),(\d+)\)/g;

function parseYrc(raw: string): RawLine[] {
  const lines: RawLine[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const matched = YRC_LINE.exec(rawLine);
    if (!matched) continue;

    const start = Number(matched[1]);
    const dur = Number(matched[2]);
    const body = matched[3];
    const words: RawWord[] = [];

    // YRC 的格式是 (绝对时间,时长,保留)字(…)字，字在括号**之后**
    const marks = [...body.matchAll(YRC_WORD)];
    for (let i = 0; i < marks.length; i += 1) {
      const from = marks[i].index + marks[i][0].length;
      const to = i + 1 < marks.length ? marks[i + 1].index : body.length;
      const text = body.slice(from, to);
      if (!text) continue;
      words.push({ at: Number(marks[i][1]), dur: Number(marks[i][2]), text });
    }

    lines.push({ at: start, dur, text: body.replace(YRC_WORD, "").trim(), words });
  }

  return lines;
}

const TTML_P = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
const TTML_SPAN = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs);
  return m ? m[1] : null;
}

/** TTML 时间：`00:00:12.030` / `12.03s` / `12030ms` / `12030t`(忽略)。 */
export function parseTtmlTime(value: string | null): number {
  if (!value) return 0;
  const t = value.trim();
  if (t.endsWith("ms")) return Math.round(Number(t.slice(0, -2)) || 0);
  if (t.endsWith("s")) return toMs(Number(t.slice(0, -1)) || 0);
  return parseClock(t);
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function parseTtml(raw: string): RawLine[] {
  const lines: RawLine[] = [];

  for (const p of raw.matchAll(TTML_P)) {
    const begin = parseTtmlTime(attr(p[1], "begin"));
    const end = parseTtmlTime(attr(p[1], "end"));
    const inner = p[2];
    const words: RawWord[] = [];

    for (const span of inner.matchAll(TTML_SPAN)) {
      const at = parseTtmlTime(attr(span[1], "begin"));
      const spanEnd = parseTtmlTime(attr(span[1], "end"));
      const text = decodeEntities(span[2]);
      if (text) words.push({ at, dur: Math.max(0, spanEnd - at), text });
    }

    lines.push({
      at: begin,
      dur: Math.max(0, end - begin),
      text: decodeEntities(inner).replace(/\s+/g, " ").trim(),
      words,
    });
  }

  return lines;
}

function parsePlain(raw: string, totalMs: number): RawLine[] {
  const texts = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (texts.length === 0) return [];

  const each = Math.max(1000, Math.round((totalMs || texts.length * 4000) / texts.length));
  return texts.map((text, i) => ({ at: i * each, dur: each, text, words: [] }));
}

/** 补齐缺失的 dur：本行到下一行的间隔；最后一行用整曲长度或 4 秒。 */
function fillDurations(lines: RawLine[], totalMs: number): void {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].dur > 0) continue;
    const next = lines[i + 1];
    const derived = next ? next.at - lines[i].at : totalMs > lines[i].at ? totalMs - lines[i].at : 4000;
    lines[i].dur = Math.max(300, derived);
  }
}

export interface ParseOptions {
  /** 归属曲目（doc 的身份，缓存与偏移都按它索引）。 */
  trackId: TrackId;
  /** 歌词从哪来。默认 local。 */
  source?: LyricSourceId;
  /** 指定格式，不传就自动识别 */
  format?: LyricFormat;
  /** 整曲时长，用来给最后一行与纯文本估算 */
  totalMs?: number;
  /** 用户偏移（毫秒），解析时并入 doc。 */
  offsetMs?: number;
}

/** 中间态 → 契约模型：绝对时间改成"行内相对"，段落一次算完。 */
function toDoc(rawLines: RawLine[], options: ParseOptions): LyricDoc {
  const sorted = [...rawLines].sort((a, b) => a.at - b.at);
  fillDurations(sorted, options.totalMs ?? 0);

  const lines: LyricLine[] = sorted.map((raw, index) => {
    const startMs = Math.max(0, raw.at);
    const endMs = Math.max(startMs + 1, startMs + raw.dur);
    const span = endMs - startMs;

    const words: LyricWord[] = raw.words.map((w, i) => {
      const ws = Math.max(0, Math.min(span - 1, w.at - startMs));
      // LRC 的逐字段没有时长：用下一段的起点，最后一段收到行尾
      const nextAt = i + 1 < raw.words.length ? raw.words[i + 1].at - startMs : span;
      const we = w.dur > 0 ? ws + w.dur : Math.max(ws + 1, nextAt);
      return { startMs: ws, endMs: Math.max(ws + 1, we), text: w.text };
    });

    return { index, startMs, endMs, text: raw.text, words };
  });

  const hasWordTiming = lines.some((l) => l.words.length > 0);
  const segments = lines.length > 0 ? clusterSegments(lines) : [];
  const quality: LyricQuality = lines.length === 0 ? "none" : hasWordTiming ? "exact" : "estimated";

  return {
    trackId: options.trackId,
    source: options.source ?? "local",
    hasWordTiming,
    lines,
    // 只有一段 = 没有结构信息，宁可空着也不假装分了段（21 §二 决定 4）
    segments: segments.length >= 2 ? segments : [],
    offsetMs: options.offsetMs ?? 0,
    quality,
    fetchedAt: Date.now(),
  };
}

/** 解析入口：一次拿到 `LyricDoc`，所有渲染器共用这一份。 */
export function parseLyrics(raw: string, options: ParseOptions): LyricDoc {
  const text = (raw ?? "").replace(/^\uFEFF/, "");
  const format = options.format ?? detect(text);

  let rawLines: RawLine[];
  switch (format) {
    case "lrc":
      rawLines = parseLrc(text);
      break;
    case "qrc":
      rawLines = parseQrc(text);
      break;
    case "yrc":
      rawLines = parseYrc(text);
      break;
    case "ttml":
      rawLines = parseTtml(text);
      break;
    default:
      rawLines = parsePlain(text, options.totalMs ?? 0);
  }

  // 解析不出来就退回纯文本，别给界面一个空对象
  if (rawLines.length === 0 && format !== "plain") {
    return parseLyrics(text, { ...options, format: "plain" });
  }

  return toDoc(rawLines, options);
}

/** 把一份翻译（LRC/QRC 文本）按时间对齐进主 doc 的每一行。 */
export function withTranslation(doc: LyricDoc, raw: string, lang = "zh"): LyricDoc {
  const text = (raw ?? "").replace(/^\uFEFF/, "");
  if (!text.trim() || doc.lines.length === 0) return doc;

  const translated = parseLyrics(text, { trackId: doc.trackId, source: doc.source }).lines;
  if (translated.length === 0) return doc;

  const lines = doc.lines.map((line) => {
    let best = "";
    let diff = 500; // 与主歌词同行起步；超过 500ms 不算同一句
    for (const c of translated) {
      if (!c.text.trim()) continue;
      const d = Math.abs(c.startMs - line.startMs);
      if (d < diff) {
        diff = d;
        best = c.text;
      }
    }
    return best ? { ...line, translations: { ...(line.translations ?? {}), [lang]: best } } : line;
  });

  return { ...doc, lines };
}
