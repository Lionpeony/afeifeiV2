import type { CSSProperties, ReactNode } from "react";

/**
 * 流光描边（移植 React Bits StarBorder，CSS 版）。
 * 两道柔光沿上下边循环滑动，颜色只从属性进来，默认 --accent。
 * 不做 Tailwind 的双伪元素 + 关键字堆叠：一颗动效够了，按钮上别再叠特效。
 * reduced-motion 下静止（见 fx.css）。
 */
export function StarBorder({
  children,
  color = "var(--accent)",
  speed = 6,
  className,
}: {
  children: ReactNode;
  /** 光带颜色，默认 var(--accent)；传 token 名即可，不要写 hex */
  color?: string;
  /** 一个来回的秒数 */
  speed?: number;
  className?: string;
}) {
  return (
    <span
      className={className ? `fx-star ${className}` : "fx-star"}
      style={
        {
          "--fx-star-color": color,
          "--fx-star-speed": `${speed}s`,
        } as CSSProperties
      }
    >
      <span className="fx-star-inner">{children}</span>
    </span>
  );
}
