import type { Track } from "../library/schema.js";

/**
 * 每日推荐（Ring 1，纯函数，无 IO）。
 *
 * 没有推荐服务、也没有播放次数（history 只留最后一次播放，见 domain/history），
 * 能用的信号只有三个：红心、最近播放顺序、曲库本身。
 * 所以这里不装"猜你喜欢"：红心优先、最近听过的次之、其余按当天种子洗牌；
 * 同一天出同一份（可复现、可测试），第二天 06:00 自然换新。
 */
export interface DailyInput {
  tracks: readonly Track[];
  liked: ReadonlySet<string>;
  /** 最近播放，新的在前（domain/history 的 historyIds()） */
  recent: readonly string[];
  seed: number;
  count?: number;
  /** 「不喜欢」名单（B-11）：取牌之前先摘掉，别让用户反复看到同一首 */
  disliked?: ReadonlySet<string>;
}

const DEFAULT_COUNT = 30;
/** 同一位艺人 / 同一张专辑在一个歌单里最多占几首——不加这个，红心整张专辑会占满 30 首 */
const ARTIST_CAP = 3;
const ALBUM_CAP = 2;

const hashOf = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** LCG：够用且可复现，不需要密码学强度 */
const rngOf = (seed: number): (() => number) => {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
};

const shuffled = <T>(items: readonly T[], rand: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** 按种子洗一副牌（电台全库乱序、漫游抽签都用它，保证可复现） */
export const shuffledBy = <T>(items: readonly T[], seed: number): T[] => shuffled(items, rngOf(seed));

/** 同一天同一个种子：日期串做 FNV 哈希，跨进程稳定 */
export function dailySeed(at = new Date()): number {
  return hashOf(`${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`);
}

/** 距下一次 06:00 换新的毫秒数（已无 UI 消费方，单测钉住口径） */
export function nextRefreshMs(at = new Date()): number {
  const next = new Date(at);
  next.setHours(6, 0, 0, 0);
  if (next.getTime() <= at.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - at.getTime();
}

export function dailyPicks({ tracks, liked, recent, seed, count = DEFAULT_COUNT, disliked }: DailyInput): Track[] {
  if (tracks.length === 0) return [];
  const rand = rngOf(seed);

  const recency = new Map<string, number>();
  recent.forEach((id, i) => {
    if (!recency.has(id)) recency.set(id, i);
  });

  // 三档：红心 / 最近听过 / 其余。档内洗牌，档间按优先级拼接。
  const likedRows: Track[] = [];
  const recentRows: Track[] = [];
  const restRows: Track[] = [];
  for (const track of tracks) {
    if (disliked?.has(track.id)) continue;
    if (liked.has(track.id)) likedRows.push(track);
    else if (recency.has(track.id)) recentRows.push(track);
    else restRows.push(track);
  }
  recentRows.sort((a, b) => (recency.get(a.id) ?? 0) - (recency.get(b.id) ?? 0));

  const ordered = [...shuffled(likedRows, rand), ...recentRows, ...shuffled(restRows, rand)];

  const out: Track[] = [];
  const taken = new Set<string>();
  const perArtist = new Map<string, number>();
  const perAlbum = new Map<string, number>();

  const take = (track: Track): void => {
    out.push(track);
    taken.add(track.id);
    perArtist.set(track.artist, (perArtist.get(track.artist) ?? 0) + 1);
    perAlbum.set(track.album, (perAlbum.get(track.album) ?? 0) + 1);
  };

  for (const track of ordered) {
    if (out.length >= count) break;
    if (taken.has(track.id)) continue;
    if ((perArtist.get(track.artist) ?? 0) >= ARTIST_CAP) continue;
    if ((perAlbum.get(track.album) ?? 0) >= ALBUM_CAP) continue;
    take(track);
  }

  // 曲库小于配额、或曲风太集中时放宽配额回填，宁可重复艺人也不给半份
  if (out.length < count) {
    for (const track of ordered) {
      if (out.length >= count) break;
      if (!taken.has(track.id)) take(track);
    }
  }
  return out;
}

/** 最近添加：按文件修改时间倒序（曲库没有"添加时间"，mtime 是最接近的信号） */
export function recentAdds(tracks: readonly Track[], count = 5): Track[] {
  return [...tracks]
    .filter((t) => !t.missing)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, count);
}

/** 最近播放：历史里排前面的本地曲目。在线直链不在曲库，直接跳过。 */
export function recentPlayed(tracks: readonly Track[], recent: readonly string[], count = 5): Track[] {
  const byId = new Map(tracks.map((t) => [t.id, t] as const));
  const out: Track[] = [];
  for (const id of recent) {
    const track = byId.get(id);
    if (track) out.push(track);
    if (out.length >= count) break;
  }
  return out;
}

/** 漫游里"为什么抽它"：只从真实信号里挑一条说，凑不出就直说随机 */
export function reasonOf(track: Track, tracks: readonly Track[], liked: ReadonlySet<string>, recent: readonly string[]): string {
  if (liked.has(track.id)) return "你给这首盖过章（红心）";
  const at = recent.indexOf(track.id);
  if (at >= 0 && at < 10) return `最近听过，排在你最近的第 ${at + 1} 首`;
  const sameArtist = tracks.filter((t) => t.artist === track.artist && liked.has(t.id));
  if (sameArtist.length > 0) return `同一位艺人（${track.artist}）你有 ${sameArtist.length} 首红心`;
  const sameAlbum = tracks.filter((t) => t.album === track.album && t.album !== "" && liked.has(t.id));
  if (sameAlbum.length > 0) return `同一张专辑（${track.album}）里你红心过 ${sameAlbum.length} 首`;
  if (at >= 0) return "你听过它，只是不在最近这十首里";
  return "曲库随机抽的——今天还没轮到过它";
}

export interface RadioPick {
  artist: string;
  tracks: Track[];
}

/** 本地电台：抽一位曲目够多的艺人整组串播（在线源的 canGetRadio 四家全 false） */
export function radioOf(tracks: readonly Track[], seed: number, minTracks = 3): RadioPick | null {
  const byArtist = new Map<string, Track[]>();
  for (const track of tracks) {
    const list = byArtist.get(track.artist);
    if (list) list.push(track);
    else byArtist.set(track.artist, [track]);
  }
  const candidates = [...byArtist.entries()].filter(([, list]) => list.length >= minTracks);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a[0].localeCompare(b[0], "zh-Hans-CN"));
  const rand = rngOf(seed ^ 0x9e3779b9);
  const [artist, list] = candidates[Math.floor(rand() * candidates.length)];
  return { artist, tracks: shuffled(list, rand) };
}
