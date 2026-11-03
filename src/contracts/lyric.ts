/** 歌词数据契约（21 §2）。纯类型，main 与 renderer 共用，不许放实现。 */
import type { TrackId } from "./index";

/** 上游格式。解析用，不进 doc（doc 只关心"有没有逐字"与"质量"）。 */
export type LyricFormat = "lrc" | "qrc" | "yrc" | "ttml" | "plain";

/** 歌词数据从哪来。匹配优先级：local(内嵌) > lrclib > 在线源 > manual */
export type LyricSourceId = "embedded" | "local" | "lrclib" | "netease" | "qq" | "manual";

/** 质量档。**界面必须按这个档降级显示**（20 §一 1.7 五态的歌词部分）。 */
export type LyricQuality = "exact" | "estimated" | "none";

/** 一行歌词里的一个字/词（逐字时间轴）。没有逐字数据时 words 为空。 */
export interface LyricWord {
  /** 相对行起始的毫秒偏移（不是绝对时间）。 */
  startMs: number;
  endMs: number;
  text: string;
}

/** 一行歌词。 */
export interface LyricLine {
  /** 行号 = 在 lines 数组里的下标。段落用 lineIndexes 引用它。 */
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  /** 逐字时间轴。为空数组或缺省 = 整行级（降级渲染）。 */
  words: LyricWord[];
  /** 翻译，按语言代码。key 用 BCP-47 小写（zh / en / ja）。 */
  translations?: Record<string, string>;
}

/**
 * 段落（L1 结构）。由段落聚类产出（50 §6 的结构层）。
 * **界面上所有"段"的信息都从这里读，禁止自己算。**
 */
export interface LyricSegment {
  index: number;
  /** 前奏 / 主歌 A / 副歌 / 桥段 / 尾奏 … */
  name: string;
  startMs: number;
  endMs: number;
  /** 段内行号（引用 lines[].index）。 */
  lineIndexes: number[];
  /** 聚类置信度 0–1。低于 0.6 的段，界面用虚线边界（见 C1 的 estimated 态）。 */
  confidence: number;
  /** 边界来源：exact = 逐字数据可证；estimated = 按间隔推算。 */
  boundary: "exact" | "estimated";
}

/**
 * **歌词唯一真相源**（20 B-01）。
 * 六套播放样式、歌词页、报告页**只读这一份**，禁止任何视图自算行。
 */
export interface LyricDoc {
  trackId: TrackId;
  source: LyricSourceId;
  /** 是否有逐字时间轴（决定渲染器能不能做卡拉OK）。 */
  hasWordTiming: boolean;
  /** 按 startMs 升序。 */
  lines: LyricLine[];
  /** 段落（可能为空数组 = 没有结构数据，界面隐藏段落条，不显示占位）。 */
  segments: LyricSegment[];
  /** 用户手动偏移（毫秒，可正可负）。持久化在 KV，随 doc 一起算。 */
  offsetMs: number;
  /** 总体质量。exact = 逐字且来源可靠；estimated = 行级或推算；none = 没有歌词。 */
  quality: LyricQuality;
  fetchedAt: number;
}

/** 给定时刻，当前在哪一行、行内哪个字。所有歌词渲染器共用这一个函数。 */
export interface LyricCursor {
  /** 当前行 index；-1 = 前奏/间奏（不在任何行内）。 */
  lineIndex: number;
  /** 行内字 index；-1 = 整行级（无逐字）。 */
  wordIndex: number;
  /** 下一行 index；最后一行后为 -1。 */
  nextLineIndex: number;
}

/** 歌词服务端口（环 1 的 domain/lyrics 实现，环 0–4 只认这个接口）。 */
export interface LyricPort {
  /** 拿某首曲目的歌词文档。无歌词返回 quality:"none" 的空 doc，不抛错。 */
  get(trackId: TrackId): Promise<LyricDoc>;
  /** 给定播放位置，算游标。纯函数，任何视图都能调。 */
  cursorAt(doc: LyricDoc, positionMs: number): LyricCursor;
  /** 用户调偏移（±500ms，持久化）。返回新 doc。 */
  setOffset(trackId: TrackId, offsetMs: number): Promise<LyricDoc>;
  /** 手动换一个来源重取（LRCLIB / 在线 / 手动粘贴）。 */
  refetch(trackId: TrackId, source: LyricSourceId): Promise<LyricDoc>;
}
