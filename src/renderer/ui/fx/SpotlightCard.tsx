import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/**
 * 跟随光斑卡片（移植 Magic UI / React Bits SpotlightCard）。
 * 指针位置写进 CSS 变量，高光交给 ::before 画——不在 React 里逐帧 setState。
 * 触屏没有 hover 场景：pointermove 只对鼠标生效，触摸不触发。
 */
export function SpotlightCard({
  children,
  className,
  radius = 320,
  color = "var(--accent)",
}: {
  children: ReactNode;
  className?: string;
  /** 光斑半径（px） */
  radius?: number;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--fx-mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--fx-my", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      className={className ? `fx-spot ${className}` : "fx-spot"}
      onPointerMove={onPointerMove}
      style={
        {
          "--fx-spot-radius": `${radius}px`,
          "--fx-spot-color": color,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
