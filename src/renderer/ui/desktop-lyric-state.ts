/**
 * 桌面歌词窗的投影（P0-21）：**同一份 doc + 同一个时刻 → 一行字 + 已唱到第几个字**。
 *
 * 抽成纯函数是因为"逐字点亮"最容易被写成"看着差不多"：
 * 埋进窗口组件的每帧回调里，就只能靠肉眼判断；这里三种输入三种输出，各有判据
 * （`test/desktop-lyric.test.mjs`）。
 *
 * 逐字进度**复用播放页的 `karaokeState`**，不另算一套 —— 桌面歌词与播放页错开半个字
 * 是这类功能最典型的偏差，两边同源就不会错。
 */
import type { LyricDoc, LyricLine } from "../../contracts/lyric.js";
import { karaokeState } from "./views/stage/lyric-state.js";

export interface DesktopLyricState {
  /** 当前行；前奏/间奏为空串（窗口据此整块淡出，而不是显示上一句） */
  text: string;
  /** 译文；没有就空串（窗口不占位，不显示空行） */
  translation: string;
  /** 已唱字数（`text` 的前缀长度）。无逐字数据时按行进度折算 */
  lit: number;
  /** 行内进度 0..1 */
  progress: number;
}

const EMPTY: DesktopLyricState = { text: "", translation: "", lit: 0, progress: 0 };

/** 译文优先中文；没有中文标签就取第一条 —— 上游标签不统一，别指望一定有 `zh`。 */
function pickTranslation(line: LyricLine): string {
  const tr = line.translations;
  if (!tr) return "";
  return tr.zh ?? tr["zh-hans"] ?? tr["zh-cn"] ?? Object.values(tr)[0] ?? "";
}

export function desktopLyricState(doc: LyricDoc | null, t: number): DesktopLyricState {
  if (!doc || doc.lines.length === 0) return EMPTY;

  // 时刻、用户偏移、活动行全部走 karaokeState：与播放页同轴
  const k = karaokeState(doc, t);
  if (k.active < 0) return EMPTY;

  const line = doc.lines[k.active];
  const text = line.text;

  // 有逐字数据：按"已唱完的词"累计字数；没有则按行进度折算（宁可粗，也不装成逐字）
  const done = line.words.length
    ? line.words.reduce((n, w, i) => n + (k.chars[i]?.progress >= 1 ? w.text.length : 0), 0)
    : Math.round(k.progress * text.length);

  return {
    text,
    translation: pickTranslation(line),
    lit: Math.max(0, Math.min(text.length, done)),
    progress: k.progress,
  };
}
