import type { Track } from "../library/schema.js";
import { dailySeed, shuffledBy } from "../recommend/index.js";

/**
 * 节目表（纯函数，无 IO）。
 *
 * 时间模型跟首页的每日推荐同一根轴：广播日从 06:00 起算，到次日 06:00 结束。
 * 节目由曲库真实曲目拼成，不生成假曲目、不编造时长；空曲库就是空台。
 *
 * 所有函数显式接收"此刻"（毫秒），不自己读 Date.now —— 可穷举测试，
 * 全站也只有一处取墙钟。
 */

export const DAY_MS = 86_400_000;
export const BROADCAST_DAY_START_HOUR = 6;

/** 一档节目的目标时长与曲目上限；曲目不够时自然变短，不补静音。 */
const TARGET_PROGRAM_MS = 30 * 60_000;
const MAX_PROGRAM_ITEMS = 12;
/** 收尾短于这个就并回前一档：节目带上只剩编号的窄条，读起来像排版坏了。 */
export const MIN_PROGRAM_MS = 12 * 60_000;
const MIN_GROUP_ITEMS = 2;
/** 时长缺失/为 0 的曲目按 3:30 排，只影响节目表，不改曲库数据。 */
const FALLBACK_TRACK_MS = 210_000;
const MIN_TRACK_MS = 20_000;
const MAX_PROGRAMS = 512;

export type ProgramKind = "album" | "artist" | "mix";

export interface ProgramItem {
  trackId: string;
  /** 队列里放的标识（本地曲目是原始路径，与 queue/set 约定一致） */
  path: string;
  title: string;
  artist: string;
  durationMs: number;
  /** 在本档内的起始偏移 */
  offsetMs: number;
}

export interface Program {
  id: string;
  /** 在当天节目表中的连续序号，从 1 开始 */
  index: number;
  title: string;
  subtitle: string;
  kind: ProgramKind;
  startMs: number;
  endMs: number;
  items: ProgramItem[];
}

export interface Schedule {
  dayStart: number;
  dayEnd: number;
  seed: number;
  programs: Program[];
}

export interface JoinPoint {
  program: Program;
  item: ProgramItem;
  itemIndex: number;
  /** 曲内位置（毫秒） */
  positionMs: number;
  /** 档内位置（毫秒） */
  programOffsetMs: number;
}

/** 广播日 06:00 的绝对时刻。at 早于 06:00 时归到前一天。 */
export function startOfBroadcastDay(at: number): number {
  const d = new Date(at);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), BROADCAST_DAY_START_HOUR, 0, 0, 0);
  if (start.getTime() > at) start.setDate(start.getDate() - 1);
  return start.getTime();
}

/** 一天中的时段标签（只看本机时区，不引第三方）。 */
export function slotLabel(at: number): string {
  const h = new Date(at).getHours();
  if (h < 6) return "深夜";
  if (h < 9) return "清晨";
  if (h < 12) return "上午";
  if (h < 17) return "午后";
  if (h < 20) return "黄昏";
  return "夜场";
}

const durationOf = (t: Track): number =>
  Number.isFinite(t.durationMs) && t.durationMs >= MIN_TRACK_MS ? t.durationMs : FALLBACK_TRACK_MS;

interface Group {
  key: string;
  title: string;
  subtitle: string;
  kind: ProgramKind;
  tracks: Track[];
}

