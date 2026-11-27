import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { onFrame } from "../../compositor.js";

export interface OpticSegOption<T extends string> {
  id: T;
  label: string;
  badge?: string | number;
}

export interface OpticSpringSegProps<T extends string> {
  options: readonly OpticSegOption<T>[];
  value: T;
  onChange(next: T): void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}

const SPRING_K = 129;
const SPRING_ZETA = 0.60;
const SPRING_C = 2 * SPRING_ZETA * Math.sqrt(SPRING_K);
const SUBSTEPS = 4;

function isMotionReduced(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.motion === "off") return true;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

/**
 * 全站通用光学弹簧分段槽（docs/34 v3.0 §4）。
 * 与 <glass-toggle> / OpticNav 完全同源的欠阻尼二阶弹簧（k=129, ζ=0.60）、
 * 速度拉伸形变、按压缩紧、松手导光冲量（kick）、槽底漫射光斑与拖拽甩动。
 */
export function OpticSpringSeg<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className = "",
}: OpticSpringSegProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const spillRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const simRef = useRef({
    x: 0,
    w: 0,
    vx: 0,
    vw: 0,
    tx: 0,
    tw: 0,
    press: 0,
    pressT: 0,
    kick: 0,
    ready: false,
    dragging: false,
    moved: false,
    startX: 0,
    dragOff: 0,
    dragVel: 0,
    lastClientX: 0,
    lastTime: 0,
    lastFrame: 0,
    stop: null as (() => void) | null,
  });

  const measure = useCallback((): { x: number; w: number } | null => {
    const btn = btnRefs.current[value];
    if (!btn) return null;
    return { x: btn.offsetLeft, w: btn.offsetWidth };
  }, [value]);

  const paint = useCallback(() => {
    const thumb = thumbRef.current;
    const spill = spillRef.current;
    const s = simRef.current;
    if (!thumb || !s.ready) return;

    const speed = Math.abs(s.vx);
    const stretch = Math.min(0.11, speed / 4000);
    const sq = 1 - s.press * 0.055;
    const sx = (1 + stretch) * sq;
    const sy = (1 - stretch * 0.42) * sq;
    const glow = Math.min(1, 0.42 + s.kick * 0.58 + (speed / 2200) * 0.35 + s.press * 0.16);

    thumb.style.width = `${Math.max(24, s.w)}px`;
    thumb.style.transform = `translate3d(${s.x.toFixed(2)}px, 0, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    thumb.style.setProperty("--nav-glow", glow.toFixed(3));

    if (spill) {
      const cx = s.x + s.w * 0.5;
      spill.style.transform = `translate3d(${(cx - 48).toFixed(2)}px, 0, 0)`;
      spill.style.opacity = Math.min(0.88, 0.28 + glow * 0.44).toFixed(3);
    }
  }, []);

  const wake = useCallback(() => {
    const s = simRef.current;
    if (s.stop) return;
    s.lastFrame = performance.now();
    s.stop = onFrame((now) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - s.lastFrame) / 1000));
      s.lastFrame = now;
      const h = dt / SUBSTEPS;

      for (let i = 0; i < SUBSTEPS; i += 1) {
        if (!s.dragging) {
          const ax = -SPRING_K * (s.x - s.tx) - SPRING_C * s.vx;
          s.vx += ax * h;
          s.x += s.vx * h;
          const aw = -SPRING_K * (s.w - s.tw) - SPRING_C * s.vw;
          s.vw += aw * h;
          s.w += s.vw * h;
        }
        const pr = 1 - Math.exp(-26 * h);
        s.press += (s.pressT - s.press) * pr;
        s.kick *= Math.exp(-5.5 * h);
      }

      paint();

      const settled =
        !s.dragging &&
        Math.abs(s.x - s.tx) < 0.08 &&
        Math.abs(s.vx) < 0.5 &&
        Math.abs(s.w - s.tw) < 0.08 &&
        Math.abs(s.vw) < 0.5 &&
        Math.abs(s.press - s.pressT) < 0.005 &&
        s.kick < 0.005;

      if (settled) {
        s.x = s.tx;
        s.w = s.tw;
        s.vx = 0;
        s.vw = 0;
        s.press = s.pressT;
        s.kick = 0;
        paint();
        if (s.stop) {
          s.stop();
          s.stop = null;
        }
      }
    });
  }, [paint]);

  useLayoutEffect(() => {
    const m = measure();
    const s = simRef.current;
    if (!m) return;
    s.tx = m.x;
    s.tw = m.w;
    if (!s.ready || isMotionReduced()) {
      s.x = m.x;
      s.w = m.w;
      s.vx = 0;
      s.vw = 0;
      s.ready = true;
      paint();
      return;
    }
    s.kick = Math.min(1, s.kick + 0.62);
    wake();
  }, [measure, paint, wake, options.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const m = measure();
      if (!m) return;
      const s = simRef.current;
      s.tx = m.x;
      s.tw = m.w;
      if (!s.dragging) {
        s.x = m.x;
        s.w = m.w;
        paint();
      }
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure, paint]);

  useEffect(() => () => {
    const s = simRef.current;
    if (s.stop) {
      s.stop();
      s.stop = null;
    }
  }, []);

  const pickNearest = useCallback((cx: number): T => {
    let bestId = options[0]?.id ?? value;
    let bestDist = Infinity;
    for (const opt of options) {
      const el = btnRefs.current[opt.id];
      if (!el) continue;
      const mid = el.offsetLeft + el.offsetWidth * 0.5;
      const d = Math.abs(cx - mid);
      if (d < bestDist) {
        bestDist = d;
        bestId = opt.id;
      }
    }
    return bestId;
  }, [options, value]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isMotionReduced()) return;
    const track = trackRef.current;
    const s = simRef.current;
    if (!track || !s.ready) return;
    const rect = track.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const onThumb = lx >= s.x - 4 && lx <= s.x + s.w + 4;
    s.pressT = 1;
    s.startX = e.clientX;
    s.lastClientX = e.clientX;
    s.lastTime = performance.now();
    s.dragVel = 0;
    s.moved = false;
    if (onThumb) {
      s.dragging = true;
      s.dragOff = lx - s.x;
      track.setPointerCapture(e.pointerId);
    }
    wake();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    const s = simRef.current;
    if (!s.dragging || !track) return;
    const now = performance.now();
    const dt = Math.max(0.004, (now - s.lastTime) / 1000);
    s.dragVel = s.dragVel * 0.5 + ((e.clientX - s.lastClientX) / dt) * 0.5;
    s.lastClientX = e.clientX;
    s.lastTime = now;
    if (Math.abs(e.clientX - s.startX) > 4) s.moved = true;
    const rect = track.getBoundingClientRect();
    const maxX = Math.max(3, track.clientWidth - s.w - 3);
    s.x = Math.max(3, Math.min(maxX, e.clientX - rect.left - s.dragOff));
    paint();
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    const s = simRef.current;
    s.pressT = 0;
    if (s.dragging) {
      s.dragging = false;
      if (track?.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
      if (s.moved) {
        const projected = s.x + s.w * 0.5 + s.dragVel * 0.14;
        const target = pickNearest(projected);
        s.vx = s.dragVel * 0.45;
        s.kick = 0.85;
        if (target !== value) onChange(target);
      }
    }
    wake();
  };

  return (
    <div
      ref={trackRef}
      className={"optic-seg" + (size === "sm" ? " optic-seg--sm" : "") + (className ? " " + className : "")}
      role="tablist"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <span ref={spillRef} className="optic-seg__spill" aria-hidden="true" />
      <span ref={thumbRef} className="optic-seg__thumb" aria-hidden="true" />
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            ref={(el) => { btnRefs.current[opt.id] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            className={"optic-seg__btn" + (active ? " is-on" : "")}
            onClick={() => {
              if (simRef.current.moved) {
                simRef.current.moved = false;
                return;
              }
              if (opt.id !== value) onChange(opt.id);
            }}
          >
            <span>{opt.label}</span>
            {opt.badge !== undefined && opt.badge !== "" ? (
              <b className="optic-seg__badge num">{opt.badge}</b>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
