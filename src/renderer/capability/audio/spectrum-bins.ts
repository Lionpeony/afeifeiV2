/**
 * 频谱分桶（A-07）：analyser 的线性频点 → 对数分布的柱子。
 *
 * 为什么不用线性：真实音乐的能量几乎全压在 4kHz 以下，线性分桶时右半边永远是空的，
 * 看起来像"只有低音"；对数分桶才是可视化器的通行做法，低频分辨率高、高频也不丢。
 *
 * 纯函数，不碰 analyser / DOM，可单测。
 */

/**
 * @param data  analyser.getByteFrequencyData 的原始 0–255 频点（按频率升序）
 * @param bins  要几根柱子
 * @returns 每根柱子 0–1；空输入返回全 0（不造假波形）
 */
export function aggregateSpectrum(data: Uint8Array | ArrayLike<number>, bins: number): number[] {
  const out: number[] = new Array(Math.max(0, bins)).fill(0);
  const count = data.length;
  if (bins <= 0 || count === 0) return out;

  // 跳过 DC（频点 0），按对数切边界；边界必须严格递增，低频段至少一个频点一根柱
  const lo = Math.min(1, count - 1);
  const ratio = count / lo;
  const edges: number[] = new Array(bins + 1);
  edges[0] = lo;
  for (let i = 1; i <= bins; i += 1) {
    const logEdge = Math.round(lo * Math.pow(ratio, i / bins));
    edges[i] = Math.min(count, Math.max(edges[i - 1] + 1, logEdge));
  }

  for (let i = 0; i < bins; i += 1) {
    const a = edges[i];
    const b = edges[i + 1];
    if (b <= a) continue; // 边界已顶到 count：该柱没有频点，保持 0
    let sum = 0;
    for (let j = a; j < b; j += 1) sum += data[j] ?? 0;
    out[i] = sum / (b - a) / 255;
  }
  return out;
}
