import type { AppState, DownloadItem, Intent } from "../../contracts/index.js";
import { clampCursor, nextShuffleSeed, orderOf, prevAction, pushHistory, stepBackward, stepForward } from "./queue.js";

/**
 * 单写者 store（I2）。全应用只有 dispatch 一个写入口。
 *
 * 注意：**状态里不放实时播放位置**。positionMs 只记录"用户最后一次 seek / 切歌时定的位置"，
 * 用于恢复与 3 秒规则；进度条每帧从 clock.t() 取，不经过 store（否则每帧一次全量通知）。
 */

type Listener = () => void;

const initialState: AppState = {
  player: {
    status: "idle",
    trackId: null,
    trackTitle: null,
    positionMs: 0,
    volume: 0.8,
    muted: false,
    error: null,
    remote: null,
  },
  queue: { items: [], cursor: -1, context: [], history: [], mode: "order", shuffleSeed: 1 },
  // 10 段与 capability/audio/eq.ts 的 EQ_BANDS 对齐；kernel 不 import capability（环约束），
  // 这条一致性由 test/audio.test.mjs 钉住 —— 上次段数从 6 改 10 就是这里漏了
  audio: { preampDb: 0, eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], crossfadeSec: 0 },
  stage: {
    preset: "paper",
    intensity: 1,
    layers: { wallpaper: true, visual: true, cover: true, lyric: true, controls: true },
    lyricRenderer: "press",
    // 有译文就并排显示（A-03 判据）；没有译文的曲目这一项不起作用
    translation: true,
    customTokens: null,
  },
  sleep: { endsAt: null },
  download: { items: [] },
};

/** 音频配置的限幅（±12dB，与 capability 侧 GAIN_LIMIT_DB 同值）。kernel 不 import capability，这里只做数值 clamp。 */
const AUDIO_LIMIT_DB = 12;
const clampAudioDb = (v: number): number =>
  Number.isFinite(v) ? Math.min(AUDIO_LIMIT_DB, Math.max(-AUDIO_LIMIT_DB, v)) : 0;

let state: AppState = initialState;
const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * 切到队列里的某一格：回到 loading，剩下交给引擎。
 * 除 player/queue 外一律 `...current` —— 手抄其余域会在加字段时漏（sleep 就漏过一次）。
 */
function switchTo(current: AppState, cursor: number): AppState {
  const { queue, player } = current;
  if (cursor < 0) {
    return {
      ...current,
      player: {
        ...player,
        status: "ended",
        trackId: null,
        trackTitle: null,
        positionMs: 0,
        remote: null,
      },
      queue: { ...queue, cursor: -1 },
    };
  }
  const trackId = queue.items[cursor];
  return {
    ...current,
    // 队列里都是本地曲目，标题由 UI 从路径取，这里清掉上一首的在线标题与元数据
    player: {
      ...player,
      status: "loading",
      trackId,
      trackTitle: null,
      positionMs: 0,
      error: null,
      remote: null,
    },
    queue: { ...queue, cursor, history: pushHistory(queue.history, trackId) },
  };
}

