/**
 * 频谱柱高（A-07）：analyser 的 0–1 桶 → 画布像素高度。
 *
 * 抽成纯函数是为了让「与音量同步」有判据可断：静音（全 0 / 无数据）必须得到**全 0**，
 * 而不是画一排 2px 的假波形——那正是上一版每帧 `Math.max(2, …)` 干的事，
 * 暂停时屏幕上仍有一排静止的柱子，看着像"音频在响但没声"。
 *
 * 不碰 DOM、不碰 canvas：调用方负责把结果画出来。
 */

/** 低于这个值当静音：analyser 的底噪常在 0.001–0.003，画出来是一片毛刺。 */
export const SILENT = 0.004;

/**
 * @param data  analyser 聚合后的桶（0–1，可能为 null = 图未建）
 * @param bars  要几根柱子（决定输出长度，与 canvas 宽度对齐）
 * @param height 画布高度（柱高按它的 90% 封顶，留一点顶边）
 */
export function barHeights(data: readonly number[] | null | undefined, bars: number, height: number): number[] {
  const out: number[] = new Array(bars).fill(0);
  if (!data) return out;
  const top = height * 0.9;
  for (let i = 0; i < bars; i += 1) {
    const v = data[i];
    if (!v || v <= SILENT) continue; // 静音就是 0，不画地板线
    out[i] = Math.min(1, v) * top;
  }
  return out;
}