function groupOf(tracks: Track[]): Group[] {
  const albums = new Map<string, Track[]>();
  const artists = new Map<string, Track[]>();
  const loose: Track[] = [];

  for (const track of tracks) {
    const album = track.album.trim();
    const artist = track.artist.trim();
    if (album) {
      const key = `${artist}|${album}`;
      const list = albums.get(key);
      if (list) list.push(track);
      else albums.set(key, [track]);
    } else if (artist) {
      const list = artists.get(artist);
      if (list) list.push(track);
      else artists.set(artist, [track]);
    } else {
      loose.push(track);
    }
  }

  const out: Group[] = [];
  for (const [key, list] of albums) {
    if (list.length < MIN_GROUP_ITEMS) {
      loose.push(...list);
      continue;
    }
    const title = list[0].album.trim() || "无题专辑";
    const artist = list[0].artist.trim();
    out.push({
      key: `al:${key}`,
      title,
      subtitle: artist ? `${artist} · 专辑轮值` : "专辑轮值",
      kind: "album",
      tracks: list,
    });
  }
  for (const [artist, list] of artists) {
    if (list.length < MIN_GROUP_ITEMS) {
      loose.push(...list);
      continue;
    }
    out.push({
      key: `ar:${artist}`,
      title: `${artist} 作品选`,
      subtitle: "艺人轮值",
      kind: "artist",
      tracks: list,
    });
  }
  if (loose.length > 0) {
    out.push({
      key: "mix:night",
      title: "夜间轮值",
      subtitle: "曲库混编",
      kind: "mix",
      tracks: loose,
    });
  }
  return out;
}

interface Template {
  key: string;
  title: string;
  subtitle: string;
  kind: ProgramKind;
  items: Omit<ProgramItem, "offsetMs">[];
}

/** 码元比较：排台只在启动/曲库变更时跑，localeCompare 在 5000 首上要几十毫秒。 */
const cmpText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function chunksOf(group: Group): Template[] {
  const sorted = [...group.tracks].sort((a, b) => {
    if (a.album === b.album) return cmpText(a.path, b.path);
    return cmpText(a.album, b.album);
  });
  const chunks: Track[][] = [];
  let current: Track[] = [];
  let ms = 0;
  for (const track of sorted) {
    const d = durationOf(track);
    if (current.length > 0 && (ms + d > TARGET_PROGRAM_MS || current.length >= MAX_PROGRAM_ITEMS)) {
      chunks.push(current);
      current = [];
      ms = 0;
    }
    current.push(track);
    ms += d;
  }
  if (current.length > 0) chunks.push(current);

  // 目标 30 分钟切出来的尾巴可能只剩一两首（例如 8+1 首）。
  // 尾巴并回前一档，节目带上就不会出现宽度只剩编号的窄条；曲目数到顶时，
  // 改成从上一档末尾挪几首到尾巴，让两档都过线。
  if (chunks.length > 1) {
    const tail = chunks[chunks.length - 1];
    const prev = chunks[chunks.length - 2];
    let tailMs = tail.reduce((sum, t) => sum + durationOf(t), 0);
    if (tailMs < MIN_PROGRAM_MS) {
      if (prev.length + tail.length <= MAX_PROGRAM_ITEMS) {
        prev.push(...tail);
        chunks.pop();
      } else {
        while (tailMs < MIN_PROGRAM_MS && prev.length > 1) {
          const moved = prev[prev.length - 1];
          const movedMs = durationOf(moved);
          const prevMs = prev.reduce((sum, t) => sum + durationOf(t), 0);
          if (prevMs - movedMs < MIN_PROGRAM_MS) break;
          prev.pop();
          tail.unshift(moved);
          tailMs += movedMs;
        }
      }
    }
  }

  return chunks.map((chunk, i) => ({
    key: `${group.key}#${i}`,
    title: chunks.length > 1 ? `${group.title} · 第${i + 1}辑` : group.title,
    subtitle: group.subtitle,
    kind: group.kind,
    items: chunk.map((t) => ({
      trackId: t.id,
      path: t.path,
      title: t.title,
      artist: t.artist,
      durationMs: durationOf(t),
    })),
  }));
}

function templatesOf(tracks: Track[], seed: number): Template[] {
  if (tracks.length === 0) return [];
  const shuffled = shuffledBy(tracks, seed);
  const templates = groupOf(shuffled).flatMap(chunksOf);
  // 节目顺序每天不同，但同一天可复现；同组曲目仍然成档，不被打散。
  return shuffledBy(templates, (seed ^ 0x9e3779b9) >>> 0);
}

