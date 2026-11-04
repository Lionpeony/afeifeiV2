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

/** 轮播面：id 去重键；url 为 null = 没封面的曲目，渲染占位盘（folia Carousel3D 的行为）。 */
export interface CarouselItem {
  id: string;
  url: string | null;
}

/**
 * 轮播面列表：按传入顺序去重、截到上限；
 * **不足两张返回空数组**（调用方退回单封面渲染，不硬转）。
 * 没封面的条目保留（url=null 交渲染层画占位）——这是 folia `Carousel3D.tsx`
 * 对 `coverUrl` 缺失条目的处理：占位盘，而不是把它踢出轮播。
 */
export function carouselItems(items: (CarouselItem | null)[]): CarouselItem[] {
  const out: CarouselItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
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
