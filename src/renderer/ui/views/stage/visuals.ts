/**
 * C-13 视觉器的纯几何部分：封面轮播面列表、环形模式几何。
 *
 * 不碰 DOM、不碰 canvas、不碰 analyser —— 数据管线仍是唯一那份
 * `engine.spectrum(bins)`（I3 不破），这里只决定"画成什么形状"。
 * 抽成纯函数是为了让判据可断：不足两张封面必须给空数组（退回单封面），
 * 而不是硬转一张"轮播"。
 */

/** 轮播面数量上限：右栏相纸 ~200px 宽，6 张以后背面互相穿帮，没有信息量。 */
export const CAROUSEL_MAX = 6;

/**
 * 轮播面列表：当前封面在前、队列封面随后。去重、截到上限；
 * **不足两张返回空数组**（调用方退回单封面渲染，不硬转）。
 */
export function carouselFaces(current: string | null, more: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of [current, ...more]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= CAROUSEL_MAX) break;
  }
  return out.length >= 2 ? out : [];
}

/** 环形模式的几何：中心、内半径（留出盘心）、柱的最大长度。 */
export interface RingGeom {
  cx: number;
  cy: number;
  r0: number;
  /** 内半径之外还能伸多长；画布太矮时为 0（画不出来就别画）。 */
  lenMax: number;
}

/** @param w 画布宽 @param h 画布高。内半径取短边 35%；柱最长到短边一半 - 1，**不足 1px 视为 0**（画不出来就别画）。 */
export function ringGeom(w: number, h: number): RingGeom {
  const half = Math.min(w, h) / 2;
  const r0 = half * 0.35;
  const rest = half - 1 - r0;
  return { cx: w / 2, cy: h / 2, r0, lenMax: rest < 1 ? 0 : rest };
}
