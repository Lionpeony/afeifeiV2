import { useEffect, useRef, useState } from "react";
import { onFrame } from "../compositor.js";

/**
 * 数字滚动（移植 Magic UI NumberTicker）。
 * 挂载时从上次显示的数值滚到目标值，缓出三次曲线；reduced-motion 直接落终值。
 * 只滚显示，语义值不变——读屏读到的仍是最终数字。
 */
export function NumberTicker({
  value,
  className,
  duration = 900,
  decimals = 0,
  locale = "zh-CN",
}: {
  value: number;
  className?: string;
  /** 滚动时长（ms） */
  duration?: number;
  decimals?: number;
  locale?: string;
}) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    let stop: (() => void) | null = null;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * eased);
      if (p < 1) return;
      fromRef.current = value;
      // 滚到终值就退订：全应用只有 compositor 持有 rAF 循环（lint 规则 4）
      stop?.();
      stop = null;
    };

    stop = onFrame(tick);
    return () => {
      stop?.();
      stop = null;
    };
  }, [value, duration]);

  const text = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(shown);

  return <span className={className ? `fx-num ${className}` : "fx-num"}>{text}</span>;
}
