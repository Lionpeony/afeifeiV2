/**
 * LRC 头部的 `[offset:+500]` 与我们的约定**方向相反**：
 * LRC 的 +500 = 词提前 0.5s，我们的正数 = 词延后。
 *
 * 放环 1 而不是 `ui/local-lyric.ts`：本地词与手动绑定两条路都要用它，
 * 而 domain 不许 import ui（依赖只能向内）。
 */
export function lrcOffsetOf(text: string): number {
  const m = /\[offset:\s*([+-]?\d+)\s*\]/i.exec(text);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? -n : 0;
}
