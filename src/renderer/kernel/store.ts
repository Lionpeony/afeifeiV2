import type { AppState, Intent } from "../../contracts/index.js";
import { clampCursor, orderOf, prevAction, pushHistory, stepBackward, stepForward } from "./queue.js";

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
    error: null,
    remote: null,
  },
  queue: { items: [], cursor: -1, context: [], history: [], mode: "order", shuffleSeed: 1 },
  audio: { preampDb: 0, eq: [0, 0, 0, 0, 0, 0] },
  stage: {
    preset: "paper",
    intensity: 1,
    layers: { wallpaper: true, visual: true, cover: true, lyric: true, controls: true },
    lyricRenderer: "press",
  },
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

/** 切到队列里的某一格：回到 loading，剩下交给引擎。 */
function switchTo(current: AppState, cursor: number): AppState {
  const { queue, player } = current;
  if (cursor < 0) {
    return {
      player: {
        ...player,
        status: "ended",
        trackId: null,
        trackTitle: null,
        positionMs: 0,
        remote: null,
      },
      queue: { ...queue, cursor: -1 },
      audio: current.audio,
      stage: current.stage,
    };
  }
  const trackId = queue.items[cursor];
  return {
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
    audio: current.audio,
      stage: current.stage,
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
        audio: current.audio,
      stage: current.stage,
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

    case "queue/set": {
      const items = intent.items;
      if (items.length === 0) {
        return {
          player: {
            ...player,
            status: "idle",
            trackId: null,
            trackTitle: null,
            positionMs: 0,
            remote: null,
          },
          queue: { ...queue, items: [], cursor: -1, context: intent.context ?? [], history: [] },
          audio: current.audio,
      stage: current.stage,
        };
      }
      const cursor = clampCursor(items, intent.startAt ?? 0);
      const staged: AppState = {
        player,
        queue: { ...queue, items, cursor, context: intent.context ?? items, history: [] },
        audio: current.audio,
      stage: current.stage,
      };
      return switchTo(staged, cursor);
    }

    case "queue/next": {
      const order = orderOf(queue.items, queue.mode, queue.shuffleSeed);
      const next = stepForward(order, queue.cursor, queue.mode);
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
      return switchTo(current, stepBackward(order, queue.cursor, queue.mode));
    }

    case "queue/mode": {
      if (queue.mode === intent.mode) return current;
      return { ...current, queue: { ...queue, mode: intent.mode } };
    }

    case "queue/restore": {
      const restored = intent.state;
      return { ...current, queue: { ...restored, cursor: clampCursor(restored.items, restored.cursor) } };
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

    case "audio/restore": {
      const config = intent.config;
      if (
        config.preampDb === current.audio.preampDb &&
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

    case "stage/setLyricRenderer": {
      if (current.stage.lyricRenderer === intent.renderer) return current;
      return { ...current, stage: { ...current.stage, lyricRenderer: intent.renderer } };
    }

    case "stage/restore": {
      const c = intent.config;
      const same =
        c.preset === current.stage.preset &&
        c.intensity === current.stage.intensity &&
        c.lyricRenderer === current.stage.lyricRenderer &&
        (Object.keys(current.stage.layers) as (keyof typeof c.layers)[]).every(
          (k) => c.layers[k] === current.stage.layers[k],
        );
      if (same) return current;
      return { ...current, stage: c };
    }

    default:
      return current;
  }
}

export function dispatch(intent: Intent): void {
  const next = reduce(state, intent);
  if (next === state) return;
  state = next;
  for (const fn of listeners) fn();
}
