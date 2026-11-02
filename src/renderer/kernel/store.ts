import type { AppState, Intent } from "../../contracts/index.js";

/**
 * 单写者 store（I2）。全应用只有 dispatch 一个写入口，
 * 订阅者只拿到快照，拿不到 setState。
 */

type Listener = () => void;

const initialState: AppState = {
  player: { status: "idle", trackId: null, positionMs: 0, volume: 0.8 },
  queue: { items: [], cursor: -1, context: [], history: [] },
};

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
 * 每个分支都先判断"真的变了没有"，没变就返回同一个对象。
 * 否则重复 dispatch 相同 intent 会白白通知一遍订阅者，React 侧跟着空转一次。
 */
function reduce(current: AppState, intent: Intent): AppState {
  const { player } = current;

  switch (intent.type) {
    case "player/play": {
      if (player.status === "playing" && player.trackId === intent.trackId) return current;
      return { ...current, player: { ...player, status: "playing", trackId: intent.trackId } };
    }
    case "player/pause": {
      if (player.status === "paused") return current;
      return { ...current, player: { ...player, status: "paused" } };
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
