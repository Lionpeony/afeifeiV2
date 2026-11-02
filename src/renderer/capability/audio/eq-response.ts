/**
 * EQ 频响曲线的纯参数层（M9-4，M4 遗留）：6 段 peaking 级联的幅频响应。
 *
 * 零 Web Audio 对象——RBJ cookbook 公式手算，node --test 可跑。
 * 曲线与实际滤波器一致的两个前提：同一套 EQ_BANDS、同一 Q（graph 里 Q=1）、
 * 同一采样率（引擎给 graph 的 ctx.sampleRate，图未建时 UI 用默认值近似）。
 *
 * 级联的传递函数是各段相乘，dB 域相加就是精确解，不是近似。
 */
import { EQ_BANDS } from "./eq.js";

/** 单个 peaking 滤波器在频率 f 处的响应（dB）。gainDb=0 恒等于 0dB。 */
function peakingDb(gainDb: number, f0: number, q: number, fs: number, f: number): number {
  if (gainDb === 0 || f0 <= 0 || f <= 0) return 0;
  const A = Math.pow(10, gainDb / 40); // peaking 用 gain/2，±12dB 满程对应 A=10^0.3
  const w0 = (2 * Math.PI * f0) / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha / A;

  // |H(e^{jw})|²，w = 2πf/fs
  const w = (2 * Math.PI * f) / fs;
  const cosW = Math.cos(w);
  const cos2W = Math.cos(2 * w);
  const num = b0 * b0 + b1 * b1 + b2 * b2 + 2 * (b0 * b1 + b1 * b2) * cosW + 2 * b0 * b2 * cos2W;
  const den = a0 * a0 + a1 * a1 + a2 * a2 + 2 * (a0 * a1 + a1 * a2) * cosW + 2 * a0 * a2 * cos2W;
  if (den <= 0 || num <= 0) return 0; // 数值兜底，不该发生
  return 10 * Math.log10(num / den);
}

/**
 * 6 段级联在给定频率点上的响应（dB）。
 * gainsDb 与 EQ_BANDS 对齐；freqs 是任意一组频率（画图用对数取样）。
 */
export function eqResponseDb(
  gainsDb: number[],
  freqs: number[],
  fs = 48000,
  q = 1,
): number[] {
  return freqs.map((f) =>
    gainsDb.reduce((sum, g, i) => sum + peakingDb(g, EQ_BANDS[i] ?? 15000, q, fs, f), 0),
  );
}

/** 画图用的对数频率取样：20Hz–20kHz，n 个点。 */
export function logFreqs(n: number): number[] {
  const lo = Math.log10(20);
  const hi = Math.log10(20000);
  return Array.from({ length: n }, (_, i) => 10 ** (lo + ((hi - lo) * i) / Math.max(1, n - 1)));
}
