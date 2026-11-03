import type { LyricDoc, LyricFormat, LyricLine, LyricWord } from "../../../contracts/capability.js";
import { detect } from "./detect.js";

/**
 * 歌词解析：LRC / 增强 LRC / QRC / YRC / TTML / 纯文本（50 §7.4）。
 *
 * **全部纯字符串处理，不依赖 DOM** —— 因为测试跑在 node 里，而且解析在主进程也要能用
 * （主进程没有 DOMParser）。用正则解 TTML 听起来糙，但 TTML 歌词的结构就那几种标签，
 * 上 XML parser 反而是给一首歌词装一台编译器。
 *
 * 时间一律毫秒，与 clock 同单位。
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

const LRC_META = /^\[(ti|ar|al|by|offset|length|re|ve|kana):/i;
const LRC_LEAD = /^(?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/;
const LRC_STAMP = /\[(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const LRC_WORD_SPLIT = /<(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)>/;

function parseLrc(raw: string): { lines: LyricLine[]; words: LyricWord[] } {
  const lines: LyricLine[] = [];
  const words: LyricWord[] = [];

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
      const index = lines.length;
      lines.push({ at: stamp, dur: 0, text });
      for (const piece of pieces) {
        words.push({
          line: index,
          at: piece.at + (stamp - stamps[0]),
          dur: 0,
          char: piece.text,
        });
      }
    }
  }

  lines.sort((a, b) => a.at - b.at);
  return { lines, words };
}

const QRC_LINE = /^\s*\[(\d+),(\d+)\](.*)$/;
const QRC_WORD = /\((\d+),(\d+)\)/g;

function parseQrc(raw: string): { lines: LyricLine[]; words: LyricWord[] } {
  const lines: LyricLine[] = [];
  const words: LyricWord[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const matched = QRC_LINE.exec(rawLine);
    if (!matched) continue;

    const start = Number(matched[1]);
    const dur = Number(matched[2]);
    const body = matched[3];
    const index = lines.length;

    // 文本 = 去掉所有 (相对,时长) 之后的拼接
    lines.push({ at: start, dur, text: body.replace(QRC_WORD, "").trim() });

    // QRC 的形状是 `文本(时间,时长)文本(时间,时长)` —— **文本在括号之前**。
    // 字标记的时间基准有两种（2026-11-03 实测）：QQ QRC 是**绝对毫秒**
    // （第二行起 ≥ 行 start，lx 同样做此判断）；行内相对（< start）则加上行 start。
    let pos = 0;
    for (const mark of body.matchAll(QRC_WORD)) {
      const segment = body.slice(pos, mark.index);
      pos = mark.index + mark[0].length;
      if (segment) {
        const markAt = Number(mark[1]);
        const at = markAt >= start ? markAt : start + markAt;
        words.push({ line: index, at, dur: Number(mark[2]), char: segment });
      }
    }
  }

  return { lines, words };
}

const YRC_LINE = /^\s*\[(\d+),(\d+)\](.*)$/;
const YRC_WORD = /\((\d+),(\d+),(\d+)\)/g;

function parseYrc(raw: string): { lines: LyricLine[]; words: LyricWord[] } {
  const lines: LyricLine[] = [];
  const words: LyricWord[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const matched = YRC_LINE.exec(rawLine);
    if (!matched) continue;

    const start = Number(matched[1]);
    const dur = Number(matched[2]);
    const body = matched[3];
    const index = lines.length;

    // YRC 的格式是 (绝对时间,时长,保留)字(…)字，字在括号**之后**
    const text = body.replace(YRC_WORD, "").trim();
    lines.push({ at: start, dur, text });

    const marks = [...body.matchAll(YRC_WORD)];
    for (let i = 0; i < marks.length; i += 1) {
      const at = Number(marks[i][1]);
      const d = Number(marks[i][2]);
      // 字符 = 本括号之后到下一个括号之前的部分
      const from = marks[i].index + marks[i][0].length;
      const to = i + 1 < marks.length ? marks[i + 1].index : body.length;
      const char = body.slice(from, to);
      if (char) words.push({ line: index, at, dur: d, char });
    }
  }

  return { lines, words };
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

function parseTtml(raw: string): { lines: LyricLine[]; words: LyricWord[] } {
  const lines: LyricLine[] = [];
  const words: LyricWord[] = [];

  for (const p of raw.matchAll(TTML_P)) {
    const begin = parseTtmlTime(attr(p[1], "begin"));
    const end = parseTtmlTime(attr(p[1], "end"));
    const inner = p[2];
    const index = lines.length;
    const text = decodeEntities(inner).replace(/\s+/g, " ").trim();
    lines.push({ at: begin, dur: Math.max(0, end - begin), text });

    for (const span of inner.matchAll(TTML_SPAN)) {
      const at = parseTtmlTime(attr(span[1], "begin"));
      const spanEnd = parseTtmlTime(attr(span[1], "end"));
      const char = decodeEntities(span[2]);
      if (char) words.push({ line: index, at, dur: Math.max(0, spanEnd - at), char });
    }
  }

  return { lines, words };
}

function parsePlain(raw: string, totalMs: number): { lines: LyricLine[]; words: LyricWord[] } {
  const texts = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (texts.length === 0) return { lines: [], words: [] };

  const each = texts.length > 0 ? Math.max(1000, Math.round((totalMs || texts.length * 4000) / texts.length)) : 0;
  const lines = texts.map((text, i) => ({ at: i * each, dur: each, text }));
  return { lines, words: [] };
}

/** 补齐缺失的 dur：本行到下一行的间隔；最后一行用整曲长度或 4 秒。 */
function fillDurations(lines: LyricLine[], totalMs: number): void {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].dur > 0) continue;
    const next = lines[i + 1];
    const derived = next ? next.at - lines[i].at : totalMs > lines[i].at ? totalMs - lines[i].at : 4000;
    lines[i].dur = Math.max(300, derived);
  }
}

export interface ParseOptions {
  /** 指定格式，不传就自动识别 */
  format?: LyricFormat;
  /** 整曲时长，用来给最后一行与纯文本估算 */
  totalMs?: number;
}

/** 解析入口：一次拿到 `LyricDoc`，所有渲染器共用这一份。 */
export function parseLyrics(raw: string, options: ParseOptions = {}): LyricDoc {
  const text = (raw ?? "").replace(/^\uFEFF/, "");
  const format = options.format ?? detect(text);
  const totalMs = options.totalMs ?? 0;

  let result: { lines: LyricLine[]; words: LyricWord[] };
  switch (format) {
    case "lrc":
      result = parseLrc(text);
      break;
    case "qrc":
      result = parseQrc(text);
      break;
    case "yrc":
      result = parseYrc(text);
      break;
    case "ttml":
      result = parseTtml(text);
      break;
    default:
      result = parsePlain(text, totalMs);
  }

  // 解析不出来就退回纯文本，别给界面一个空对象
  if (result.lines.length === 0 && format !== "plain") {
    return parseLyrics(text, { ...options, format: "plain" });
  }

  fillDurations(result.lines, totalMs);

  return {
    format,
    plain: result.lines.map((l) => l.text).join("\n"),
    lines: result.lines,
    words: result.words,
    translations: [],
  };
}
