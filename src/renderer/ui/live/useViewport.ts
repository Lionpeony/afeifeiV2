import { useEffect, useState } from "react";

/**
 * 视口档位（首页长标题降档的输入，2026-11-11 领队拍板）：
 *   narrow = <1180 宽（T1 档），short = <760 高（矮窗档）。
 * 纯呈现 concern：只读窗口尺寸，不碰播放状态；档位判定在 typography.heroTitleTiers。
 */
export interface ViewportTier {
  narrow: boolean;
  short: boolean;
}

/** matchMedia 订阅：阈值与 live.css 的 T1（1180）对齐；change 才 setState，不逐帧跟随 resize。 */
export function useViewportTier(): ViewportTier {
  const [vp, setVp] = useState<ViewportTier>({ narrow: false, short: false });
  useEffect(() => {
    const queries = [matchMedia("(max-width: 1180px)"), matchMedia("(max-height: 760px)")];
    const sync = (): void => setVp({ narrow: queries[0].matches, short: queries[1].matches });
    sync();
    for (const q of queries) q.addEventListener("change", sync);
    return () => {
      for (const q of queries) q.removeEventListener("change", sync);
    };
  }, []);
  return vp;
}