/** 用曲库真实曲目排一天的节目。空曲库返回空表。 */
export function buildDailySchedule(tracks: readonly Track[], at: number): Schedule {
  const dayStart = startOfBroadcastDay(at);
  const dayEnd = dayStart + DAY_MS;
  // dailySeed 只看日历日；广播日 06:00 起算，所以取当天 09:00 定种子，
  // 凌晨 00:00–06:00 仍归前一档，不会跨过午夜换表。
  const seed = dailySeed(new Date(dayStart + 3 * 3_600_000));
  const templates = templatesOf([...tracks], seed);
  const programs: Program[] = [];

  let cursor = dayStart;
  let pass = 0;
  let lastKey: string | null = null;
  while (cursor < dayEnd && templates.length > 0 && programs.length < MAX_PROGRAMS) {
    const order = [...(pass === 0 ? templates : shuffledBy(templates, (seed + pass * 0x85ebca6b) >>> 0))];
    // 轮次交界处两组都可能是"叶惠美"：换掉新轮次的首档，否则"下一档"和当前档同名。
    if (lastKey !== null && order.length > 1 && order[0].key === lastKey) {
      const j = order.findIndex((t) => t.key !== lastKey);
      if (j > 0) [order[0], order[j]] = [order[j], order[0]];
    }
    for (const template of order) {
      if (template.items.length === 0) continue;
      let programMs = 0;
      const items: ProgramItem[] = template.items.map((item) => {
        const placed = { ...item, offsetMs: programMs };
        programMs += item.durationMs;
        return placed;
      });
      programs.push({
        id: `${template.key}@${pass}`,
        index: programs.length + 1,
        title: template.title,
        subtitle: template.subtitle,
        kind: template.kind,
        startMs: cursor,
        endMs: cursor + programMs,
        items,
      });
      cursor += programMs;
      lastKey = template.key;
      if (cursor >= dayEnd || programs.length >= MAX_PROGRAMS) break;
    }
    pass += 1;
  }

  return { dayStart, dayEnd, seed, programs };
}

/** 此刻播到哪一档。表外返回 null（跨日时由调用方重建）。 */
export function programAt(schedule: Schedule, at: number): Program | null {
  const list = schedule.programs;
  if (list.length === 0 || at < list[0].startMs || at >= list[list.length - 1].endMs) return null;

  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = list[mid];
    if (at < p.startMs) hi = mid - 1;
    else if (at >= p.endMs) lo = mid + 1;
    else return p;
  }
  return null;
}

/** 接驳点：档内偏移 → 具体曲目与曲内位置。 */
export function joinPointAt(schedule: Schedule, at: number): JoinPoint | null {
  const program = programAt(schedule, at);
  if (!program) return null;
  const offset = Math.max(0, Math.min(at - program.startMs, program.endMs - program.startMs - 1));

  let itemIndex = program.items.length - 1;
  for (let i = 0; i < program.items.length; i += 1) {
    const item = program.items[i];
    if (offset < item.offsetMs + item.durationMs) {
      itemIndex = i;
      break;
    }
  }
  const item = program.items[itemIndex];
  const positionMs = Math.max(0, Math.min(offset - item.offsetMs, item.durationMs - 1000));
  return { program, item, itemIndex, positionMs, programOffsetMs: offset };
}

/** 下一档的开始时刻（界缝）。 */
export function nextSlot(schedule: Schedule, at: number): number | null {
  return programAt(schedule, at)?.endMs ?? null;
}

/**
 * 从接驳点往后排队列：本档剩余曲目 + 后续节目。
 * 队列里放 path（本地曲目播放标识），与现有 queue/set 的约定一致。
 */
export function queueFromJoin(schedule: Schedule, join: JoinPoint, programsAhead = 2): string[] {
  const start = schedule.programs.findIndex((p) => p.id === join.program.id);
  if (start < 0) return join.program.items.slice(join.itemIndex).map((item) => item.path);

  const out: string[] = [];
  for (let i = join.itemIndex; i < join.program.items.length; i += 1) out.push(join.program.items[i].path);
  for (let k = 1; k <= programsAhead && start + k < schedule.programs.length; k += 1) {
    for (const item of schedule.programs[start + k].items) out.push(item.path);
  }
  return out;
}
