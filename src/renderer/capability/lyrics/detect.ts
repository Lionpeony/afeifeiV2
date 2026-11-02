import type { LyricFormat } from "../../../contracts/capability.js";

/**
 * 格式识别。**先看结构标记，再看时间轴长相** —— 只看"有没有 [mm:ss]"会把 QRC 误判成 LRC。
 */

const TTML_MARK = /<tt[\s>]|xmlns="[^"]*ttml/i;
/** QRC：行首 [毫秒,时长]，中间没有冒号 */
const QRC_MARK = /^\s*\[\d+,\d+\]/m;
/** YRC：词级 (毫秒,毫秒,保留位) */
const YRC_MARK = /\(\d+,\d+,\d+\)/;
/** LRC：[mm:ss.xx] 或 [mm:ss:xx] */
const LRC_MARK = /\[\d{1,3}:\d{1,2}([.:]\d{1,3})?\]/;

export function detect(raw: string): LyricFormat {
  const text = raw.trim();
  if (!text) return "plain";

  if (TTML_MARK.test(text)) return "ttml";
  if (YRC_MARK.test(text)) return "yrc";
  if (QRC_MARK.test(text)) return "qrc";
  if (LRC_MARK.test(text)) return "lrc";
  return "plain";
}
