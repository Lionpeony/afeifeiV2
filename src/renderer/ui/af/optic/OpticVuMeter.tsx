import { useEffect, useRef } from "react";
import { graphOrNull } from "../../../capability/audio/graph.js";
import { aggregateSpectrum } from "../../../capability/audio/spectrum-bins.js";
import { onFrame } from "../../compositor.js";

export interface OpticVuMeterProps {
  bins?: number;
  rows?: number;
  playing: boolean;
  className?: string;
}

const FRAME_MS = 48; // ~20fps 硬件点阵刷新节拍（docs/34 §4.2）

function isMotionReduced(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.motion === "off") return true;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

/**
 * 真实音频点阵电平表（docs/34 §4.2 #3 & §5.2）。
 * - 直接读取唯一音频图 `graphOrNull().analyser` + 对数分桶 `aggregateSpectrum`
 * - 走唯一合成器 `onFrame`（守 lint 规则 4），20fps 节流，直接操作 DOM class 零 React 重绘
 * - 暂停 / 无音频图 / 减弱动效时立刻退订 rAF，诚实落回暗格（绝不画假波形，守 00 §5.2）
 */
export function OpticVuMeter({ bins = 5, rows = 6, playing, className = "" }: OpticVuMeterProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const cols = Array.from(host.children) as HTMLElement[];

    const paint = (levels: number[]): void => {
      for (let c = 0; c < cols.length; c += 1) {
        const dots = cols[c]?.children;
        if (!dots) continue;
        const lit = Math.round((levels[c] ?? 0) * rows);
        const peakRow = Math.max(1, rows - 1);
        for (let i = 0; i < dots.length; i += 1) {
          const row = rows - i; // 顶部是最高行 rows，底部是 1
          const on = row <= lit;
          const el = dots[i] as HTMLElement;
          el.classList.toggle("is-lit", on);
          el.classList.toggle("is-peak", on && row >= peakRow);
        }
      }
    };

    const zeros = new Array<number>(bins).fill(0);
    if (!playing || isMotionReduced()) {
      paint(zeros);
      return;
    }

    let freqBuf: Uint8Array<ArrayBuffer> | null = null;
    const smooth = new Array<number>(bins).fill(0);
    let last = 0;

    const stop = onFrame((now) => {
      if (now - last < FRAME_MS) return;
      last = now;
      const g = graphOrNull();
      if (!g) {
        paint(zeros);
        return;
      }
      const count = g.analyser.frequencyBinCount;
      if (!freqBuf || freqBuf.length !== count) {
        freqBuf = new Uint8Array(new ArrayBuffer(count));
      }
      g.analyser.getByteFrequencyData(freqBuf);
      const raw = aggregateSpectrum(freqBuf, bins);
      for (let i = 0; i < bins; i += 1) {
        const v = raw[i] ?? 0;
        const boosted = v > 0.01 ? Math.min(1, Math.pow(v, 0.72) * 1.15) : 0;
        smooth[i] = boosted >= smooth[i]! ? boosted : smooth[i]! * 0.76;
      }
      paint(smooth);
    });

    return () => {
      stop();
      paint(zeros);
    };
  }, [playing, bins, rows]);

  const colIndices = Array.from({ length: bins }, (_, i) => i);
  const rowIndices = Array.from({ length: rows }, (_, i) => rows - i);

  return (
    <div
      ref={hostRef}
      className={"optic-screen__vu" + (className ? " " + className : "")}
      aria-hidden="true"
    >
      {colIndices.map((ci) => (
        <span key={ci} className="optic-vu__col">
          {rowIndices.map((row) => (
            <i key={row} className="optic-vu__dot" />
          ))}
        </span>
      ))}
    </div>
  );
}
