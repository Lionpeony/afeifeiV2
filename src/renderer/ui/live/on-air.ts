import type { RemoteTrack } from "../../../contracts/capability.js";
import type { RemoteTrackMeta } from "../../../contracts/index.js";

/**
 * 全局正在播的远程节目：首页 hero 的事实源不是每日推荐，是播放器本身。
 * 榜单/歌单/搜索/FM 点播的歌都算「正在播出」，首页跟着切。
 */
export interface OnAirProgram {
  /** 当前曲的队列元数据（sourceId = 音源，songId = 歌 id） */
  meta: RemoteTrackMeta;
  /** 本期节目单 = 当前队列里的同音源曲目，按播出顺序 */
  list: RemoteTrack[];
  /** 音源显示名（「QQ音乐」），origin 缺席时的兜底 */
  sourceName: string;
  /** 节目来源标签（「内地榜」「搜索 · xx」），queue/set 写入；null = 调用方没说 */
  origin: string | null;
}

/**
 * host 每次渲染现算的投影，不存 state：队列表里查得到当前曲 = 在播远程曲目
 * （本地歌查不到，返回 null，首页回落每日推荐）。
 * 节目单只收同音源的条目：混源队列在播放链路里不存在，防一手 id 前缀错位。
 */
export function onAirProgram(
  trackId: string | null,
  queue: { items: readonly string[]; remote: Record<string, RemoteTrackMeta>; origin?: string | null },
  sourceName: (sourceId: string) => string,
): OnAirProgram | null {
  const meta = trackId ? queue.remote[trackId] : undefined;
  if (!meta) return null;
  const list: RemoteTrack[] = [];
  for (const id of queue.items) {
    const m = queue.remote[id];
    if (m && m.sourceId === meta.sourceId) {
      list.push({
        sourceId: m.songId,
        title: m.title,
        artist: m.artist,
        album: "",
        durationMs: m.durationMs ?? 0,
        coverUrl: m.coverUrl,
      });
    }
  }
  return { meta, list, sourceName: sourceName(meta.sourceId), origin: queue.origin ?? null };
}
