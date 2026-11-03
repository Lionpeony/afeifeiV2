/**
 * LRC 解析（21 §二实施顺序第 1–2 步）。
 * 支持行级 `[mm:ss.xx]` 与增强逐字 `[00:12.00]<00:12.00>字<00:12.50>字`。
 * 产物是纯数据 LyricDoc —— 不做网络、不做聚类（那是第 3 步）。
 */
import type {
  LyricDoc,
  LyricLine,
  LyricSourceId,
  LyricWord,
} from "../../../contracts/lyric";
import type { TrackId } from "../../../contracts/index";

/** 解析 `mm:ss` / `mm:ss.xx` / `mm:ss.xxx` 为毫秒。非法返回 null。 */
export function parseTimestamp(raw: string): number | null {
  const m = /^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(raw.trim());
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec > 59) return null;
  const frac = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
  return min * 60_000 + sec * 1000 + frac;
}

/** 从一行里剥出所有 `[...]` 标签与剩余正文。 */
function splitTags(line: string): { tags: string[]; text: string } {
  const tags: string[] = [];
  let rest = line;
  const re = /^\[([^\[\]]*)\]/;
  let m = re.exec(rest);
  while (m) {
    tags.push(m[1]);
    rest = rest.slice(m[0].length);
    m = re.exec(rest);
  }
  return { tags, text: rest.trim() };
}

/** 解析增强逐字 `<mm:ss.xx>字`。没有则返回空数组。 */
function parseWords(text: string, lineStartMs: number): { clean: string; words: LyricWord[] } {
  if (!text.includes("<")) return { clean: text, words: [] };
  const words: LyricWord[] = [];
  const re = /<(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)>([^<]*)/g;
  let m: RegExpExecArray | null;
  const starts: number[] = [];
  const texts: string[] = [];
  while ((m = re.exec(text))) {
    const ts = parseTimestamp(m[1]);
    if (ts === null) continue;
    starts.push(ts);
    texts.push(m[2]);
  }
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1] : starts[i] + 2_000;
    const w = texts[i].trim();
    if (!w) continue;
    words.push({ startMs: Math.max(0, starts[i] - lineStartMs), endMs: end - lineStartMs, text: w });
  }
  // 正文 = 所有字拼起来（去掉时间标签）
  const clean = words.map((w) => w.text).join("") || text.replace(/<[^>]*>/g, "").trim();
  return { clean, words };
}

export interface ParseLrcOptions {
  trackId: TrackId;
  source?: LyricSourceId;
  /** 外部偏移（毫秒）。LRC 自带 [offset:] 会与此叠加。 */
  offsetMs?: number;
}

/**
 * 解析 LRC 全文。解析失败 / 空文件返回 `quality:"none"` 的空 doc，不抛错。
 */
export function parseLrc(raw: string, options: ParseLrcOptions): LyricDoc {
  const empty: LyricDoc = {
    trackId: options.trackId,
    source: options.source ?? "local",
    hasWordTiming: false,
    lines: [],
    segments: [],
    offsetMs: options.offsetMs ?? 0,
    quality: "none",
    fetchedAt: Date.now(),
  };
  if (!raw || !raw.trim()) return empty;

  const metaOffset = /(?:^|\n)\s*\[offset:\s*(-?\d+)\s*\]/.exec(raw);
  const offsetMs = (options.offsetMs ?? 0) + (metaOffset ? Number(metaOffset[1]) : 0);

  interface Draft {
    startMs: number;
    text: string;
    words: LyricWord[];
  }
  const drafts: Draft[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const { tags, text } = splitTags(rawLine);
    if (!text) continue;
    // 时间标签：可能有多个（一行多时间 = 合唱/重复段）
    const times: number[] = [];
    let hasWordTag = false;
    for (const tag of tags) {
      const ts = parseTimestamp(tag);
      if (ts !== null) times.push(ts);
      else if (tag.includes("<")) hasWordTag = true;
    }
    if (!times.length) continue;
    // 逐字标签在正文里
    const { clean, words } = parseWords(text, times[0]);
    const body = words.length ? clean : text;
    if (!body) continue;
    for (const t of times) {
      drafts.push({
        startMs: t,
        text: body,
        words: words.map((w) => ({ ...w, startMs: w.startMs + (t - times[0]) })),
      });
    }
    void hasWordTag;
  }

  if (!drafts.length) return empty;

  drafts.sort((a, b) => a.startMs - b.startMs);

  const lines: LyricLine[] = drafts.map((d, i) => {
    const next = drafts[i + 1];
    // 行尾 = 下一行开始（LRC 没有行尾信息）；间隔太大截到 8 秒，避免"悬停"半分钟
    const endMs = next ? Math.min(next.startMs, d.startMs + 8_000) : d.startMs + 5_000;
    return {
      index: i,
      startMs: d.startMs,
      endMs,
      text: d.text,
      words: d.words,
    };
  });

  const hasWordTiming = lines.some((l) => l.words.length > 0);

  return {
    trackId: options.trackId,
    source: options.source ?? "local",
    hasWordTiming,
    lines,
    segments: [],          // 段落聚类是第 3 步（21 §二），v1 先空
    offsetMs,
    quality: hasWordTiming ? "exact" : "estimated",
    fetchedAt: Date.now(),
  };
}
