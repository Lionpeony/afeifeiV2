import type { ListeningSession } from "../domain/listening/log.js";

/** 听歌统计投影（Ring 3 纯函数）：账本 → 界面能直接画的形状。 */
export interface RankRow {
  name: string;
  artist: string;
  ms: number;
  plays: number;
}

export interface DayBar {
  key: string;
  label: string;
  ms: number;
}

export interface ListeningStats {
  todayMs: number;
  weekMs: number;
  monthMs: number;
  totalMs: number;
  plays: number;
  /** 最近 7 个自然日（含今天），按时间正序 */
  byDay: DayBar[];
  /** 0–23 点，每段按开始时刻归桶 */
  byHour: number[];
  topArtists: RankRow[];
  topTracks: RankRow[];
}

const pad = (n: number): string => String(n).padStart(2, "0");
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 固定时刻可注入，测试不用冻结全局时钟。 */
export function summarize(sessions: readonly ListeningSession[], now = Date.now()): ListeningStats {
  const today = new Date(now);
  const todayKey = dayKey(today);
  const monthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;

  const weekKeys: string[] = [];
  const bars: DayBar[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    weekKeys.push(key);
    bars.push({ key, label: i === 0 ? "今天" : `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`, ms: 0 });
  }
  const barByKey = new Map(bars.map((b) => [b.key, b]));
  const weekSet = new Set(weekKeys);

  const byHour = Array.from({ length: 24 }, () => 0);
  const artists = new Map<string, RankRow>();
  const tracks = new Map<string, RankRow>();
  let todayMs = 0;
  let weekMs = 0;
  let monthMs = 0;
  let totalMs = 0;
  let plays = 0;

  for (const s of sessions) {
    if (!Number.isFinite(s.playedMs) || s.playedMs <= 0) continue;
    const d = new Date(s.at);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    const ms = s.playedMs;
    totalMs += ms;
    plays += 1;
    if (key === todayKey) todayMs += ms;
    if (weekSet.has(key)) {
      weekMs += ms;
      const bar = barByKey.get(key);
      if (bar) bar.ms += ms;
    }
    if (`${d.getFullYear()}-${pad(d.getMonth() + 1)}` === monthKey) monthMs += ms;
    byHour[d.getHours()] += ms;

    const a = artists.get(s.artist || "未知歌手") ?? { name: s.artist || "未知歌手", artist: "", ms: 0, plays: 0 };
    a.ms += ms;
    a.plays += 1;
    artists.set(a.name, a);

    const trackKey = `${s.trackId}`;
    const t = tracks.get(trackKey) ?? { name: s.title || trackKey, artist: s.artist || "未知歌手", ms: 0, plays: 0 };
    t.ms += ms;
    t.plays += 1;
    tracks.set(trackKey, t);
  }

  const top = (map: Map<string, RankRow>): RankRow[] =>
    [...map.values()].sort((x, y) => y.ms - x.ms || y.plays - x.plays).slice(0, 5);

  return { todayMs, weekMs, monthMs, totalMs, plays, byDay: bars, byHour, topArtists: top(artists), topTracks: top(tracks) };
}

/** 人话时长：不足 1 分钟给「不到 1 分钟」，长的拆成小时 + 分钟。 */
export function fmtListening(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return ms > 0 ? "不到 1 分钟" : "0 分钟";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
}
