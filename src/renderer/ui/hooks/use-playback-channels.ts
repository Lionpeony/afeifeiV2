import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

import { dispatch, getState } from "../../kernel/index.js";
import type { Services } from "../services.js";
import { SEEK_STEP_MS } from "../input/keymap.js";
import { browserNetEnv, createNetStatus } from "../net-status.js";
import { commandIdFor } from "../input/media.js";
import { runCommand } from "../input/commands.js";
import { createShortcuts, type ShortcutStatus, type ShortcutsController } from "../shortcuts.js";
import type { ShortcutBinding } from "../../domain/shortcuts/index.js";

/**
 * 主进程↔渲染层的播放通道：媒体键 / 托盘命令、离线态、可配置全局快捷键、托盘文案。
 * 共同点：动作语义都走命令注册表（commandIdFor → runCommand），播放语义只有一份；
 * 语义之外的动作（seek 步进、音量步进）在这里就地实现。
 *
 * 返回 `shortcutsRef`（设置页改绑定用控制器实例）和 `seekByDelta`（键盘 `←/→` 共用）。
 */
export function usePlaybackChannels(input: {
  services: RefObject<Services | null>;
  baseName: (p: string | null) => string;
  playing: boolean;
  trackId: string | null;
  trackTitle: string | null;
  setOffline: (v: boolean) => void;
  setShortcutStatus: Dispatch<SetStateAction<ShortcutStatus[]>>;
  setShortcutBindings: Dispatch<SetStateAction<ShortcutBinding[]>>;
}): {
  shortcutsRef: RefObject<ShortcutsController | null>;
  seekByDelta: (deltaMs: number) => void;
} {
  const { services, baseName, playing, trackId, trackTitle, setOffline, setShortcutStatus, setShortcutBindings } =
    input;

  /* ---- 媒体键 / 托盘命令（A-24）：走命令注册表，不另写一套播放语义 ---- */
  useEffect(() => {
    window.api.onPlaybackCommand((cmd) => {
      const id = commandIdFor(cmd);
      if (id) runCommand(id);
    });
  }, []);

  /* 离线态（P0-25）：事件驱动 + 300ms 去抖（切换 Wi-Fi 会瞬断瞬连，别闪屏） */
  useEffect(() => {
    const net = createNetStatus(browserNetEnv());
    const off = net.subscribe((s) => setOffline(s === "offline"));
    const stop = net.start();
    return () => {
      off();
      stop();
    };
  }, []);

  /**
   * seek（窗口内 `←/→` 与全局 `Ctrl+Alt+←/→` 共用一份）：两端都夹住整曲范围。
   * 两处各写一份的话，"往前到底"和"往后越界"迟早会不一致。
   */
  const seekByDelta = (deltaMs: number): void => {
    const svc = services.current;
    if (!svc) return;
    const dur = svc.engine.durationMs();
    const target = svc.positionMs() + deltaMs;
    const next = Math.max(0, dur > 0 ? Math.min(dur, target) : target);
    dispatch({ type: "player/seek", positionMs: next });
  };

  const shortcutsRef = useRef<ShortcutsController | null>(null);
  useEffect(() => {
    const ctrl = createShortcuts(
      {
        readStore: (key) => window.api.readStore(key),
        writeStore: (key, json) => window.api.writeStore(key, json),
        setGlobalShortcuts: (bindings) => window.api.setGlobalShortcuts(bindings),
        onGlobalShortcut: (cb) => window.api.onGlobalShortcut(cb),
        onGlobalShortcutStatus: (cb) => window.api.onGlobalShortcutStatus(cb),
      },
      (action) => {
        // 能落到命令注册表的都走命令（播放语义只有一份）
        const id = commandIdFor(action);
        if (id) {
          runCommand(id);
          return;
        }
        if (action === "seek-forward") {
          seekByDelta(SEEK_STEP_MS);
          return;
        }
        if (action === "seek-back") {
          seekByDelta(-SEEK_STEP_MS);
          return;
        }
        if (action === "volume-up" || action === "volume-down") {
          const cur = getState().player;
          const delta = action === "volume-up" ? 0.05 : -0.05;
          dispatch({ type: "player/setVolume", volume: cur.volume + delta });
        }
      },
    );
    shortcutsRef.current = ctrl;
    const off = ctrl.onStatus(setShortcutStatus);
    void ctrl.init().then((b) => setShortcutBindings(b));
    return () => {
      off();
      shortcutsRef.current = null;
    };
  }, []);

  /**
   * 托盘（A-25）：把「在播什么 + 是否在播」推给主进程。
   * 用最后发送值去重 —— 音量/进度每次变化都会触发订阅，但托盘只关心这两项。
   */
  const traySent = useRef("");
  useEffect(() => {
    const title = trackId ? (trackTitle ?? baseName(trackId)) : null;
    const key = `${playing ? "1" : "0"}|${title ?? ""}`;
    if (key === traySent.current) return;
    traySent.current = key;
    window.api.pushTrayState({ playing, title });
  }, [playing, trackId, trackTitle]);

  return { shortcutsRef, seekByDelta };
}
