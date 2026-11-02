/**
 * 封面取色纯函数（M9-2，00 §9.3）：sRGB → OKLCH 量化 → 亮度夹取 [0.35, 0.75]。
 *
 * 只产一个 `oklch(L C H)` 字符串，调用方只准写 `--stage-tint`（结构层禁读）。
 * 全程算术，零 DOM、零解码 —— node --test 可直接跑（dist-test/stage-tint.mjs）。
 *
 * 量化：L/C 按 0.05、H 按 15° 分桶，取最大桶，桶内取均值（色相按圆均值，
 * 350° 和 10° 的平均是 0° 不是 180°）。
 */

/** sRGB(0–255) → 线性光。 */
function linear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** sRGB → OKLab（Björn Ottosson 的标准矩阵）。 */
function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export const L_MIN = 0.35;
export const L_MAX = 0.75;

/**
 * 一批 sRGB 像素（扁平 [r,g,b, r,g,b, …]，无 alpha）→ 取色结果。
 * 空输入返回 null（调用方保留当前 tint，不写变量）。
 */
export function stageTint(rgb: number[]): string | null {
  const n = Math.floor(rgb.length / 3);
  if (n === 0) return null;

  // 量化分桶：最大桶 = 主色
  const buckets = new Map<string, number[]>();
  const lab: [number, number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const [L, a, b] = rgbToOklab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    lab.push([L, a, b]);
    const C = Math.hypot(a, b);
    const H = (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360;
    const key = `${Math.round(L / 0.05)},${Math.round(C / 0.05)},${Math.round(H / 15) % 24}`;
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }
  let best: number[] = [];
  for (const list of buckets.values()) if (list.length > best.length) best = list;

  // 桶内均值：L 直接平均，色相走圆均值（sin/cos）
  let sumL = 0;
  let sumSin = 0;
  let sumCos = 0;
  for (const i of best) {
    const [L, a, b] = lab[i];
    sumL += L;
    sumSin += Math.sin((Math.atan2(b, a)));
    sumCos += Math.cos((Math.atan2(b, a)));
  }
  const L = Math.min(L_MAX, Math.max(L_MIN, sumL / best.length));
  const H = Math.hypot(sumSin, sumCos) < 1e-6 ? 0 : ((((Math.atan2(sumSin, sumCos) * 180) / Math.PI) + 360) % 360);
  return `oklch(${L.toFixed(3)} ${(Math.hypot(lab[best[0]][1], lab[best[0]][2])).toFixed(3)} ${H.toFixed(1)})`;
}
