/* 演出状态机（docs/30 §41）
 *
 * 播放事实 → 舞台节点。UI 只认 `data-stage` / `data-seg`，样式不再各自猜状态。
 * 纯函数、无 React 依赖，便于 node --test 直接对 30% / 70% / 末曲这些边界下断言。
 *
 * 与规范的一处收敛：规范按「第 16 首」切中场，但队列长度不固定（可能 8 首、也可能 40 首），
 * 所以中场由组件在「跨过半场」的那一刻点火，这里只接收 `intermission` 事实，不写死序号。
 */

export type StageNode = "idle" | "playing" | "paused" | "change" | "intermission" | "encore" | "curtain";

export type StageSegment = "intro" | "chorus" | "outro";

/** 主歌 0–30% / 副歌 30–70% / 尾奏 70–100%（规范给的段落比例）。 */
export function segmentOf(pos: number, dur: number): StageSegment {
  if (!Number.isFinite(dur) || dur <= 0) return "intro";
  const r = Math.max(0, pos) / dur;
  if (r < 0.3) return "intro";
  if (r < 0.7) return "chorus";
  return "outro";
}

export interface StageFacts {
  queueLength: number;
  index: number;
  playing: boolean;
  /** 这一次会话里是否真的开演过（没按过播放就还是候场） */
  started: boolean;
  pos: number;
  dur: number;
  /** 跨过半场的中场窗口（组件负责 8 秒后关掉） */
  intermission?: boolean;
}

export function stageOf(f: StageFacts): StageNode {
  if (f.queueLength <= 0) return "idle";
  if (f.intermission) return "intermission";
  const last = f.index >= f.queueLength - 1;
  if (last && !f.playing && f.dur > 0 && f.pos >= f.dur - 1) return "curtain";
  if (!f.started) return "idle";
  if (!f.playing) return "paused";
  if (f.index >= f.queueLength - 2) return "encore";
  return "playing";
}

/* ---------- 演出彩蛋（docs/30 §43 / §44） ----------
 * 低概率、行为级、可关闭；概率与「第几首」都走参数，便于测试固定随机数。
 * §44 补上规范 2.x.4 里没做的三颗：mygo 玻璃水痕、gbc 路人光斑、gbc 弹幕碎片。 */
export type StageEgg =
  | "spot-slip"
  | "string-snap"
  | "rain-up"
  | "signal-tear"
  | "glass-streak"
  | "passerby"
  | "danmaku";

export function pickStageEgg(
  palette: string,
  trackNo: number,
  moment: "chorus" | "change",
  rng: () => number = Math.random,
): StageEgg | null {
  if (moment === "change") {
    if (palette === "btr") return rng() < 0.01 ? "string-snap" : null;
    if (palette === "mygo") return rng() < 0.08 ? "glass-streak" : null;
    return null;
  }
  if (palette === "btr") return rng() < 0.05 ? "spot-slip" : null;
  if (palette === "gbc") {
    const r = rng();
    if (r < 0.04) return "signal-tear";
    if (r < 0.075) return "passerby";
    if (r < 0.11) return "danmaku";
    return null;
  }
  if (palette === "mygo") return trackNo > 0 && trackNo % 3 === 0 ? "rain-up" : null;
  return null;
}
