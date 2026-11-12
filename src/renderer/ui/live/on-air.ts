import type { RemoteTrack } from "../../../contracts/capability.js";
import type { PlayMode, RemoteTrackMeta } from "../../../contracts/index.js";
import { orderOf, remoteTrackId } from "../../kernel/index.js";

/**
 * 全局正在播的远程节目：首页 hero 的事实源不是每日推荐，是播放器本身。
 * 榜单/歌单/搜索/FM 点播的歌都算「正在播出」，首页跟着切。
 */
export interface OnAirProgram {
  /** 当前曲的队列元数据（sourceId = 音源，songId = 歌 id） */
  meta: RemoteTrackMeta;
  /** 本期节目单 = 当前队列里的同音源曲目，**队列原顺序**。
      刻意不重排：点播时它会原样回传给 queue/set 重建队列，
      一旦这里返回打乱后的顺序，queue.items 被重排 → 同 seed 算出的 order 整个变，
      列表会自己跳一下。显示用的播出顺序走 orderProgram() 投影。 */
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

/**
 * 把节目单按**实际播出顺序**重排（shuffle 投影）。
 *
 * 为什么必须有这个投影：`queue.items` 是用户给的原顺序，真正播什么由
 * `orderOf(items, mode, seed)` 决定。首页列表若按原顺序取名，「接下来」就是假的——
 * 实测（8 首 / seed=12345）：order = [3,0,1,5,4,6,7]，播第 04 首时列表第 1 格写着 05，
 * 而实际下一首是 01。随机切歌因此也无法做共享元素转场：新歌根本不在旧列表里。
 *
 * 重排之后，切歌时新 lead 必然落在旧列表第 1 格 —— 转场用的 rect 快照命中，
 * 随机与顺序共用同一套动画，不需要任何新动效分支。
 *
 * 返回 null = 不能重排，调用方回落原顺序。三种情况：
 * · 非随机模式（顺序播放时环列本来就等于播出顺序）；
 * · program 里有一项在队列里找不到（每日推荐刷新了但队列没变、混音源队列）；
 * · order 里含 program 之外的曲目（队列里混了别的音源）。
 *
 * ⚠ 返回值**只能用于显示**，不许当作 queue/set 的 items：
 *   那会重排 queue.items，同 seed 算出的 order 整个变，列表会自己跳一下。
 */
export function orderProgram(
  program: RemoteTrack[],
  queue: { items: readonly string[]; mode: PlayMode; shuffleSeed: number } | null | undefined,
  sourceId: string,
): RemoteTrack[] | null {
  if (!queue || queue.mode !== "shuffle" || program.length < 2) return null;
  const at = new Map<string, number>();
  queue.items.forEach((id, i) => {
    at.set(id, i);
  });
  // 每一项都要能在队列里定位；缺一项就不重排（宁可显示原顺序，也不显示错序）
  const slots: number[] = [];
  for (const t of program) {
    const q = at.get(remoteTrackId(sourceId, t.sourceId));
    if (q === undefined) return null;
    slots.push(q);
  }
  const bySlot = new Map<number, RemoteTrack>();
  program.forEach((t, i) => {
    bySlot.set(slots[i], t);
  });
  const out: RemoteTrack[] = [];
  for (const qi of orderOf([...queue.items], queue.mode, queue.shuffleSeed)) {
    const t = bySlot.get(qi);
    if (t) out.push(t);
  }
  return out.length === program.length ? out : null;
}
