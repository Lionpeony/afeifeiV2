/**
 * 房间编排投影（docs/27 C.1）：把域数据映射成「播什么、按什么顺序」的形状。
 *
 * 房间不再各自拼表格，而是先产出一个 RoomProgram，再由视图按语法渲染：
 *   shelf —— 封面墙 / 分组书架（本地、歌单、在线）
 *   tape  —— 时间归档带（最近、喜欢、榜单）
 *   board —— 状态看板（下载）
 *
 * 纯函数、可单测；不读时钟（nowMs 由调用方给），不碰 DOM。
 */
import type { Track } from "../domain/library/schema.js";

export type RoomKind = "tape" | "shelf" | "board" | "report" | "form";

export interface ProgramItem {
  id: string;
  title: string;
  sub: string;
  durationMs?: number;
  cover?: boolean;
  state?: "queued" | "active" | "paused" | "done" | "error";
}

export interface ProgramSegment {
  key: string;
  label: string;
  items: ProgramItem[];
  /** 时间型段落的起止（ms），供归档带定位 */
  fromMs?: number;
  toMs?: number;
}

export interface RoomProgram {
  kind: RoomKind;
  meta: { title: string; count: number; note?: string };
  segments: ProgramSegment[];
}

const itemOf = (track: Track): ProgramItem => ({
  id: track.id,
  title: track.title,
  sub: track.artist,
  durationMs: track.durationMs,
  cover: track.hasCover,
});

const DAY_MS = 86_400_000;

/** 本地的一日零点；用调用方给的时间算，不读系统时钟。 */
export function startOfDay(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 书架：按专辑分组，专辑名升序；空专辑名归一成「未分类」。 */
export function shelfProgram(tracks: readonly Track[], title = "本地"): RoomProgram {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const album = track.album.trim() || "未分类";
    const list = groups.get(album);
    if (list) list.push(track);
    else groups.set(album, [track]);
  }
  const segments: ProgramSegment[] = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "zh-Hans-CN"))
    .map(([album, list]) => ({
      key: album,
      label: album,
      items: list
        .slice()
        .sort((a, b) => a.artist.localeCompare(b.artist, "zh-Hans-CN") || a.title.localeCompare(b.title, "zh-Hans-CN"))
        .map(itemOf),
    }));
  const artists = new Set(tracks.map((t) => t.artist));
  return {
    kind: "shelf",
    meta: {
      title,
      count: tracks.length,
      note: tracks.length ? `${groups.size} 张专辑 · ${artists.size} 位艺人` : undefined,
    },
    segments,
  };
}

/** 归档带：条目 + 各自的时间戳，按今天 / 这周 / 更早分桶，段内从新到旧。 */
export interface TapeEntry {
  item: ProgramItem;
  at: number;
  key?: string;
}

export function tapeFromEntries(entries: readonly TapeEntry[], nowMs: number, title = "最近"): RoomProgram {
  const dayStart = startOfDay(nowMs);
  const weekStart = dayStart - 6 * DAY_MS;
  const buckets = [
    { key: "today", label: "今天", fromMs: dayStart, toMs: nowMs, rows: [] as TapeEntry[] },
    { key: "week", label: "这周", fromMs: weekStart, toMs: dayStart, rows: [] as TapeEntry[] },
    { key: "older", label: "更早", fromMs: 0, toMs: weekStart, rows: [] as TapeEntry[] },
  ];
  for (const entry of entries) {
    if (entry.at >= dayStart) buckets[0]!.rows.push(entry);
    else if (entry.at >= weekStart) buckets[1]!.rows.push(entry);
    else buckets[2]!.rows.push(entry);
  }
  const segments = buckets
    .filter((bucket) => bucket.rows.length > 0)
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      fromMs: bucket.fromMs,
      toMs: bucket.toMs,
      items: bucket.rows
        .slice()
        .sort((a, b) => b.at - a.at)
        .map((entry) => entry.item),
    }));
  return { kind: "tape", meta: { title, count: entries.length }, segments };
}

/** 归档带：曲目的入库时间（mtime）当时间轴；喜欢页没有收藏时间，口径以入库为准。 */
export function tapeProgram(tracks: readonly Track[], nowMs: number, title = "最近"): RoomProgram {
  return tapeFromEntries(
    tracks.map((track) => ({ item: itemOf(track), at: track.mtimeMs, key: track.id })),
    nowMs,
    title,
  );
}

export interface BoardRow {
  id: string;
  title: string;
  sub?: string;
  state: "queued" | "active" | "paused" | "done" | "error";
  durationMs?: number;
}

const BOARD_LABELS: Record<BoardRow["state"], string> = {
  active: "传输中",
  queued: "排队",
  paused: "已暂停",
  done: "已归档",
  error: "失败",
};

/** 看板：固定五列（传输中 / 排队 / 已暂停 / 已归档 / 失败），列内保持调用方顺序。 */
export function boardProgram(rows: readonly BoardRow[], title = "下载"): RoomProgram {
  const order: BoardRow["state"][] = ["active", "queued", "paused", "done", "error"];
  const segments: ProgramSegment[] = order.map((state) => ({
    key: state,
    label: BOARD_LABELS[state],
    items: rows
      .filter((row) => row.state === state)
      .map((row) => ({ id: row.id, title: row.title, sub: row.sub ?? "", durationMs: row.durationMs, state })),
  }));
  return { kind: "board", meta: { title, count: rows.length }, segments };
}
