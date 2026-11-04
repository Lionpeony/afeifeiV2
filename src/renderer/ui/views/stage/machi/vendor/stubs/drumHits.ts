/**
 * 桩：folia `services/analysis/drumHits`（htdemucs 鼓点分离，ML 推理服务）。
 *
 * 我们的架构没有 stems 管线，v1 返回 null——engine/beatFx 的涟漪/闪拍走"没有鼓点"的
 * 常态分支，场景其余动效（霓虹环境闪烁、音频包络、天气、车流）不受影响。
 * 将来要节拍涟漪，从我们的 analyser 做 onset 估计填 `DrumHits` 即可（结构照 folia）。
 */

export type DrumHitKind = 0 | 1 | 2; // folia drumHitPicking：0 kick / 1 snare / 2 hat

export const DRUM_KICK: DrumHitKind = 0;
export const DRUM_SNARE: DrumHitKind = 1;
export const DRUM_HAT: DrumHitKind = 2;

export interface DrumHits {
  times: Float64Array;
  strengths: Float32Array;
  kinds: Uint8Array;
  /** 分离还没跑完时：鼓点到达的时间（秒），之后 unknown。 */
  until?: number;
}

export const getDrumHits = (_key: string | null): DrumHits | null => null;
