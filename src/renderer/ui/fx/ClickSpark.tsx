import { useEffect, useRef } from "react";

interface Spark {
  x: number;
  y: number;
  dx: number;
  dy: number;
  born: number;
}

/**
 * 点击粒子（移植 React Bits ClickSpark）。
 * 一块铺满视口的 canvas（pointer-events: none），点击处迸出短线后衰减。
 * 颜色经临时元素解析 CSS 变量——canvas 不认 var()。
 * reduced-motion 下不画（这是纯装饰，没有语义可丢）。
 */
export function ClickSpark({
  color = "var(--accent)",
  count = 8,
  distance = 28,
  duration = 420,
}: {
  color?: string;
  count?: number;
  distance?: number;
  duration?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const probe = document.createElement("span");
    probe.style.color = color;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const stroke = getComputedStyle(probe).color;
    probe.remove();

    let raf = 0;
    const sparks: Spark[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const draw = (now: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.strokeStyle = stroke || "currentColor";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const p = (now - s.born) / duration;
        if (p >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        const travel = p * distance;
        const tail = Math.max(0, travel - 8);
        ctx.globalAlpha = 1 - p;
        ctx.beginPath();
        ctx.moveTo(s.x + s.dx * tail, s.y + s.dy * tail);
        ctx.lineTo(s.x + s.dx * travel, s.y + s.dy * travel);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      raf = sparks.length > 0 ? requestAnimationFrame(draw) : 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      const now = performance.now();
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        sparks.push({ x: e.clientX, y: e.clientY, dx: Math.cos(angle), dy: Math.sin(angle), born: now });
      }
      if (raf === 0) raf = requestAnimationFrame(draw);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [color, count, distance, duration]);

  return <canvas ref={canvasRef} className="fx-spark" aria-hidden="true" />;
}
