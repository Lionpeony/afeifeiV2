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
