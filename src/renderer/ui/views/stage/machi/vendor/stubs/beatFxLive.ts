/**
 * 桩：folia `services/beatFx/beatFxLive`（智能动感模式的实时拍点流）。
 * 我们没有拍点分析管线：一律报告"没就绪、强度 0"，engine/beatFx 全部走常态分支。
 */

export const getBeatEffectStrength = (_id: string): number => 0;
export const getBeatFxHeard = (): { time: number | null; key: string | null } => ({ time: null, key: null });
export const getBeatFxEvents = (): readonly never[] => [];
export const getBeatFxTrackScale = (): number => 1;
export const isBeatFxReady = (): boolean => false;
