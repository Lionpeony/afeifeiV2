/**
 * EQ 与前置增益的纯参数层（50 §5.1：6 段 Biquad ±12dB、preamp ±12dB）。
 *
 * 这里**没有**任何 Web Audio 对象——全是纯函数，能在 node --test 下跑。
 * 频段、限幅、校验、dB→线性换算都收在这一个文件；AudioContext 相关在 graph.ts。
 */
import type { AudioConfig } from "../../../contracts/index.js";

/** 6 段中心频率（Hz）。写死：频段一变，所有持久化数据都作废，必须走迁移。 */
export const EQ_BANDS = [60, 200, 700, 2500, 7500, 15000] as const;

/** 每段与 preamp 的增益上下限（dB）。50 §5.1 的 ±12dB。 */
export const GAIN_LIMIT_DB = 12;

export const EQ_DEFAULT: number[] = EQ_BANDS.map(() => 0);
export const PREAMP_DEFAULT = 0;

/** 越界与非数一律回落到界内 / 0 —— 持久化数据不可信。 */
export function clampDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(GAIN_LIMIT_DB, Math.max(-GAIN_LIMIT_DB, db));
}

/** dB → 线性增益（GainNode 用）。0dB 必须等于 1（不改声音）。 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** 任意来源 → 合法 6 段。长度不对一律整体回落默认（部分生效的 EQ 更难排查）。 */
export function sanitizeGains(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length !== EQ_BANDS.length) return [...EQ_DEFAULT];
  return raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? clampDb(v) : 0));
}

/** KV 里存的 { preampDb, eq } → 合法配置。null / 坏结构回落默认。 */
export function sanitizeAudioConfig(raw: unknown): AudioConfig {
  if (!raw || typeof raw !== "object") {
    return { preampDb: PREAMP_DEFAULT, eq: [...EQ_DEFAULT] };
  }
  const r = raw as { preampDb?: unknown; eq?: unknown };
  return {
    preampDb:
      typeof r.preampDb === "number" && Number.isFinite(r.preampDb)
        ? clampDb(r.preampDb)
        : PREAMP_DEFAULT,
    eq: sanitizeGains(r.eq),
  };
}
