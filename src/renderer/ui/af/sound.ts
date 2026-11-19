/* 极简交互音效 · WebAudio 合成，无需素材文件（从 offline_single/js/sound.js 移植）
   默认音量低于音乐；setEnabled 跟 sfx 开关联动。 */

let ctx: AudioContext | null = null;
let enabled = true;

/* 包音色：同一套音效，换包时跟着换气质（anime-theme-packs.html §02「UI 音色」落点）
   rate=频率倍率（低=闷），gainMul=音量倍率（小=社恐）。 */
const PACK_SFX: Record<string, { rate: number; gainMul: number }> = {
  default: { rate: 1, gainMul: 1 },
  mygo: { rate: 0.82, gainMul: 0.85 }, // 雨夜·闷柔
  gbc: { rate: 1.14, gainMul: 1.2 },   // 干硬·顶
  btr: { rate: 1, gainMul: 0.5 },      // 墙角·小声，怕吵到人
};
let sfxPack = PACK_SFX.default;

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function env(node: GainNode, t0: number, attack: number, decay: number, peak: number): void {
  const g = node.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone({
  freq = 440,
  type = "sine",
  dur = 0.18,
  gain = 0.05,
  slide = 0,
  delay = 0,
}: {
  freq?: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  slide?: number;
  delay?: number;
}): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq * sfxPack.rate, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sfxPack.rate + slide), t0 + dur);
  env(g, t0, 0.008, dur, gain * sfxPack.gainMul);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise({
  dur = 0.14,
  gain = 0.03,
  freq = 1800,
  q = 1,
  delay = 0,
}: {
  dur?: number;
  gain?: number;
  freq?: number;
  q?: number;
  delay?: number;
}): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * sfxPack.rate;
  bp.Q.value = q;
  const g = a.createGain();
  env(g, t0, 0.01, dur, gain * sfxPack.gainMul);
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t0);
}

export const Sound = {
  setEnabled(v: boolean): void {
    enabled = v;
  },
  /** 换包时同步 UI 音色（use-af 的 palette effect 调） */
  setPack(p: string): void {
    sfxPack = PACK_SFX[p] ?? PACK_SFX.default;
  },
  /** E01 / E03 拨弦 */
  pluck(): void {
    tone({ freq: 392, type: "triangle", dur: 0.22, gain: 0.055, slide: 120 });
    tone({ freq: 587, type: "sine", dur: 0.16, gain: 0.03, delay: 0.02 });
  },
  /** 清脆叮 */
  ding(): void {
    tone({ freq: 1046, type: "sine", dur: 0.16, gain: 0.045 });
    tone({ freq: 1568, type: "sine", dur: 0.12, gain: 0.022, delay: 0.03 });
  },
  /** 纸页翻动 */
  paper(): void {
    noise({ dur: 0.12, gain: 0.028, freq: 2600, q: 0.8 });
    noise({ dur: 0.09, gain: 0.018, freq: 1500, q: 1.2, delay: 0.07 });
  },
  /** 按下 */
  tap(): void {
    tone({ freq: 660, type: "sine", dur: 0.06, gain: 0.022, slide: -80 });
  },
  /** 远场欢呼 */
  crowd(): void {
    noise({ dur: 0.9, gain: 0.03, freq: 700, q: 0.5 });
    noise({ dur: 0.7, gain: 0.02, freq: 1400, q: 0.7, delay: 0.15 });
  },
  /** 暗号解锁 */
  unlock(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.2, gain: 0.038, delay: i * 0.075 }));
  },
  /** E12 开箱：盒盖弹开的闷响 + 彩屑闪；节拍对齐动画（盖飞 0.95s、彩屑 1.02s） */
  unbox(): void {
    tone({ freq: 200, type: "triangle", dur: 0.14, gain: 0.06, slide: -110, delay: 0.9 });
    noise({ dur: 0.1, gain: 0.04, freq: 1000, q: 1.4, delay: 0.92 });
    [1175, 1568, 2093].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.12, gain: 0.026, delay: 1.02 + i * 0.06 }));
  },
};