function reduce(current: AppState, intent: Intent): AppState {
  const { player, queue } = current;

  switch (intent.type) {
    case "player/play": {
      const trackId = intent.trackId;
      if (!trackId) {
        if (player.status === "playing") return current;
        return { ...current, player: { ...player, status: "playing", error: null } };
      }
      if (player.trackId === trackId && player.status === "playing") return current;
      const cursor = queue.items.indexOf(trackId);
      const nextQueue =
        cursor >= 0 ? { ...queue, cursor, history: pushHistory(queue.history, trackId) } : queue;
      return {
        ...current,
        player: {
          ...player,
          status: "playing",
          trackId,
          trackTitle: intent.trackTitle ?? null,
          positionMs: 0,
          error: null,
          remote: intent.remote ?? null,
        },
        queue: nextQueue,
      };
    }

    case "player/pause": {
      if (player.status !== "playing") return current;
      return { ...current, player: { ...player, status: "paused" } };
    }

    case "player/toggle": {
      if (player.status === "playing") return { ...current, player: { ...player, status: "paused" } };
      if (player.status === "paused" || player.status === "ended") {
        return { ...current, player: { ...player, status: "playing", error: null } };
      }
      return current;
    }

    case "player/seek": {
      const positionMs = Math.max(0, intent.positionMs);
      if (player.positionMs === positionMs) return current;
      return { ...current, player: { ...player, positionMs } };
    }

    case "player/setVolume": {
      const volume = Math.min(1, Math.max(0, intent.volume));
      if (player.volume === volume) return current;
      return { ...current, player: { ...player, volume } };
    }

    case "player/setMuted": {
      if (player.muted === intent.muted) return current;
      return { ...current, player: { ...player, muted: intent.muted } };
    }

    case "player/ended": {
      if (queue.mode === "repeat-one") {
        return { ...current, player: { ...player, status: "playing", positionMs: 0 } };
      }
      const order = orderOf(queue.items, queue.mode, queue.shuffleSeed);
      const next = stepForward(order, queue.cursor, queue.mode);
      return next < 0
        ? { ...current, player: { ...player, status: "ended", positionMs: 0 } }
        : switchTo(current, next);
    }

    case "player/error": {
      if (player.status === "error" && player.error === intent.code) return current;
      return { ...current, player: { ...player, status: "error", error: intent.code } };
    }

    case "player/cue": {
      return {
        ...current,
        player: {
          ...player,
          status: "loading",
          trackId: intent.trackId,
          positionMs: Math.max(0, intent.positionMs ?? 0),
          error: null,
        },
      };
    }

    case "player/ready": {
      if (player.status !== "loading") return current;
      return { ...current, player: { ...player, status: "paused" } };
    }

    case "player/began": {
      // crossfade 的入场曲已发声（M9-3）：loading 原地转 playing，trackId/队列不动
      if (player.status !== "loading") return current;
      return { ...current, player: { ...player, status: "playing" } };
    }

    case "queue/set": {
      const items = intent.items;
      if (items.length === 0) {
        return {
          ...current,
          player: {
            ...player,
            status: "idle",
            trackId: null,
            trackTitle: null,
            positionMs: 0,
            remote: null,
          },
          queue: { ...queue, items: [], cursor: -1, context: intent.context ?? [], history: [] },
        };
      }
      const cursor = clampCursor(items, intent.startAt ?? 0);
      const staged: AppState = {
        ...current,
        player,
        queue: { ...queue, items, cursor, context: intent.context ?? items, history: [] },
      };
      return switchTo(staged, cursor);
    }

    case "queue/add": {
      // 追加到队尾：不打断当前播放，光标不动（唱完这几首才会轮到）
      const add = intent.items.filter((id) => typeof id === "string" && id.length > 0);
      if (add.length === 0) return current;
      const items = [...queue.items, ...add];
      return { ...current, queue: { ...queue, items } };
    }

    case "queue/next": {
      const order = orderOf(queue.items, queue.mode, queue.shuffleSeed);
      // byUser=true：用户主动点「下一首」，单曲循环也照常切（自然结束那条路走 player/ended）
      const next = stepForward(order, queue.cursor, queue.mode, true);
      return next < 0
        ? { ...current, player: { ...player, status: "ended", positionMs: 0 } }
        : switchTo(current, next);
    }

    case "queue/prev": {
      const at = intent.atPositionMs ?? player.positionMs;
      if (prevAction(at) === "restart") {
        if (player.positionMs === 0) return current;
        return { ...current, player: { ...player, positionMs: 0 } };
      }
      const order = orderOf(queue.items, queue.mode, queue.shuffleSeed);
      return switchTo(current, stepBackward(order, queue.cursor, queue.mode, true));
    }

    case "queue/mode": {
      if (queue.mode === intent.mode) return current;
      // 切到随机必须换种子：种子不变 = 每次进随机都是同一个排列（用户看到"随机没生效"）
      const seed = intent.mode === "shuffle" ? nextShuffleSeed(queue.shuffleSeed) : queue.shuffleSeed;
      return { ...current, queue: { ...queue, mode: intent.mode, shuffleSeed: seed } };
    }

    case "queue/remove": {
      const at = intent.index;
      if (at < 0 || at >= queue.items.length) return current;
      const items = [...queue.items];
      items.splice(at, 1);

      // 删的是当前之后的：光标不动，后面整体前移一格
      if (at > queue.cursor) return { ...current, queue: { ...queue, items } };
      // 删的是当前之前的：光标记的"第几格"要减一，否则会指向下一首
      if (at < queue.cursor) return { ...current, queue: { ...queue, items, cursor: queue.cursor - 1 } };

      // 删的就是正在播这首：接到同位置的下一条；删空了就结束（不假装还有歌）
      const nextCursor = at < items.length ? at : -1;
      const wasPlaying = player.status === "playing";
      const switched = switchTo({ ...current, queue: { ...queue, items, cursor: nextCursor } }, nextCursor);
      return wasPlaying && switched.player.trackId
        ? { ...switched, player: { ...switched.player, status: "playing" } }
        : switched;
    }

    case "queue/move": {
      const { from, to } = intent;
      const len = queue.items.length;
      if (from === to || from < 0 || to < 0 || from >= len || to >= len) return current;

      const items = [...queue.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);

      // 光标跟"正在播那首"走，不跟下标走 —— 排序不该换歌（A-20）
      const playingIdx = player.trackId ? items.indexOf(player.trackId) : -1;
      let cursor = queue.cursor;
      if (playingIdx >= 0) {
        cursor = playingIdx;
      } else if (from === cursor) {
        cursor = to;
      } else if (from < cursor && to >= cursor) {
        cursor -= 1;
      } else if (from > cursor && to <= cursor) {
        cursor += 1;
      }
      return { ...current, queue: { ...queue, items, cursor: Math.min(Math.max(cursor, -1), items.length - 1) } };
    }

    case "queue/restore": {
      const restored = intent.state;
      return { ...current, queue: { ...restored, cursor: clampCursor(restored.items, restored.cursor) } };
    }

    /* ---- 睡眠定时（A-23）：状态里只有截止时刻，倒计时与触发都在 UI ---- */

    case "sleep/set": {
      if (!Number.isFinite(intent.endsAt)) return current;
      if (current.sleep.endsAt === intent.endsAt) return current;
      return { ...current, sleep: { endsAt: intent.endsAt } };
    }

    case "sleep/clear": {
      if (current.sleep.endsAt === null) return current;
      return { ...current, sleep: { endsAt: null } };
    }

    case "sleep/expire": {
      // 没设定时就不该有"到点"——迟到的计时器直接忽略
      if (current.sleep.endsAt === null) return current;
      const cleared: AppState = { ...current, sleep: { endsAt: null } };
      // 到点只暂停：不退出、不清队列、不动播放位置（A-23 验收）
      if (player.status !== "playing") return cleared;
      return { ...cleared, player: { ...player, status: "paused" } };
    }

    case "audio/setPreamp": {
      const preampDb = clampAudioDb(intent.db);
      if (current.audio.preampDb === preampDb) return current;
      return { ...current, audio: { ...current.audio, preampDb } };
    }

    case "audio/setEq": {
      // 长度不齐整组拒绝——部分生效的 EQ 比不生效更难排查
      if (intent.gains.length !== current.audio.eq.length) return current;
      const eq = intent.gains.map(clampAudioDb);
      if (eq.every((v, i) => v === current.audio.eq[i])) return current;
      return { ...current, audio: { ...current.audio, eq } };
    }

    case "audio/setCrossfade": {
      // 档位白名单（0/3/6），不在档位一律关——kernel 不 import capability，这里就地 clamp
      const sec = intent.sec === 3 || intent.sec === 6 ? intent.sec : 0;
      if (current.audio.crossfadeSec === sec) return current;
      return { ...current, audio: { ...current.audio, crossfadeSec: sec } };
    }

    case "audio/restore": {
      const config = intent.config;
      // 段数必须与当前一致：老存档/外来配置的迁移在 capability/audio/eq.ts 做，
      // kernel 不认识频段，只能守住"长度不变"这条不变式
      if (config.eq.length !== current.audio.eq.length) {
        const eq = current.audio.eq.map(() => 0);
        const preampDb = clampAudioDb(config.preampDb);
        const crossfadeSec = config.crossfadeSec === 3 || config.crossfadeSec === 6 ? config.crossfadeSec : 0;
        const untouched =
          preampDb === current.audio.preampDb &&
          crossfadeSec === current.audio.crossfadeSec &&
          eq.every((v, i) => v === current.audio.eq[i]);
        return untouched ? current : { ...current, audio: { preampDb, eq, crossfadeSec } };
      }
      if (
        config.preampDb === current.audio.preampDb &&
        config.crossfadeSec === current.audio.crossfadeSec &&
        config.eq.length === current.audio.eq.length &&
        config.eq.every((v, i) => v === current.audio.eq[i])
      ) {
        return current;
      }
      return { ...current, audio: config };
    }

    case "stage/setPreset": {
      if (current.stage.preset === intent.preset) return current;
      return { ...current, stage: { ...current.stage, preset: intent.preset } };
    }

    case "stage/setIntensity": {
      if (current.stage.intensity === intent.intensity) return current;
      return { ...current, stage: { ...current.stage, intensity: intent.intensity } };
    }

    case "stage/toggleLayer": {
      // cover / controls 永远开着（50 §9.2 可关列是 ❌）——发了也忽略
      if (intent.layer === "cover" || intent.layer === "controls") return current;
      const layers = { ...current.stage.layers, [intent.layer]: !current.stage.layers[intent.layer] };
      return { ...current, stage: { ...current.stage, layers } };
    }

    case "stage/setTranslation": {
      if (current.stage.translation === intent.on) return current;
      return { ...current, stage: { ...current.stage, translation: intent.on } };
    }

    case "stage/setLyricRenderer": {
      if (current.stage.lyricRenderer === intent.renderer) return current;
      return { ...current, stage: { ...current.stage, lyricRenderer: intent.renderer } };
    }

    case "stage/setTheme": {
      const tokens = intent.tokens;
      const cur = current.stage.customTokens;
      const same =
        (tokens === null && cur === null) ||
        (tokens !== null &&
          cur !== null &&
          Object.keys(tokens).length === Object.keys(cur).length &&
          Object.entries(tokens).every(([k, v]) => cur[k] === v));
      if (same) return current;
      return { ...current, stage: { ...current.stage, customTokens: tokens } };
    }

    case "stage/restore": {
      const c = intent.config;
      const same =
        c.preset === current.stage.preset &&
        c.intensity === current.stage.intensity &&
        c.lyricRenderer === current.stage.lyricRenderer &&
        c.translation === current.stage.translation &&
        (Object.keys(current.stage.layers) as (keyof typeof c.layers)[]).every(
          (k) => c.layers[k] === current.stage.layers[k],
        );
      if (same) return current;
      return { ...current, stage: c };
    }

    /* ---- 下载（M7）。状态机转移即时；字节进度由 runner 节流后再进来 ---- */

    case "download/add": {
      if (current.download.items.some((i) => i.id === intent.item.id)) return current;
      return { ...current, download: { items: [...current.download.items, intent.item] } };
    }

    case "download/start": {
      const items = mapItem(current.download.items, intent.id, (i) =>
        i.state === "queued" ? { ...i, state: "active" as const } : i,
      );
      return items === current.download.items ? current : { ...current, download: { items } };
    }

    case "download/pause": {
      const items = mapItem(current.download.items, intent.id, (i) =>
        i.state === "active" ? { ...i, state: "paused" as const, speed: 0 } : i,
      );
      return items === current.download.items ? current : { ...current, download: { items } };
    }

    case "download/resume": {
      const items = mapItem(current.download.items, intent.id, (i) =>
        i.state === "paused" || i.state === "error" ? { ...i, state: "queued" as const } : i,
      );
      return items === current.download.items ? current : { ...current, download: { items } };
    }

    case "download/progress": {
      // 值相同直接短路：进度 flush 每 500ms 一笔，没有变化就不该惊动任何订阅者
      const cur = current.download.items.find((i) => i.id === intent.id);
      if (!cur || cur.state !== "active") return current;
      if (cur.received === intent.received && cur.total === intent.total && cur.speed === intent.speed) {
        return current;
      }
      const items = mapItem(current.download.items, intent.id, (i) =>
        i.state === "active"
          ? {
              ...i,
              received: intent.received,
              total: intent.total,
              speed: Math.max(0, intent.speed),
            }
          : i,
      );
      return items === current.download.items ? current : { ...current, download: { items } };
    }

    case "download/done": {
      const items = mapItem(current.download.items, intent.id, (i) =>
        i.state === "active"
          ? { ...i, state: "done" as const, received: i.total > 0 ? i.total : i.received, speed: 0 }
          : i,
      );
      return items === current.download.items ? current : { ...current, download: { items } };
    }

    case "download/fail": {
      const items = mapItem(current.download.items, intent.id, (i) =>
        i.state === "active" || i.state === "queued"
          ? {
              ...i,
              state: (intent.requeue ? "queued" : "error") as typeof i.state,
              tries: i.tries + 1,
              speed: 0,
              error: intent.error,
            }
          : i,
      );
      return items === current.download.items ? current : { ...current, download: { items } };
    }

    case "download/remove": {
      const items = current.download.items.filter((i) => i.id !== intent.id);
      return items.length === current.download.items.length
        ? current
        : { ...current, download: { items } };
    }

    case "download/restore": {
      const same =
        current.download.items.length === intent.items.length &&
        current.download.items.every((i, idx) => {
          const r = intent.items[idx];
          return r && i.id === r.id && i.state === r.state && i.received === r.received;
        });
      if (same) return current;
      return { ...current, download: { items: intent.items } };
    }

    default:
      return current;
  }
}

/** 对指定 id 的条目做一次映射；没找到返回原数组（引用不变 = 不通知）。 */
function mapItem(
  items: DownloadItem[],
  id: string,
  fn: (i: DownloadItem) => DownloadItem,
): DownloadItem[] {
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return items;
  const next = [...items];
  next[idx] = fn(items[idx]);
  return next;
}

export function dispatch(intent: Intent): void {
  const next = reduce(state, intent);
  if (next === state) return;
  state = next;
  for (const fn of listeners) fn();
}
