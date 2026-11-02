import type { AppState } from "../../contracts/index.js";
import type { MediaPort, StoragePort } from "../../contracts/ports.js";
import { AudioEngine } from "../capability/audio/engine.js";
import { clock } from "../kernel/clock.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { createPersister } from "../kernel/persist.js";

interface Api {
  ping(): string;
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<void>;
  pickFiles(): Promise<string[]>;
  grant(filePath: string): Promise<string | null>;
}

declare global {
  interface Window {
    api: Api;
  }
}

export interface Services {
  engine: AudioEngine;
  pick(): Promise<string[]>;
  positionMs(): number;
}

/**
 * 装配层：把 preload 的桥适配成端口，把 store 的变化落到引擎上。
 *
 * 这是全应用**唯一**同时认识 store 与 engine 的地方。
 * 方向是单向的：store 是真相，引擎是执行器；反过来不许（50 §8）。
 */
export async function bootstrap(): Promise<Services> {
  const api = window.api;

  const storage: StoragePort = {
    load: () => api.loadState(),
    save: (json) => api.saveState(json),
  };

  const media: MediaPort = {
    pickFiles: () => api.pickFiles(),
    grant: (filePath) => api.grant(filePath),
    urlOf: (id) => `appmedia://${id}`,
  };

  const engine = new AudioEngine(media);
  const persister = createPersister(storage);

  engine.on({
    onReady: () => dispatch({ type: "player/ready" }),
    onEnded: () => dispatch({ type: "player/ended" }),
    onError: (code) => dispatch({ type: "player/error", code }),
  });

  const persistNow = (): void => {
    persister.schedule(getState, () => clock.t(performance.now()));
  };

  let prev = getState();
  subscribe(() => {
    const next = getState();
    reconcile(prev, next, engine);
    prev = next;
    persistNow();
  });

  const snapshot = await persister.restore();
  if (snapshot) {
    dispatch({ type: "queue/restore", state: snapshot.queue });
    dispatch({ type: "player/setVolume", volume: snapshot.volume });
    if (snapshot.trackId) {
      dispatch({ type: "player/cue", trackId: snapshot.trackId, positionMs: snapshot.positionMs });
    }
  }

  window.addEventListener("beforeunload", () => {
    void persister.flush(getState, () => clock.t(performance.now()));
  });

  return {
    engine,
    pick: () => media.pickFiles(),
    positionMs: () => clock.t(performance.now()),
  };
}

/** store → engine 的单向同步。任何"引擎反过来改 store"都是 bug。 */
function reconcile(prev: AppState, next: AppState, engine: AudioEngine): void {
  const p = prev.player;
  const n = next.player;
  const now = performance.now();

  if (n.trackId && n.trackId !== p.trackId) {
    if (n.volume !== p.volume) engine.setVolume(n.volume);
    void engine.load(n.trackId).then((changed) => {
      if (!changed) return;
      if (n.positionMs > 0) engine.seek(n.positionMs);
      if (getState().player.status === "playing") {
        clock.start(n.positionMs, performance.now());
        void engine.play();
      }
    });
    // 无论处于 loading 还是 playing，时钟锚点都要立刻跟上 ——
    // 否则恢复上次位置后进度条会从 0 开始，与音频真实位置对不上（I1）。
    clock.seek(n.positionMs, now);
    return;
  }

  if (n.status !== p.status) {
    if (n.status === "playing") {
      clock.start(n.positionMs, now);
      void engine.play();
    } else if (n.status === "paused" || n.status === "ended" || n.status === "idle") {
      clock.stop(now);
      engine.pause();
    }
  }

  if (n.positionMs !== p.positionMs) {
    engine.seek(n.positionMs);
    clock.seek(n.positionMs, now);
  }

  if (n.volume !== p.volume) engine.setVolume(n.volume);
}
