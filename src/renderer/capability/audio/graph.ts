/**
 * 唯一音频图（I3）。全仓库只有这个文件允许 `new AudioContext`，
 * lint 规则 2 守着这件事。
 *
 * 图结构（50 §5.1）：
 *   <audio> → fade → preamp → eq[6] → analyser → destination
 * fade 管切歌淡入淡出；preamp 是前置增益（ReplayGain 手动版）；
 * eq 是 6 段 peaking 串联；M3 把 crossfade 接在 fade 上。
 */
import { EQ_BANDS, dbToGain } from "./eq.js";

export interface AudioGraph {
  ctx: AudioContext;
  fade: GainNode;
  preamp: GainNode;
  /** 6 段 peaking，与 EQ_BANDS 对齐。 */
  eq: BiquadFilterNode[];
  analyser: AnalyserNode;
}

let instance: AudioGraph | null = null;

export function createGraph(el: HTMLAudioElement): AudioGraph {
  if (instance) return instance;

  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(el);

  const fade = ctx.createGain();
  fade.gain.value = 1;

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

  let tail: AudioNode = source.connect(fade).connect(preamp);
  for (const node of eq) tail = tail.connect(node);
  tail.connect(analyser).connect(ctx.destination);

  instance = { ctx, fade, preamp, eq, analyser };
  return instance;
}

/** 前置增益（dB → 线性）。0dB 等于不改声音。 */
export function setPreamp(graph: AudioGraph, db: number): void {
  graph.preamp.gain.value = dbToGain(db);
}

/** 整组设置 6 段。段数不齐忽略——图不负责校验，校验在 eq.ts / store。 */
export function setEq(graph: AudioGraph, gains: number[]): void {
  graph.eq.forEach((node, i) => {
    node.gain.value = dbToGain(gains[i] ?? 0);
  });
}

/** 首次播放必须由用户手势触发，否则 AudioContext 停在 suspended。 */
export async function resumeGraph(graph: AudioGraph): Promise<void> {
  if (graph.ctx.state === "suspended") await graph.ctx.resume();
}

export function graphOrNull(): AudioGraph | null {
  return instance;
}
