/**
 * 唯一音频图（I3）。全仓库只有这个文件允许 `new AudioContext`，
 * lint 规则 2 守着这件事。
 *
 * 图结构（00 §5.1，M9-3 双路化）：
 *   <audio A> → fadeA ─┐
 *                      ├─▶ preamp → eq[10] → analyser → destination
 *   <audio B> → fadeB ─┘
 * fadeA/fadeB 是 crossfade 的两条增益曲线；preamp 是前置增益（ReplayGain 手动版）；
 * eq 是 10 段 peaking 串联。
 */
import { EQ_BANDS, dbToGain, writeEqGains } from "./eq.js";

export interface AudioGraph {
  ctx: AudioContext;
  /** A 路（元素 0）的增益。 */
  fadeA: GainNode;
  /** B 路（元素 1）的增益。 */
  fadeB: GainNode;
  preamp: GainNode;
  /** 10 段 peaking，与 EQ_BANDS 对齐。 */
  eq: BiquadFilterNode[];
  analyser: AnalyserNode;
}

let instance: AudioGraph | null = null;

export function createGraph(elA: HTMLAudioElement, elB: HTMLAudioElement): AudioGraph {
  if (instance) return instance;

  const ctx = new AudioContext();

  const fadeA = ctx.createGain();
  fadeA.gain.value = 1; // A 是主路
  const fadeB = ctx.createGain();
  fadeB.gain.value = 0; // B 是待命路

  const preamp = ctx.createGain();
  preamp.gain.value = 1;

  const eq = EQ_BANDS.map((hz) => {
    const node = ctx.createBiquadFilter();
    node.type = "peaking";
    node.frequency.value = hz;
    node.gain.value = 0;
    node.Q.value = 1;
    return node;
  });

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  let tail: AudioNode = ctx.createMediaElementSource(elA).connect(fadeA).connect(preamp);
  tail = ctx.createMediaElementSource(elB).connect(fadeB).connect(preamp);
  for (const node of eq) tail = tail.connect(node);
  tail.connect(analyser).connect(ctx.destination);

  instance = { ctx, fadeA, fadeB, preamp, eq, analyser };
  return instance;
}

/** 前置增益（dB → 线性）。0dB 等于不改声音。 */
export function setPreamp(graph: AudioGraph, db: number): void {
  graph.preamp.gain.value = dbToGain(db);
}

/**
 * 整组设置 10 段。段数不齐忽略——图不负责校验，校验在 eq.ts / store。
 * 单位换算在 eq.ts 的 writeEqGains 里（滤波器 gain 是 dB，不是线性增益）。
 */
export function setEq(graph: AudioGraph, gains: number[]): void {
  writeEqGains(graph.eq, gains);
}

/** 首次播放必须由用户手势触发，否则 AudioContext 停在 suspended。 */
export async function resumeGraph(graph: AudioGraph): Promise<void> {
  if (graph.ctx.state === "suspended") await graph.ctx.resume();
}

export function graphOrNull(): AudioGraph | null {
  return instance;
}
