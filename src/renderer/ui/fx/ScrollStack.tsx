import { Children, type CSSProperties, type ReactNode } from "react";

/**
 * 堆叠滚动卡（移植 React Bits ScrollStack，简化为 CSS 版）。
 * 每张卡 position: sticky，按序号错开 top，滚动时后卡压前卡；
 * 退场缩放走 scroll-driven animation（Chromium 115+，Electron 33 满足），
 * 不支持时退化成纯 sticky 堆叠——效果差一点，不坏。
 * 卡间距由调用方的 margin 控制，组件不接管布局。
 */
export function ScrollStack({
  children,
  className,
  top = 24,
  step = 14,
}: {
  children: ReactNode;
  className?: string;
  /** 第一张卡距顶 */
  top?: number;
  /** 每张卡递增的错位 */
  step?: number;
}) {
  return (
    <div
      className={className ? `fx-stack ${className}` : "fx-stack"}
      style={
        {
          "--fx-stack-top": `${top}px`,
          "--fx-stack-step": `${step}px`,
        } as CSSProperties
      }
    >
      {Children.map(children, (child, i) => (
        <div className="fx-stack-item" style={{ "--fx-i": i } as CSSProperties}>
          {child}
        </div>
      ))}
    </div>
  );
}
