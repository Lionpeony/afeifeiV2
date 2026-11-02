import { useEffect, useRef } from "react";
import { EQ_BANDS } from "../capability/audio/eq.js";
import { eqResponseDb, logFreqs } from "../capability/audio/eq-response.js";

/**
 * EQ 频响曲线（M9-4）：6 段 peaking 级联的合成响应画在 canvas 上。
 * 数据全来自 capability/audio 的纯函数（与真实滤波器同一套公式/频段/Q/采样率），
 * 改滑杆 → store → props 变 → 重画。用户操作频率的变化，不走每帧合成器。
 */
export function EqCurve({ gains, sampleRate }: { gains: number[]; sampleRate: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = canvas;

    // 颜色走 token（lint 规则 5：canvas 里也不许裸 hex）
    const style = getComputedStyle(canvas);
    const accent = style.getPropertyValue("--accent").trim() || "currentColor";
    const dim = style.getPropertyValue("--fg-dim").trim() || "rgba(128,128,128,0.5)";

    const freqs = logFreqs(120);
    const db = eqResponseDb(gains, freqs, sampleRate);

    const DB_RANGE = 15; // 曲线纵向 ±15dB（滑杆 ±12 留一点余量）
    const F_MIN = 20;
    const F_MAX = 20000;
    const lo = Math.log10(F_MIN);
    const hi = Math.log10(F_MAX);
    const xOf = (f: number): number => ((Math.log10(f) - lo) / (hi - lo)) * (w - 1);
    const yOf = (v: number): number => h / 2 - (v / DB_RANGE) * (h / 2 - 2);

    ctx.clearRect(0, 0, w, h);

    // 0dB 基线 + 各段中心频率刻度
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(0, yOf(0));
    ctx.lineTo(w, yOf(0));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const hz of EQ_BANDS) {
      const x = xOf(hz);
      ctx.beginPath();
      ctx.moveTo(x, yOf(0) - 3);
      ctx.lineTo(x, yOf(0) + 3);
      ctx.stroke();
    }

    // 合成曲线
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    db.forEach((v, i) => {
      const x = xOf(freqs[i]);
      const y = Math.max(1, Math.min(h - 1, yOf(v)));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [gains, sampleRate]);

  return <canvas ref={ref} className="eq-curve" width={280} height={90} aria-label="EQ 频响曲线" />;
}
