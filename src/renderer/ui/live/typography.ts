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

/** hero 大标题档位（2026-11-11 领队拍板；可红判据在 live-shots 长标题段）：
 *  >24 单位 → cs-title-clip：任意窗形单行省略（44px，单行本就占位可控）；
 *  >14 ≤24 → cs-title-long：44px 两行钳；窄窗（<1180 宽，T1）或矮窗（<760 高）
 *  追加 cs-title-narrow 降到 38px——与窄屏字号阶同纪律，占位可控。
 *  两个布尔由 useViewportTier（matchMedia）喂；字号数值落在 cover-stage.css。 */
export function heroTitleTiers(units: number, narrow: boolean, short: boolean): string {
  if (units > 24) return "cs-title-clip";
  if (units > 14) return narrow || short ? "cs-title-long cs-title-narrow" : "cs-title-long";
  return "";
}
