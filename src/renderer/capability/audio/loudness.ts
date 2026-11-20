/**
 * 响度均衡（P0 #8）：不同来源的母带响度差很大，切歌时音量忽大忽小。
 * 这里用慢速 AGC 把输出拉向一个统一目标，配一个末端限幅器防止增益抬升削波。
 *
 * 只做「拉齐来源差异」，不做动态压缩：250ms 采样、±6dB 上限、2dB 死区、
 * 1dB/次步进——慢到听不出抽吸，快到切歌几秒内就位。纯计算部分可单测。
 */

/** 目标 RMS（dBFS）。-14 接近流行乐母带响度，古典/环境录音会被抬一点。 */
export const LEVELER_TARGET_DB = -14;
/** 侦测门限：低于这个响度当作静音/间奏，不抬增益（否则会把底噪拉起来）。 */
export const LEVELER_FLOOR_DB = -55;
/** 单次调整上限与总增益上下限。 */
const MAX_STEP_DB = 1;
const MAX_GAIN_DB = 6;
const DEAD_ZONE_DB = 2;

/**
 * 下一拍的增益（dB）。rmsDb 是**当前增益之后**测到的响度，
 * 所以想要的绝对增益 = 当前增益 + (目标 - 当前响度)。
 */
export function levelerTargetDb(rmsDb: number, currentGainDb: number): number {
  if (!Number.isFinite(rmsDb) || rmsDb < LEVELER_FLOOR_DB) return currentGainDb;
  const want = currentGainDb + (LEVELER_TARGET_DB - rmsDb);
  const delta = want - currentGainDb;
  if (Math.abs(delta) < DEAD_ZONE_DB) return currentGainDb;
  const step = currentGainDb + Math.sign(delta) * Math.min(MAX_STEP_DB, Math.abs(delta));
  return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, step));
}

export interface Leveler {
  setEnabled(on: boolean): void;
  dispose(): void;
}

interface CtxLike {
  currentTime: number;
}

/** 每 250ms 读一次时域波形，按 RMS 缓慢调整增益。 */
export function createLeveler(
  ctx: CtxLike,
  gain: GainNode,
  analyser: AnalyserNode,
  initiallyOn: boolean,
): Leveler {
  let on = initiallyOn;
  let gainDb = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let buffer: Float32Array<ArrayBuffer> | null = null;

  const tick = (): void => {
    if (!on) return;
    const count = analyser.fftSize;
    if (!buffer || buffer.length !== count) buffer = new Float32Array(count);
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < count; i += 1) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / count);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    const next = levelerTargetDb(rmsDb, gainDb);
    if (next !== gainDb) {
      gainDb = next;
      gain.gain.setTargetAtTime(10 ** (gainDb / 20), ctx.currentTime, 0.8);
    }
  };

  const start = (): void => {
    if (timer) return;
    timer = setInterval(tick, 250);
  };
  const stop = (): void => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  if (on) start();

  return {
    setEnabled(next: boolean): void {
      if (next === on) return;
      on = next;
      if (on) start();
      else {
        stop();
        gainDb = 0;
        gain.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
      }
    },
    dispose(): void {
      stop();
    },
  };
}
