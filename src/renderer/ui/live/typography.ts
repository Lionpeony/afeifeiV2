/**
 * 标题混排：ASCII 段走 Bahnschrift（窄体、有厂牌感），非 ASCII 段走宋体。
 * 只做切分，组件负责渲染；纯函数便于复用与复查。
 */
export interface TitleRun {
  text: string;
  latin: boolean;
}

const LATIN = /[\x20-\x7EÀ-ɏ]/;

export function splitLatinRuns(text: string): TitleRun[] {
  const runs: TitleRun[] = [];
  for (const ch of text) {
    const latin = LATIN.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.latin === latin) last.text += ch;
    else runs.push({ text: ch, latin });
  }
  return runs;
}

/** 视觉单位估宽：CJK/全角记 1，拉丁/数字/半角标点记 0.5（与 splitLatinRuns 同一切分）。
    长标题降档的唯一判据（2026-11-11 拍板）：hero 大标题 >14 单位降到 44px，
    >24 单位单行省略 + title 全文；卡面曲名/艺人一律单行省略。 */
export function visualUnits(text: string): number {
  let units = 0;
  for (const ch of text) units += LATIN.test(ch) ? 0.5 : 1;
  return units;
}
