/**
 * 投影层（Ring 3）：只读计算，不写状态、不发请求（50 §8）。
 */

export interface VisibleWindow {
  /** 第一条要渲染的行下标 */
  start: number;
  /** 最后一条（不含） */
  end: number;
  /** 这一屏的纵向偏移，给 ul 的 translateY 用 */
  offsetY: number;
  /** 整表总高，撑起滚动条 */
  totalHeight: number;
}

/**
 * 虚拟化窗口计算。
 *
 * 5000 行不能全渲染：按 scrollTop 算出可见区间，只渲染这一段 + 上下 overscan。
 * 固定行高是刻意的 —— 动态行高要么测宽、要么二次渲染，都会让滚动掉帧。
 */
export function selectVisible(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 6,
): VisibleWindow {
  if (total <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, offsetY: 0, totalHeight: 0 };
  }

  const top = Math.max(0, scrollTop);
  const first = Math.floor(top / rowHeight);
  const visibleCount = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1;

  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + visibleCount + overscan);

  return {
    start,
    end,
    offsetY: start * rowHeight,
    totalHeight: total * rowHeight,
  };
}

/** 滚动到某一行时应设的 scrollTop（用于"定位到正在播的歌"）。 */
export function scrollTopFor(index: number, rowHeight: number, viewportHeight: number): number {
  if (index < 0 || rowHeight <= 0) return 0;
  const target = index * rowHeight;
  // 让目标行落在视口 1/3 处，比正中对齐更舒服
  return Math.max(0, target - Math.floor(viewportHeight / 3));
}
