import type { CSSProperties, ReactNode } from "react";

/**
 * 渐变流动文字（移植 Magic UI AnimatedGradientText）。
 * 背景裁到字形上做流动渐变，默认青瓷 → 石板蓝。
 * 注意：文字渐变天然吃对比度，只给标题/正在播放这类大字用，正文别用。
 */
export function AnimatedGradientText({
  children,
  className,
  speed = 8,
  from = "var(--accent)",
  to = "var(--brass)",
}: {
  children: ReactNode;
  className?: string;
  /** 一轮流动的秒数 */
  speed?: number;
  from?: string;
  to?: string;
}) {
  return (
    <span
      className={className ? `fx-gradient-text ${className}` : "fx-gradient-text"}
      style={
        {
          "--fx-grad-from": from,
          "--fx-grad-to": to,
          "--fx-grad-speed": `${speed}s`,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}
