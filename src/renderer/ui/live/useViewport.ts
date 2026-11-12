import { useEffect, useState } from "react";

/**
 * 视口档位（首页长标题降档的输入，2026-11-11 领队拍板）：
 *   narrow = <1180 宽（T1 档），short = <760 高（矮窗档）。
 *   cols   = 待播网格列数（<1300 宽降 4 列，与 tokens.css 的 --lg-cols 断点同一阈值）。
 * 纯呈现 concern：只读窗口尺寸，不碰播放状态；档位判定在 typography.heroTitleTiers。
 */
export interface ViewportTier {
  narrow: boolean;
  short: boolean;
  /** 待播网格列数：卡数必须跟着它走（slice(0, cols)），否则第 5 张掉到第 2 行被裁。 */
  cols: number;
}

/** matchMedia 订阅：阈值与 live.css 的 T1（1180）/ tokens.css 的 --lg-cols 断点（1299）对齐；
    change 才 setState，不逐帧跟随 resize。三个查询一次订阅、一个 cleanup。 */
export function useViewportTier(): ViewportTier {
  const [vp, setVp] = useState<ViewportTier>({ narrow: false, short: false, cols: 5 });
  useEffect(() => {
    const queries = [
      matchMedia("(max-width: 1180px)"),
      matchMedia("(max-height: 760px)"),
      matchMedia("(max-width: 1299px)"),
    ];
    const sync = (): void =>
      setVp({ narrow: queries[0].matches, short: queries[1].matches, cols: queries[2].matches ? 4 : 5 });
    sync();
    for (const q of queries) q.addEventListener("change", sync);
    return () => {
      for (const q of queries) q.removeEventListener("change", sync);
    };
  }, []);
  return vp;
}
