import { useEffect, useRef, useState, type RefObject } from "react";

import type { AppState } from "../../../contracts/index.js";
import { dispatch } from "../../kernel/index.js";
import { trackById } from "../../domain/library/state.js";
import type { Services } from "../services.js";
import { onFrame } from "../compositor.js";
import { createMediaSession, type MediaSessionController } from "../media-session.js";

/** 在线曲目的元信息（与 contracts 里 `player.remote` 同形）。 */
export type PlayerRemote = { sourceId: string; songId: string; coverUrl?: string } | null;

/**
 * 系统媒体会话（Windows SMTC / 系统媒体面板 + 媒体键）：抄 lx-music-desktop 的
 * useMediaSessionInfo.ts（结构语义 1:1，含静音保活与 9 个 action handler）。
 * 位置每秒同步一次；曲目 / 播放态 / 封面变化立刻同步。
 *
 * console 封面的解析（本地走文件封面、在线走音源给的封面地址）也在这里：
 * 两者共享 `npCover` 这份状态，拆在两处迟早不同步。返回值直接喂给 console JSX。
 */
export function useMediaSession(input: {
  /** 最新状态镜像：媒体会话的 handler 闭包里要读当前值，不能吃渲染那一刻的旧快照 */
  stateRef: RefObject<AppState>;
  services: RefObject<Services | null>;
  baseName: (p: string | null) => string;
  trackId: string | null;
  trackTitle: string | null;
  status: string;
  remote: PlayerRemote;
}): string | null {
  const { stateRef, services, baseName, trackId, trackTitle, status, remote } = input;
  const [npCover, setNpCover] = useState<string | null>(null);
  const npCoverRef = useRef<string | null>(null);
  npCoverRef.current = npCover;
  const mediaSessionRef = useRef<MediaSessionController | null>(null);

  /* console 的 56px 封面：本地曲目走文件封面，在线曲目用音源给的封面地址。 */
  useEffect(() => {
    let alive = true;
    const svc = services.current;
    if (!svc || !trackId) {
      setNpCover(null);
      return;
    }
    void svc
      .cover(trackId, remote?.coverUrl ?? trackId)
      .then((url) => {
        if (alive) setNpCover(url);
      })
      .catch(() => {
        if (alive) setNpCover(null);
      });
    return () => {
      alive = false;
    };
  }, [trackId, remote?.coverUrl]);

  useEffect(() => {
    const ctrl = createMediaSession({
      read: () => {
        const st = stateRef.current;
        const id = st.player.trackId;
        if (!id) return null;
        const track = trackById(id);
        return {
          title: st.player.trackTitle ?? baseName(id),
          artist: track?.artist ?? "",
          album: track?.album ?? "",
          artwork: st.player.remote?.coverUrl ?? npCoverRef.current,
          playbackState: st.player.status === "playing" ? "playing" : "paused",
          positionMs: services.current?.positionMs() ?? 0,
          durationMs: services.current?.engine.durationMs() ?? 0,
        };
      },
      toggle: () => dispatch({ type: "player/toggle" }),
      next: () => dispatch({ type: "queue/next" }),
      prev: () => dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 }),
      seek: (positionMs) => dispatch({ type: "player/seek", positionMs }),
      seekBy: (deltaMs) =>
        dispatch({
          type: "player/seek",
          positionMs: Math.max(0, (services.current?.positionMs() ?? 0) + deltaMs),
        }),
    });
    mediaSessionRef.current = ctrl;
    // 上报能力：主进程据此决定媒体键归 Chromium 的 MediaSession（Windows SMTC）还是 globalShortcut 兜底
    window.api.setMediaSessionSupported(ctrl.supported);
    return () => {
      ctrl.dispose();
      mediaSessionRef.current = null;
    };
  }, []);

  /* 曲目 / 播放态 / 封面变化 → 立刻同步系统媒体会话 */
  useEffect(() => {
    mediaSessionRef.current?.update();
  }, [trackId, trackTitle, status, npCover, remote?.coverUrl]);

  /* 位置推进：每 500ms 同步一次 positionState（系统面板的进度条）。不跟帧走 —— 那是白烧。 */
  useEffect(() => {
    let last = 0;
    return onFrame((now) => {
      if (now - last < 500) return;
      last = now;
      mediaSessionRef.current?.update();
    });
  }, []);

  return npCover;
}
