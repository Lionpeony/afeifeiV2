import type { Track } from "../library/schema.js";
import { PINYIN_INITIALS } from "./pinyin-data.js";

/**
 * 拼音首字母搜索（50 §18 第 2 条：输入 2 个字符就要出目标歌）。
 *
 * 只做首字母，不做全拼 —— 全拼表 103KB，首字母 21KB，而"打 2 个字母出歌"只需要首字母。
 * 真需要全拼时再取数据源里的 f 字段。
 */

const CJK_START = 0x4e00;
const CJK_END = 0x9fff;

/** 汉字转拼音首字母，非汉字原样保留（数字、英文照常参与匹配）。 */
export function initialsOf(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= CJK_START && cp <= CJK_END) {
      out += PINYIN_INITIALS.charAt(cp - CJK_START) || " ";
    } else {
      out += ch;
    }
  }
  return out;
}

/** 一条曲目的三种可匹配形态。预先算好存进索引，搜索时不再逐条转换。 */
export interface SearchKey {
  /** 小写原文：标题 + 歌手 + 专辑 */
  base: string;
  /** 全拼首字母串（去掉空格，便于连续匹配） */
  initials: string;
  /** 每个字段各自的首字母，用于"字段开头匹配"排序 */
  fields: string[];
}

export function searchKeyOf(track: Pick<Track, "title" | "artist" | "album">): SearchKey {
  const fields = [track.title, track.artist, track.album].filter(Boolean) as string[];
  const base = fields.join(" ").toLowerCase();
  const initials = initialsOf(fields.join("")).replace(/\s+/g, "");
  return { base, initials, fields };
}

export function matchKey(key: SearchKey, keyword: string): boolean {
  const k = keyword.toLowerCase().trim().replace(/\s+/g, "");
  if (!k) return true;
  if (key.base.includes(k)) return true;
  if (key.initials.includes(k)) return true;
  return false;
}

/**
 * 匹配得分，越小越靠前。
 * 0 = 字段开头命中（打 "qi" 出「七里香」而不是「小情歌」），1 = 中间命中。
 */
export function scoreKey(key: SearchKey, keyword: string): number {
  const k = keyword.toLowerCase().trim().replace(/\s+/g, "");
  if (!k) return 2;
  for (const field of key.fields) {
    const lower = field.toLowerCase();
    if (lower.startsWith(k)) return 0;
    if (initialsOf(field).replace(/\s+/g, "").startsWith(k)) return 0;
  }
  return 1;
}
