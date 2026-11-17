/* ---------- 极简交互音效（WebAudio 合成，无需素材文件；默认低于音乐音量） ---------- */
(function () {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!enabled) return null;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  function env(node, t0, attack, decay, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone({ freq = 440, type = "sine", dur = 0.18, gain = 0.05, slide = 0, delay = 0 }) {
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    env(g, t0, 0.008, dur, gain);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.14, gain = 0.03, freq = 1800, q = 1, delay = 0 }) {
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + delay;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = a.createGain(); env(g, t0, 0.01, dur, gain);
    src.connect(bp).connect(g).connect(a.destination);
    src.start(t0);
  }

  const Sound = {
    setEnabled(v) { enabled = v; },
    /* E01 / E03 拨弦 */
    pluck() {
      tone({ freq: 392, type: "triangle", dur: 0.22, gain: 0.055, slide: 120 });
      tone({ freq: 587, type: "sine", dur: 0.16, gain: 0.03, delay: 0.02 });
    },
    /* 清脆叮 */
    ding() {
      tone({ freq: 1046, type: "sine", dur: 0.16, gain: 0.045 });
      tone({ freq: 1568, type: "sine", dur: 0.12, gain: 0.022, delay: 0.03 });
    },
    /* 纸页翻动 */
    paper() {
      noise({ dur: 0.12, gain: 0.028, freq: 2600, q: 0.8 });
      noise({ dur: 0.09, gain: 0.018, freq: 1500, q: 1.2, delay: 0.07 });
    },
    /* 按下 */
    tap() {
      tone({ freq: 660, type: "sine", dur: 0.06, gain: 0.022, slide: -80 });
    },
    /* 远场欢呼 */
    crowd() {
      noise({ dur: 0.9, gain: 0.03, freq: 700, q: 0.5 });
      noise({ dur: 0.7, gain: 0.02, freq: 1400, q: 0.7, delay: 0.15 });
    },
    /* 暗号解锁 */
    unlock() {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ freq: f, type: "sine", dur: 0.2, gain: 0.038, delay: i * 0.075 }));
    }
  };

  window.Sound = Sound;
})();
