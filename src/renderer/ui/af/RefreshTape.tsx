/* 换台后的账号内容交接：旧内容退一点 → 新内容轻轻落下。
   相位只决定「看起来在刷新」，真实数据是否到位由各页自己的 loading 决定；
   动画不承担状态正确性，快速连切由 sourceId 变化直接替换，不依赖 animationend。 */
import { useEffect, useRef, useState } from "react";

export type RefreshPhase = "idle" | "loading" | "fresh";

/**
 * 换账号时给内容区一段可感知的交接窗口：
 * 至少 560ms 的「刷新中」（旧内容压暗、新内容落定），数据到了再淡回。
 * 数据迟迟不回也有 2.6s 兜底，不会让整页一直灰着。
 */
export function useSourceRefresh(sourceId: string, loading: boolean): RefreshPhase {
  const [phase, setPhase] = useState<RefreshPhase>("idle");
  const started = useRef(0);
  const timers = useRef<number[]>([]);
  /** 首帧是冷启动，交给各页的骨架，不在这里闪一次「已更新」。 */
  const primed = useRef(false);

  useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (!primed.current) {
      primed.current = true;
      return;
    }
    started.current = Date.now();
    setPhase("loading");
    timers.current.push(window.setTimeout(() => setPhase((p) => (p === "loading" ? "fresh" : p)), 2600));
    timers.current.push(window.setTimeout(() => setPhase("idle"), 2600 + 1200));
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, [sourceId]);

  useEffect(() => {
    if (phase !== "loading" || loading) return;
    const wait = Math.max(0, 360 - (Date.now() - started.current));
    timers.current.push(
      window.setTimeout(() => {
        setPhase("fresh");
        timers.current.push(window.setTimeout(() => setPhase("idle"), 1150));
      }, wait),
    );
  }, [loading, phase]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  return phase;
}

/** 冷启动骨架：与真实行同高的占位块，数据到了原地替换，不顶动布局。 */
export function RefreshSkeleton({ rows = 6, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <div className={"rf-skel" + (compact ? " is-compact" : "")} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <span className="rf-skel__row" key={i} />
      ))}
    </div>
  );
}

/** 每日推荐里的一行骨架：复刻 mix-row 的 5 列网格，换行也不会错位。 */
export function RefreshMixSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rf-skel" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <span className="rf-skel-row" key={i}>
          <span className="rf-skel-bar" style={{ width: "100%" }} />
          <span className="rf-skel-block" />
          <span className="rf-skel-bar" style={{ width: "58%" }} />
          <span className="rf-skel-bar" style={{ width: "72%" }} />
          <span className="rf-skel-bar" style={{ width: "64%" }} />
        </span>
      ))}
    </div>
  );
}
