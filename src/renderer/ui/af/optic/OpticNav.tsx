import { useEffect, useLayoutEffect, useRef } from "react";
import { onFrame } from "../../compositor.js";

export interface OpticNavTab<T extends string = string> {
  page: T;
  label: string;
}

export interface OpticNavProps<T extends string = string> {
  tabs: readonly OpticNavTab<T>[];
  activePage: string;
  onSelect(page: T): void;
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
 * 顶部悬浮光学导航岛（1:1 复刻 <glass-toggle> 物理引擎）：
 * - 与 glass-toggle.js 逐位一致的欠阻尼弹簧：k = 129, ζ = 0.60, 4 子步积分；
 * - 速度液态拉伸（scaleX/scaleY）+ 按压收缩（squeeze）+ 释放光脉冲（kick）；
 * - 凹槽底板漫射光斑（.optic-nav__spill）实时跟随滑块照亮轨道地板；
 * - 支持直接点击、按住拖动与惯性甩动（Flick），静止后自动退订 compositor.ts。
 */
export function OpticNav<T extends string>({ tabs, activePage, onSelect }: OpticNavProps<T>) {
  const navRef = useRef<HTMLElement>(null);
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
    moved: 0,
    dragOffsetX: 0,
    lastNow: 0,
    unsub: null as (() => void) | null,
  });

  const applyDom = (): void => {
    const thumb = thumbRef.current;
    const spill = spillRef.current;
    if (!thumb) return;
    const s = phys.current;
    const speed = Math.abs(s.vx);
    // 复刻 glass-toggle.js:945-949：速度拉伸 + 按压体积收缩
    const stretch = Math.min(speed * 0.00024, 0.22);
    const squeeze = 1 - s.press * 0.055;
    const sx = (1 + stretch) * squeeze;
    const sy = (1 - stretch * 0.42) * squeeze;
    const glow = Math.min(1.4, 0.42 + speed * 0.00075 + s.kick * 0.55 + (s.dragging ? 0.35 : 0));

    thumb.style.width = `${s.w.toFixed(2)}px`;
    thumb.style.transform = `translate3d(${s.x.toFixed(2)}px, 0, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    thumb.style.setProperty("--nav-glow", glow.toFixed(3));
    thumb.style.opacity = s.w > 4 ? "1" : "0";

    if (spill) {
      const cx = s.x + s.w / 2;
      spill.style.transform = `translate3d(${(cx - 56).toFixed(2)}px, 0, 0) scaleX(${(1 + stretch * 1.4).toFixed(3)})`;
      spill.style.opacity = s.w > 4 ? Math.min(1, 0.55 + glow * 0.35).toFixed(3) : "0";
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
        // 与 glass-toggle.js 完全一致的弹簧刚度与阻尼比：k = 129, ζ = 0.60
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

  const measureTarget = (pageKey: string): { x: number; w: number } | null => {
    const btn = btnRefs.current[pageKey];
    if (!btn) return null;
    return { x: btn.offsetLeft, w: btn.offsetWidth };
  };

  const activeKey = tabs.some((t) => t.page === activePage)
    ? activePage
    : activePage === "archive"
      ? "online"
      : "";

  useLayoutEffect(() => {
    const m = activeKey ? measureTarget(activeKey) : null;
    const s = phys.current;
    if (!m) {
      s.tw = 0;
      s.w = 0;
      applyDom();
      stopLoop();
      return;
    }
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
  }, [activeKey]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return () => stopLoop();
    const ro = new ResizeObserver(() => {
      const m = activeKey ? measureTarget(activeKey) : null;
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
    ro.observe(nav);
    return () => {
      ro.disconnect();
      stopLoop();
    };
  }, [activeKey]);

  const pickNearestByX = (localX: number): OpticNavTab<T> | null => {
    let best: OpticNavTab<T> | null = null;
    let bestDist = Infinity;
    for (const t of tabs) {
      const btn = btnRefs.current[t.page];
      if (!btn) continue;
      const cx = btn.offsetLeft + btn.offsetWidth / 2;
      const d = Math.abs(localX - cx);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  };

  return (
    <nav
      ref={navRef}
      className="optic-nav"
      aria-label="主导航"
      onPointerDown={(e) => {
        if (e.button !== 0 || !navRef.current) return;
        const rect = navRef.current.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const s = phys.current;
        if (lx >= s.x && lx <= s.x + s.w) {
          s.dragging = true;
          s.pressT = 1;
          s.moved = 0;
          s.dragOffsetX = lx - s.x;
          s.vx = 0;
          navRef.current.setPointerCapture(e.pointerId);
          wakeLoop();
        }
      }}
      onPointerMove={(e) => {
        const s = phys.current;
        if (!s.dragging || !navRef.current) return;
        const rect = navRef.current.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const maxX = Math.max(0, navRef.current.clientWidth - s.w - 3);
        const nextX = Math.max(3, Math.min(maxX, lx - s.dragOffsetX));
        const dx = nextX - s.x;
        s.moved = Math.max(s.moved, Math.abs(dx));
        s.vx = s.vx * 0.55 + dx * 32;
        s.x = nextX;
        const hit = pickNearestByX(nextX + s.w / 2);
        if (hit) {
          const m = measureTarget(hit.page);
          if (m) {
            s.tw = m.w;
            s.w += (m.w - s.w) * 0.25;
          }
        }
        applyDom();
      }}
      onPointerUp={(e) => {
        const s = phys.current;
        if (!s.dragging || !navRef.current) return;
        s.dragging = false;
        s.pressT = 0;
        s.kick = 0.85;
        if (navRef.current.hasPointerCapture(e.pointerId)) {
          navRef.current.releasePointerCapture(e.pointerId);
        }
        // 惯性预测落点（同 glass-toggle.js:1147）
        const projectedCenter = s.x + s.w / 2 + s.vx * 0.14;
        const hit = pickNearestByX(projectedCenter);
        if (hit && hit.page !== activeKey) {
          onSelect(hit.page);
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
      <span ref={spillRef} className="optic-nav__spill" aria-hidden="true" />
      <span ref={thumbRef} className="optic-nav__thumb" aria-hidden="true" />
      {tabs.map((t) => {
        const active = t.page === activeKey;
        return (
          <button
            key={t.page}
            ref={(node) => { btnRefs.current[t.page] = node; }}
            type="button"
            className={"optic-nav__item side-item" + (active ? " is-active on" : "")}
            data-page={t.page}
            onClick={() => onSelect(t.page)}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
