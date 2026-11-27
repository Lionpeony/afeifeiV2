import { useEffect, useLayoutEffect, useRef } from "react";
import { onFrame } from "../../compositor.js";
import { sourceShort, sourceTone } from "../data.js";

export interface OpticSourceOption {
  id: string;
  name: string;
}

export interface OpticSourceSwitchProps {
  sources: readonly OpticSourceOption[];
  activeId: string;
  onSwitch(id: string): void;
}

function isReducedMotion(): boolean {
  return (
    document.documentElement.dataset.motion === "off" ||
    (typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

/**
 * 顶栏音源切换（网易云 / QQ）光学物理开关（1:1 复刻 <glass-toggle> 手感）：
 * - k = 129, ζ = 0.60 欠阻尼弹簧 + 液态速度拉伸 + 按压收缩 + 拖拽甩动；
 * - 滑块光弧与凹槽光斑随当前音源色（网易云红 / QQ 绿）实时动态染色。
 */
export function OpticSourceSwitch({ sources, activeId, onSwitch }: OpticSourceSwitchProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const spillRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const phys = useRef({
    inited: false,
    x: 0,
    vx: 0,
    tx: 0,
    w: 0,
    vw: 0,
    tw: 0,
    press: 0,
    pressT: 0,
    kick: 0,
    dragging: false,
    dragOffsetX: 0,
    lastNow: 0,
    unsub: null as (() => void) | null,
  });

  const tone = sourceTone(activeId);

  const applyDom = (): void => {
    const thumb = thumbRef.current;
    const spill = spillRef.current;
    if (!thumb) return;
    const s = phys.current;
    const speed = Math.abs(s.vx);
    const stretch = Math.min(speed * 0.00028, 0.22);
    const squeeze = 1 - s.press * 0.055;
    const sx = (1 + stretch) * squeeze;
    const sy = (1 - stretch * 0.42) * squeeze;
    const glow = Math.min(1.4, 0.48 + speed * 0.0008 + s.kick * 0.55 + (s.dragging ? 0.35 : 0));

    thumb.style.width = `${s.w.toFixed(2)}px`;
    thumb.style.transform = `translate3d(${s.x.toFixed(2)}px, 0, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    thumb.style.setProperty("--nav-glow", glow.toFixed(3));
    thumb.style.opacity = s.w > 4 ? "1" : "0";

    if (spill) {
      const cx = s.x + s.w / 2;
      spill.style.transform = `translate3d(${(cx - 48).toFixed(2)}px, 0, 0) scaleX(${(1 + stretch * 1.4).toFixed(3)})`;
      spill.style.opacity = s.w > 4 ? Math.min(1, 0.6 + glow * 0.35).toFixed(3) : "0";
    }
  };

  const stopLoop = (): void => {
    const s = phys.current;
    if (s.unsub) {
      s.unsub();
      s.unsub = null;
    }
  };

  const wakeLoop = (): void => {
    const s = phys.current;
    if (s.unsub) return;
    s.lastNow = performance.now();
    s.unsub = onFrame((now) => {
      const dt = Math.min(1 / 30, Math.max(0.001, (now - s.lastNow) / 1000));
      s.lastNow = now;

      if (isReducedMotion() && !s.dragging) {
        s.x = s.tx;
        s.w = s.tw;
        s.vx = 0;
        s.vw = 0;
        s.press = s.pressT;
        s.kick = 0;
        applyDom();
        stopLoop();
        return;
      }

      if (!s.dragging) {
        const k = 129;
        const c = 2 * Math.sqrt(k) * 0.6;
        const steps = 4;
        const h = dt / steps;
        for (let i = 0; i < steps; i += 1) {
          const ax = -k * (s.x - s.tx) - c * s.vx;
          s.vx += ax * h;
          s.x += s.vx * h;
          const aw = -k * (s.w - s.tw) - c * s.vw;
          s.vw += aw * h;
          s.w += s.vw * h;
        }
      }

      s.press += (s.pressT - s.press) * Math.min(1, dt * 18);
      s.kick *= Math.exp(-dt * 3.5);
      applyDom();

      const settled =
        !s.dragging &&
        Math.abs(s.x - s.tx) < 0.08 &&
        Math.abs(s.vx) < 0.35 &&
        Math.abs(s.w - s.tw) < 0.08 &&
        Math.abs(s.vw) < 0.35 &&
        Math.abs(s.press - s.pressT) < 0.004 &&
        s.kick < 0.004;
      if (settled) {
        s.x = s.tx;
        s.w = s.tw;
        s.vx = 0;
        s.vw = 0;
        s.press = s.pressT;
        s.kick = 0;
        applyDom();
        stopLoop();
      }
    });
  };

  const measure = (id: string): { x: number; w: number } | null => {
    const btn = btnRefs.current[id];
    if (!btn) return null;
    return { x: btn.offsetLeft, w: btn.offsetWidth };
  };

  useLayoutEffect(() => {
    const m = measure(activeId);
    const s = phys.current;
    if (!m) return;
    const changed = s.inited && (Math.abs(s.tx - m.x) > 0.5 || Math.abs(s.tw - m.w) > 0.5);
    s.tx = m.x;
    s.tw = m.w;
    if (!s.inited || isReducedMotion()) {
      s.inited = true;
      s.x = m.x;
      s.w = m.w;
      s.vx = 0;
      s.vw = 0;
      applyDom();
    } else if (changed) {
      s.kick = 1;
      wakeLoop();
    }
  }, [activeId, sources.length]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return () => stopLoop();
    const ro = new ResizeObserver(() => {
      const m = measure(activeId);
      if (!m) return;
      const s = phys.current;
      s.tx = m.x;
      s.tw = m.w;
      if (!s.unsub) {
        s.x = m.x;
        s.w = m.w;
        applyDom();
      }
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      stopLoop();
    };
  }, [activeId]);

  const pickNearest = (localX: number): OpticSourceOption | null => {
    let best: OpticSourceOption | null = null;
    let bestDist = Infinity;
    for (const src of sources) {
      const btn = btnRefs.current[src.id];
      if (!btn) continue;
      const cx = btn.offsetLeft + btn.offsetWidth / 2;
      const d = Math.abs(localX - cx);
      if (d < bestDist) {
        bestDist = d;
        best = src;
      }
    }
    return best;
  };

  return (
    <div
      ref={wrapRef}
      className="optic-src"
      role="group"
      aria-label="音源切换"
      style={{ ["--optic-src-tone" as string]: tone }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !wrapRef.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const s = phys.current;
        if (lx >= s.x && lx <= s.x + s.w) {
          s.dragging = true;
          s.pressT = 1;
          s.dragOffsetX = lx - s.x;
          s.vx = 0;
          wrapRef.current.setPointerCapture(e.pointerId);
          wakeLoop();
        }
      }}
      onPointerMove={(e) => {
        const s = phys.current;
        if (!s.dragging || !wrapRef.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const maxX = Math.max(0, wrapRef.current.clientWidth - s.w - 3);
        const nextX = Math.max(3, Math.min(maxX, lx - s.dragOffsetX));
        const dx = nextX - s.x;
        s.vx = s.vx * 0.55 + dx * 32;
        s.x = nextX;
        applyDom();
      }}
      onPointerUp={(e) => {
        const s = phys.current;
        if (!s.dragging || !wrapRef.current) return;
        s.dragging = false;
        s.pressT = 0;
        s.kick = 0.85;
        if (wrapRef.current.hasPointerCapture(e.pointerId)) {
          wrapRef.current.releasePointerCapture(e.pointerId);
        }
        const hit = pickNearest(s.x + s.w / 2 + s.vx * 0.14);
        if (hit && hit.id !== activeId) {
          onSwitch(hit.id);
        } else {
          wakeLoop();
        }
      }}
      onPointerCancel={() => {
        const s = phys.current;
        if (!s.dragging) return;
        s.dragging = false;
        s.pressT = 0;
        wakeLoop();
      }}
    >
      <span ref={spillRef} className="optic-src__spill" aria-hidden="true" />
      <span ref={thumbRef} className="optic-src__thumb" aria-hidden="true" />
      {sources.map((s) => (
        <button
          key={s.id}
          ref={(node) => { btnRefs.current[s.id] = node; }}
          type="button"
          className={"optic-src__btn" + (activeId === s.id ? " is-on" : "")}
          title={s.name}
          aria-pressed={activeId === s.id}
          onClick={() => onSwitch(s.id)}
        >
          <i style={{ background: sourceTone(s.id) }} />
          {sourceShort(s.id, s.name)}
        </button>
      ))}
    </div>
  );
}
