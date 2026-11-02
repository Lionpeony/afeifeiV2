import { dispatch, getState, subscribe } from "../kernel/index.js";
import { onTick } from "./compositor.js";
import type { Services } from "./bootstrap.js";

/**
 * 主窗 → 迷你窗的桥（M5）。
 *
 * 方向单向：主窗 store 变化 + 每帧节流 500ms 的位置 → 推投影；迷你窗的按钮
 * 以 action 字符串回来，在这里 dispatch —— **写者仍然只有 store 一个**。
 * 主进程不存状态，转手即弃。
 */
export function startMiniBridge(services: Services): void {
  const api = window.api;
  let lastT = 0;
  let lastDur = 0;
  let lastPush = 0;

  const push = (): void => {
    const s = getState();
    const fallback = s.player.trackId ? (s.player.trackId.split(/[\\/]/).pop() ?? "") : "";
    api.pushMiniState(
      JSON.stringify({
        status: s.player.status,
        title: s.player.trackTitle ?? fallback ?? "未在播放",
        t: Math.round(lastT),
        dur: Math.round(lastDur),
      }),
    );
  };

  subscribe(push);

  onTick((t) => {
    lastT = t;
    lastDur = services.engine.durationMs();
    const now = performance.now();
    if (now - lastPush >= 500) {
      lastPush = now;
      push();
    }
  });

  api.onMiniAction((action) => {
    if (action === "toggle") dispatch({ type: "player/toggle" });
    else if (action === "next") dispatch({ type: "queue/next" });
    else if (action === "prev") dispatch({ type: "queue/prev", atPositionMs: services.positionMs() });
  });
}
