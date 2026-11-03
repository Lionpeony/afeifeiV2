/**
 * EQ 与前置增益的纯参数层（A-06：10 段 Biquad ±12dB、4 个预设、preamp ±12dB）。
 *
 * 这里**没有**任何 Web Audio 对象——全是纯函数，能在 node --test 下跑。
 * 频段、限幅、校验、预设、dB→线性换算都收在这一个文件；AudioContext 相关在 graph.ts。
 */
import type { AudioConfig } from "../../../contracts/index.js";
import { sanitizeCrossfade } from "./crossfade.js";

/**
 * 10 段中心频率（Hz）。写死：频段一变，所有持久化数据都作废，必须走迁移。
 * 与 v1 的 6 段不同，这里补齐了 32/64 与 8k，低频与齿音都够用。
 */
export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

/** 每段与 preamp 的增益上下限（dB）。50 §5.1 的 ±12dB。 */
export const GAIN_LIMIT_DB = 12;

export const EQ_DEFAULT: number[] = EQ_BANDS.map(() => 0);
export const PREAMP_DEFAULT = 0;

/**
 * v1 的 6 段（[60,200,700,2500,7500,15000]）。老存档里是这个长度，
 * 读的时候按"对数频率最近的段"换算成 10 段，不把用户的 EQ 清零。
 */
const LEGACY_6 = [60, 200, 700, 2500, 7500, 15000];
/** 每个新段对应的老段下标（按 log 频率最近；手工算好写成常量，避免运行期浮点比较）。 */
const LEGACY_MAP = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5];

/** 越界与非数一律回落到界内 / 0 —— 持久化数据不可信。 */
export function clampDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(GAIN_LIMIT_DB, Math.max(-GAIN_LIMIT_DB, db));
}

/** dB → 线性增益（GainNode 用）。0dB 必须等于 1（不改声音）。 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** 老 6 段存档 → 10 段（按最近频段取值）。 */
export function migrateGains6(raw: number[]): number[] {
  return LEGACY_MAP.map((i) => clampDb(raw[i] ?? 0));
}

/** 任意来源 → 合法 10 段。长度不对：6 段走迁移，其余整组回落默认。 */
export function sanitizeGains(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...EQ_DEFAULT];
  if (raw.length === LEGACY_6.length) {
    return migrateGains6(raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0)));
  }
  if (raw.length !== EQ_BANDS.length) return [...EQ_DEFAULT];
  return raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? clampDb(v) : 0));
}

/** 两组增益是否完全相同（UI 用它点亮当前预设）。 */
export function sameGains(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * 把 10 段 dB 写进滤波器数组。
 *
 * BiquadFilterNode.gain 的单位**就是 dB**；早先这里套了 dbToGain，
 * 结果 +6dB 实际只加了 2dB（10^(6/20)），整条 EQ 听感偏软。
 * 抽成函数是为了让 node --test 能钉住"写的必须是 dB 原值"。
 */
export function writeEqGains(nodes: { gain: { value: number } }[], gainsDb: number[]): void {
  nodes.forEach((node, i) => {
    node.gain.value = clampDb(gainsDb[i] ?? 0);
  });
}

export interface EqPreset {
  id: string;
  name: string;
  /** 与 EQ_BANDS 等长 */
  gains: number[];
}

/**
 * 预设（判据要 ≥3，给 4 个）。数值是听感取向，不是玄学：
 * 人声压 32–125 的轰鸣、抬 2k–4k 的咬字；夜间反过来，压 8k 以上，少刺耳。
 */
export const EQ_PRESETS: EqPreset[] = [
  { id: "flat", name: "平直", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "vocal", name: "人声", gains: [-8, -6, -3, -1, 1, 3, 4, 3, 0, -2] },
  { id: "bass", name: "低频", gains: [7, 6, 4, 2, 0, 0, -1, -1, 0, 0] },
  { id: "night", name: "夜间", gains: [-3, -1, 1, 3, 3, 2, 0, -2, -4, -6] },
];

/** KV 里存的 { preampDb, eq, crossfadeSec } → 合法配置。null / 坏结构回落默认。 */
export function sanitizeAudioConfig(raw: unknown): AudioConfig {
  if (!raw || typeof raw !== "object") {
    return { preampDb: PREAMP_DEFAULT, eq: [...EQ_DEFAULT], crossfadeSec: 0 };
  }
  const r = raw as { preampDb?: unknown; eq?: unknown; crossfadeSec?: unknown };
  return {
    preampDb:
      typeof r.preampDb === "number" && Number.isFinite(r.preampDb)
        ? clampDb(r.preampDb)
        : PREAMP_DEFAULT,
    eq: sanitizeGains(r.eq),
    crossfadeSec: sanitizeCrossfade(r.crossfadeSec),
  };
}
