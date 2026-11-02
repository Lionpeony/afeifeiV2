import type { AppState } from "../../contracts/index.js";
import type { LibraryPort, MediaPort, RawMeta, StoragePort } from "../../contracts/ports.js";
import { AudioEngine } from "../capability/audio/engine.js";
import { restoreLibrary, scanLibrary, type ScanStats } from "../domain/library/scan.js";
import { clock } from "../kernel/clock.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { createPersister } from "../kernel/persist.js";

interface Api {
  ping(): string;
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<void>;
  pickFiles(): Promise<string[]>;
  grant(filePath: string): Promise<string | null>;
  pickDir(): Promise<string | null>;
  scan(dirs: string[]): Promise<string[]>;
  readTags(filePaths: string[]): Promise<unknown[]>;
  statFiles(filePaths: string[]): Promise<{ path: string; size: number; mtimeMs: number }[]>;
  loadIndex(): Promise<string | null>;
  saveIndex(json: string): Promise<void>;
  readIndexLog(): Promise<string>;
  appendIndexLog(lines: string): Promise<void>;
  clearIndexLog(): Promise<void>;
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
  /** 选目录并扫描。取消返回 null。 */
  scan(onProgress?: (done: number, total: number) => void): Promise<ScanStats | null>;
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

  const library: LibraryPort = {
    pickDir: () => api.pickDir(),
    scan: (dirs) => api.scan(dirs),
    readTags: (paths) => api.readTags(paths) as Promise<RawMeta[]>,
    statFiles: (paths) => api.statFiles(paths),
    loadIndex: () => api.loadIndex(),
    saveIndex: (json) => api.saveIndex(json),
    readLog: () => api.readIndexLog(),
    appendLog: (lines) => api.appendIndexLog(lines),
    clearLog: () => api.clearIndexLog(),
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

  // 曲库恢复走快照 + 日志回放，毫秒级；不在这里扫描目录
  // 打点留在生产代码里：perf 脚本读它，用户也能在 DevTools 里看到这条
  performance.mark("afeifei:restore-start");
  await restoreLibrary(library);
  performance.mark("afeifei:restore-end");
  performance.measure("afeifei:restore", "afeifei:restore-start", "afeifei:restore-end");

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
    async scan(onProgress) {
      const dir = await api.pickDir();
      if (!dir) return null;
      return scanLibrary(library, [dir], onProgress);
    },
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
