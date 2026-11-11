/**
 * 发行页的纯数据规则（docs/29 §5 / SPEC-VISUAL §3 §4 §5）。
 * 全部是无状态纯函数：侧标映射、标题计长、目录号 —— 方便复查，不藏在组件里。
 */

/** 曲名/标题混排的拉丁判字（与 typography.ts 同一把尺：ASCII + 拉丁扩展）。 */
const LATIN = /[\x20-\x7EÀ-ɏ]/;

/** 侧标字母面：A1–A4 → B1…，26 面封顶（盒装套碟语义，>104 首才触达）。 */
const SIDE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 环列位 → 侧标（SPEC-VISUAL §5）：每面 4 首，位 0 = A1，环回无记忆位。 */
export const sideLabel = (pos: number): string => {
  const face = SIDE_LETTERS[Math.min(Math.max(0, Math.floor(pos / 4)), SIDE_LETTERS.length - 1)];
  return `${face}${(pos % 4) + 1}`;
};

/** hero 标题计长（SPEC-VISUAL §4.1）：CJK（含全角标点）= 1，拉丁/数字/半角标点/空格 = 0.5。 */
export const titleUnits = (text: string): number => {
  let units = 0;
  for (const ch of text) units += LATIN.test(ch) ? 0.5 : 1;
  return units;
};

export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 目录号源码（SPEC-VISUAL §3.1）：每日推荐 DR；客座取来源标签前 2 字符；空 → EX。 */
export const catCode = (guest: boolean, origin: string | null): string => {
  if (!guest) return "DR";
  const raw = (origin ?? "").trim();
  return raw ? raw.slice(0, 2) : "EX";
};

/** 目录号：`CAT.{码}-{YYYYMMDD}-{序号} · STEREO`；整串超 26 字符先丢 STEREO 后缀。 */
export const catNumber = (code: string, pos: number, now: Date): string => {
  const ymd = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const base = `CAT.${code}-${ymd}-${pad2(Math.max(1, pos))}`;
  return base.length + 9 <= 26 ? `${base} · STEREO` : base;
};

/** YYYY-MM-DD（封套下 plate-meta 的日期段）。 */
export const today = (now: Date): string =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
