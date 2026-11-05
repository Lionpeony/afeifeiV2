import {
  DAY_MS,
  joinPointAt,
  programAt,
  type JoinPoint,
  type Program,
  type Schedule,
} from "../domain/station/schedule.js";

/**
 * 直播带的只读投影：把节目表 + 此刻，折成一层可直接渲染的横带。
 *
 * 播放头固定在窗口的 38%（PLAYHEAD_RATIO），所以"世界在针下滑动"不是动画，
 * 而是每帧重算窗口起点。百分比而不是像素，是为了三档分辨率同一份数据。
 *
 * 纯函数：无 DOM、无定时器、不读墙钟。
 */

/** 播放头在视口中的位置。 */
export const PLAYHEAD_RATIO = 0.38;
/** 视口默认量程：6 小时。 */
export const DEFAULT_WINDOW_HOURS = 6;

export interface TapeItem {
  title: string;
  artist: string;
  offsetMs: number;
  durationMs: number;
}

export interface TapeSlot {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  kind: Program["kind"];
  /** 相对视口的百分比，已裁到 0–100 */
  leftPct: number;
  widthPct: number;
  startsAt: number;
  endsAt: number;
  aired: boolean;
  current: boolean;
  next: boolean;
  items: TapeItem[];
}

export interface HourMark {
  leftPct: number;
  label: string;
  major: boolean;
}

export interface Broadcast {
  at: number;
  windowStart: number;
  windowEnd: number;
  /** 当前档已经播了多久 */
  elapsedMs: number;
  /** 广播日已走过的比例（0–1） */
  dayPercent: number;
  current: Program | null;
  next: Program | null;
  join: JoinPoint | null;
  /** 当前档结束界缝的位置（百分比），不在窗口内为 null */
  seamPct: number | null;
  slots: TapeSlot[];
  marks: HourMark[];
  onAir: boolean;
}

const HOUR_MS = 3_600_000;
const pad2 = (n: number): string => String(n).padStart(2, "0");

export function buildBroadcast(
  schedule: Schedule,
  at: number,
  windowHours = DEFAULT_WINDOW_HOURS,
): Broadcast {
  const windowMs = Math.max(HOUR_MS, windowHours * HOUR_MS);
  const windowStart = at - PLAYHEAD_RATIO * windowMs;
  const windowEnd = windowStart + windowMs;
  const current = programAt(schedule, at);
  const join = current ? joinPointAt(schedule, at) : null;
  const currentIndex = current ? schedule.programs.findIndex((p) => p.id === current.id) : -1;
  const next = currentIndex >= 0 ? (schedule.programs[currentIndex + 1] ?? null) : null;

  const slots: TapeSlot[] = [];
  for (const p of schedule.programs) {
    if (p.endMs <= windowStart || p.startMs >= windowEnd) continue;
    const rawLeft = ((p.startMs - windowStart) / windowMs) * 100;
    const rawRight = ((p.endMs - windowStart) / windowMs) * 100;
    const leftPct = Math.max(0, rawLeft);
    const rightPct = Math.min(100, rawRight);
    if (rightPct - leftPct <= 0.02) continue;
    slots.push({
      id: p.id,
      index: p.index,
      title: p.title,
      subtitle: p.subtitle,
      kind: p.kind,
      leftPct,
      widthPct: rightPct - leftPct,
      startsAt: p.startMs,
      endsAt: p.endMs,
      aired: p.endMs <= at,
      current: current ? p.id === current.id : false,
      next: next ? p.id === next.id : false,
      items: p.items.map((item) => ({
        title: item.title,
        artist: item.artist,
        offsetMs: item.offsetMs,
        durationMs: item.durationMs,
      })),
    });
  }

  const marks: HourMark[] = [];
  const firstHour = Math.ceil(windowStart / HOUR_MS) * HOUR_MS;
  for (let t = firstHour; t < windowEnd; t += HOUR_MS) {
    const d = new Date(t);
    marks.push({
      leftPct: ((t - windowStart) / windowMs) * 100,
      label: `${pad2(d.getHours())}:00`,
      major: d.getHours() % 3 === 0,
    });
  }

  const seamRaw = current ? ((current.endMs - windowStart) / windowMs) * 100 : Number.NaN;
  const seamPct = Number.isFinite(seamRaw) && seamRaw >= 0 && seamRaw <= 100 ? seamRaw : null;
  const dayPercent = schedule.programs.length === 0 ? 0 : Math.max(0, Math.min(1, (at - schedule.dayStart) / DAY_MS));

  return {
    at,
    windowStart,
    windowEnd,
    elapsedMs: current ? Math.max(0, at - current.startMs) : 0,
    dayPercent,
    current,
    next,
    join,
    seamPct,
    slots,
    marks,
    onAir: current !== null,
  };
}
