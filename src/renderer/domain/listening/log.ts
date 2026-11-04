import type { KeyValuePort } from "../../../contracts/ports.js";

/**
 * 听歌账本（Ring 1）：每次「真的在播」记一段 `playedMs`。
 *
 * 为什么不能拿 `domain/history` 算统计：那个表是「最近 300 首、每首只留最后一次」的
 * 去重时间线，既没有时长也没有次数，拿它做年度报告等于编数据。
 * 这里另起一份账本，写入时机只有两处：开始播放 `begin`、停止/切歌/暂停 `end`。
 *
 * ponytail: 单 KV、上限 2000 段（约 100 小时听歌量），满了丢最旧；
 * 要做跨年报告改成按月分片 `listening-YYYYMM` + 汇总表，接口不用动。
 */

const KEY = "listening-log";
const MAX_SESSIONS = 2000;
const MIN_SESSION_MS = 1000; // 连切/误触不算「听过」
const MAX_SESSION_MS = 6 * 60 * 60 * 1000; // 睡着后循环播放：一段最多记 6 小时

export interface ListeningSession {
  trackId: string;
  title: string;
  artist: string;
  /** 开始播放的时间戳（毫秒） */
  at: number;
  playedMs: number;
}

interface Open {
  trackId: string;
  title: string;
  artist: string;
  since: number;
}

let sessions: ListeningSession[] = [];
let open: Open | null = null;
const listeners = new Set<() => void>();

export const getSessions = (): readonly ListeningSession[] => sessions;

function notify(): void {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 开始一段；若上一段没结算，先按当前时刻结算掉（连切不会丢时长）。 */
export function begin(trackId: string, meta: { title?: string; artist?: string }, at = Date.now()): void {
  if (open?.trackId === trackId) return;
  if (open) settle(at);
  open = {
    trackId,
    title: (meta.title ?? "").slice(0, 160),
    artist: (meta.artist ?? "").slice(0, 160),
    since: at,
  };
}

/** 结算当前段。短的丢、超长的截断；不会重复结算。 */
export function end(at = Date.now()): ListeningSession | null {
  if (!open) return null;
  const session = settle(at);
  notify();
  return session;
}

function settle(at: number): ListeningSession | null {
  if (!open) return null;
  const playedMs = Math.min(MAX_SESSION_MS, Math.max(0, at - open.since));
  const session: ListeningSession = {
    trackId: open.trackId,
    title: open.title || open.trackId,
    artist: open.artist || "未知歌手",
    at: open.since,
    playedMs,
  };
  open = null;
  if (playedMs < MIN_SESSION_MS) return null;
  sessions = [...sessions, session].slice(-MAX_SESSIONS);
  return session;
}

/** KV 读回：坏条目逐条丢，非数字时长归零。 */
export function parseLog(raw: string | null): ListeningSession[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ListeningSession[] = [];
    for (const x of parsed) {
      if (!x || typeof x !== "object") continue;
      const s = x as Partial<ListeningSession>;
      if (typeof s.trackId !== "string" || !Number.isFinite(s.at) || !Number.isFinite(s.playedMs)) continue;
      out.push({
        trackId: s.trackId.slice(0, 300),
        title: typeof s.title === "string" ? s.title.slice(0, 160) : s.trackId.slice(0, 300),
        artist: typeof s.artist === "string" && s.artist ? s.artist.slice(0, 160) : "未知歌手",
        at: s.at as number,
        playedMs: Math.max(0, Math.min(MAX_SESSION_MS, s.playedMs as number)),
      });
    }
    return out.slice(-MAX_SESSIONS);
  } catch {
    return [];
  }
}

export async function loadLog(port: KeyValuePort): Promise<number> {
  sessions = parseLog(await port.read(KEY));
  notify();
  return sessions.length;
}

export async function saveLog(port: KeyValuePort): Promise<void> {
  await port.write(KEY, JSON.stringify(sessions));
}
