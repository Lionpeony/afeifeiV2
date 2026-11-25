import type { LyricDoc, LyricSegment } from "../../../contracts/lyric.js";

/**
 * 歌词正则过滤（Ring 1，纯函数 + 一份当前规则）。
 *
 * 抄 folia `LyricFilterSettingsModal` 的两条规则：
 *  ① 规则存在本地，改规则**不需要重新抓歌词**；
 *  ② 过滤发生在「解析之后、显示之前」，解析出的时间轴不受影响。
 *
 * 因此这里保留 `LyricDoc` 的原始行，每次规则变化重算一次展示用 doc。
 * 正则统一忽略大小写（`(i)` 是 JS RegExp 的参数，不是模式里的 `(?i)`）。
 */

/** 预设：版权声明 / 歌词来源。用户勾了就往规则表里加一行。 */
export const FILTER_PRESETS = [
  { label: "版权声明", pattern: "版权|未经许可|翻唱|原唱|出品|发行|OP:|SP:" },
  { label: "歌词来源", pattern: "歌词|LRC|作词|作曲|编曲|by @|QQ音乐|网易云" },
] as const;

/**
 * 内置署名过滤（不依赖用户设置，永远生效）。
 *
 * 多数在线词源会把「作词 : 某某 / 出品：某某」这类制作信息和时间轴一起塞进 LRC，
 * 它们会被当成正文，用歌词的字号压在主位上——播放页一眼看去全是职员表。
 * 这些行不是歌词，属于元信息，统一在「解析之后、显示之前」剔掉。
 *
 * 规则刻意收紧到「关键词 + 冒号/斜杠」或「整行版权声明」，
 * 避免误伤「曲终人散」这种正常歌词（没有冒号就不算）。
 */
const META_LINE_RULES: readonly RegExp[] = [
  // 中文署名：作词 : / 作曲：/ 编曲/ 制作人/ 监制/ 出品/ 发行/ 企划/ 混音/ 母带 …
  /^\s*(?:作词|作曲|编曲|制作人|制作|监制|出品|发行|企划|策划|统筹|混音|母带|录音|和声|配唱|吉他|贝斯|鼓|键盘|弦乐|文案|封面|美术|词|曲)\s*[:：/]/i,
  // 英文 credit：Lyricist: / Composer / Arranger / Producer / Mixing / Mastering / Studio
  /^\s*(?:lyricist|composer|arranger|producer|mixing|mastering|recorded|studio|op|sp)\b\s*[:：/]/i,
  // LRC 元标签残留：[by:] / [ti:] / [ar:] / [offset:] …
  /^\s*\[(?:by|ti|ar|al|offset|length|re|ve|tool|kana)\s*[:：]/i,
  // 整行版权声明（没有冒号也算）：未经许可不得翻唱、版权所有、℗ / ©
  /(?:未经许可|不得翻唱|不得使用|版权所有|版权归|℗|©)/,
  // 纯署名机构：某某工作室 / 某某唱片 / 某某文化
  /^\s*[^\s]{1,24}(?:工作室|唱片|文化|传媒|娱乐)\s*$/,
];

/** 只有标签、没有值的署名行（就是截图里的 `Starling8:`）。
 *  限定 ASCII 开头 + 冒号收尾，避免把「她：」这类正常歌词当署名删掉。 */
const LABEL_ONLY_CREDIT = /^[A-Za-z0-9][A-Za-z0-9 .,'&·_\-]{0,19}[:：]\s*$/;

/** 是不是「该被剔掉的元信息行」。空行也算（间奏留白不需要占一行）。 */
export function isMetaLine(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  return LABEL_ONLY_CREDIT.test(t) || META_LINE_RULES.some((r) => r.test(t));
}

export interface LyricFilterRule {
  pattern: string;
  enabled: boolean;
}

let rules: LyricFilterRule[] = [];
const listeners = new Set<() => void>();

export const getFilters = (): readonly LyricFilterRule[] => rules;

export function setFilters(next: LyricFilterRule[]): void {
  rules = next;
  for (const fn of listeners) fn();
}

export function subscribeFilters(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 一行一条正则；空白行与非法正则直接丢掉（用户手滑写一个 `[` 不该让歌词整页消失）。 */
export function parseFilters(raw: string | null): LyricFilterRule[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: LyricFilterRule[] = [];
    for (const x of parsed) {
      if (typeof x === "string" && x.trim()) out.push({ pattern: x.trim().slice(0, 200), enabled: true });
      else if (x && typeof x === "object") {
        const r = x as Partial<LyricFilterRule>;
        if (typeof r.pattern === "string" && r.pattern.trim()) {
          out.push({ pattern: r.pattern.trim().slice(0, 200), enabled: r.enabled !== false });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

export const serializeFilters = (list: readonly LyricFilterRule[]): string => JSON.stringify(list);

/** 文本行 → 规则表；界面上的 textarea 用这个换形。 */
export function rulesFromText(text: string): LyricFilterRule[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((pattern) => ({ pattern: pattern.slice(0, 200), enabled: true }));
}

export const rulesToText = (list: readonly LyricFilterRule[]): string =>
  list.map((r) => r.pattern).join("\n");

/** 编译规则：非法正则跳过；其余统一忽略大小写、用 search 语义（不要求整行匹配）。 */
function compile(list: readonly LyricFilterRule[]): RegExp[] {
  const out: RegExp[] = [];
  for (const rule of list) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      out.push(new RegExp(rule.pattern, "i"));
    } catch {
      /* 坏规则跳过 */
    }
  }
  return out;
}

/** 写错了的正则（给设置页提示，不能静默吞掉）：返回的是模式文本，不是 Error 对象。 */
export function invalidPatterns(list: readonly LyricFilterRule[]): string[] {
  const out: string[] = [];
  for (const rule of list) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      new RegExp(rule.pattern, "i");
    } catch {
      out.push(rule.pattern);
    }
  }
  return out;
}

/**
 * 丢行 + 重建下标。
 * `LyricSegment.lineIndexes` 引用的是 `lines[].index`，直接 `filter()` 会让段指向别的行。
 * 一行都没丢时返回原对象（调用方靠这个做幂等）。
 */
function dropLines(doc: LyricDoc, shouldDrop: (text: string) => boolean): LyricDoc {
  const kept = doc.lines.filter((line) => !shouldDrop(line.text));
  if (kept.length === doc.lines.length) return doc;

  const remap = new Map<number, number>();
  const lines = kept.map((line, i) => {
    remap.set(line.index, i);
    return { ...line, index: i };
  });

  const segments: LyricSegment[] = (doc.segments ?? [])
    .map((segment) => ({
      ...segment,
      lineIndexes: segment.lineIndexes
        .map((old) => remap.get(old))
        .filter((n): n is number => n !== undefined),
    }))
    .filter((segment) => segment.lineIndexes.length > 0)
    .map((segment, i) => ({ ...segment, index: i }));

  return { ...doc, lines, segments };
}

/** 剔掉制作信息 / 版权行 / 空行。与用户规则无关，永远先跑一遍。 */
export function stripMetaLines(doc: LyricDoc): LyricDoc {
  if (!doc.lines?.length) return doc;
  return dropLines(doc, isMetaLine);
}

/** 按用户规则过滤并**重建下标**（`stripMetaLines` 之后还要再过这一层）。 */
export function filterLyricDoc(doc: LyricDoc, list: readonly LyricFilterRule[]): LyricDoc {
  const regs = compile(list);
  if (regs.length === 0) return doc;
  return dropLines(doc, (text) => regs.some((r) => r.test(text)));
}
