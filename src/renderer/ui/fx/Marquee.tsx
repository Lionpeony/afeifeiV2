import type { CSSProperties, ReactNode } from "react";

/**
 * 无缝跑马灯（移植 Magic UI Marquee）。
 * 轨道里放两份内容、平移 -50%，接缝天然对齐；第二份 aria-hidden，
 * 读屏只读一遍。悬停暂停，reduced-motion 下直接不动（见 fx.css）。
 */
export function Marquee({
  children,
  className,
  speed = 24,
  reverse = false,
  pauseOnHover = true,
}: {
  children: ReactNode;
  className?: string;
  /** 跑完一轮的秒数 */
  speed?: number;
  reverse?: boolean;
  pauseOnHover?: boolean;
}) {
  return (
    <div
      className={["fx-marquee", reverse ? "fx-marquee-reverse" : "", pauseOnHover ? "fx-marquee-pause" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{ "--fx-marquee-dur": `${speed}s` } as CSSProperties}
    >
      <div className="fx-marquee-track">
        <div className="fx-marquee-item">{children}</div>
        <div className="fx-marquee-item" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
