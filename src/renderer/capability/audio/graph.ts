/**
 * 唯一音频图（I3）。全仓库只有这个文件允许 `new AudioContext`，
 * lint 规则 2 守着这件事。
 *
 * 图结构（50 §5.1）：
 *   <audio> → fade → preamp → eq → analyser → destination
 * 四段都是可插拔 stage 的雏形，M3 会把 EQ 扩成多段、把 fade 接上 crossfade。
 */

export interface AudioGraph {
  ctx: AudioContext;
  fade: GainNode;
  preamp: GainNode;
  eq: BiquadFilterNode;
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

  const eq = ctx.createBiquadFilter();
  eq.type = "peaking";
  eq.frequency.value = 1000;
  eq.gain.value = 0;
  eq.Q.value = 1;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  source.connect(fade).connect(preamp).connect(eq).connect(analyser).connect(ctx.destination);

  instance = { ctx, fade, preamp, eq, analyser };
  return instance;
}

/** 首次播放必须由用户手势触发，否则 AudioContext 停在 suspended。 */
export async function resumeGraph(graph: AudioGraph): Promise<void> {
  if (graph.ctx.state === "suspended") await graph.ctx.resume();
}

export function graphOrNull(): AudioGraph | null {
  return instance;
}
