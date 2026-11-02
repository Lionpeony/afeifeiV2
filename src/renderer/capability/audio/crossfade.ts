/**
 * crossfade 的纯参数层（M9-3，00 §5.3）：双 `<audio>` 交替 + 两条增益曲线交叉。
 *
 * 这里没有任何 Web Audio 对象——曲线是纯函数，node --test 可跑。
 * 曲线取**等功率**（cos/sin，out²+in²≡1）：线性曲线在交叉点会有 -3dB 的响度坑，
 * 等功率交叉听感是平的，成本相同。
 */

/** 交叉曲线的采样点数。setValueCurveAtTime 按 this 步进，128 点足够平滑。 */
export const FADE_STEPS = 128;

/**
 * 等功率交叉曲线：p=0 时 out=1/in=0，p=1 时 out=0/in=1。
 * 喂给 GainNode.setValueCurveAtTime。
 */
export function fadeCurves(steps: number = FADE_STEPS): { out: Float32Array; inn: Float32Array } {
  const out = new Float32Array(steps);
  const inn = new Float32Array(steps);
  for (let i = 0; i < steps; i += 1) {
    const p = steps > 1 ? i / (steps - 1) : 1;
    out[i] = Math.cos((p * Math.PI) / 2);
    inn[i] = Math.sin((p * Math.PI) / 2);
  }
  return { out, inn };
}

/** crossfade 时长档位（秒）。0 = 关（行为与单元素切歌完全一致）。 */
export const CROSSFADE_CHOICES = [0, 3, 6] as const;

/** 任意来源 → 合法档位。不在档位里一律回落 0（关）。 */
export function sanitizeCrossfade(raw: unknown): number {
  return (CROSSFADE_CHOICES as readonly unknown[]).includes(raw) ? (raw as number) : 0;
}
