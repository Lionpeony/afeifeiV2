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
 * 过滤行并**重建下标**：`LyricSegment.lineIndexes` 引用的是 `lines[].index`，
 * 直接 `filter()` 会让段指向别的行（剧场渲染器会跳错段）。
 */
export function filterLyricDoc(doc: LyricDoc, list: readonly LyricFilterRule[]): LyricDoc {
  const regs = compile(list);
  if (regs.length === 0) return doc;

  const remap = new Map<number, number>();
  const lines = doc.lines
    .filter((line) => !regs.some((r) => r.test(line.text)))
    .map((line, i) => {
      remap.set(line.index, i);
      return { ...line, index: i };
    });

  const segments: LyricSegment[] = doc.segments
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
