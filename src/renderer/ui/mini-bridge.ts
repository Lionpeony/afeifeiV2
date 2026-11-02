import type { ErrorCode } from "../../contracts/index.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { onTick } from "./compositor.js";
import type { Services } from "./services.js";

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

  // afeifei:// 冷/热启动都汇到这里。无 source = 本地曲库 id；带 source = 在线曲目
  const handleScheme = (intent: { action: string; id: string; source?: string }): void => {
    if (intent.action !== "play") return;
    if (intent.source) {
      // 在线分支（M6.1 收尾）：resolveOnlineUrl 拿直链 → player/play，
      // 失败（未登录/无版权）把 humanize 过的错误码打进播放条
      const sourceId = intent.source;
      void (async () => {
        try {
          const url = await services.resolveOnlineUrl(sourceId, intent.id, "320k");
          dispatch({
            type: "player/play",
            trackId: url,
            // scheme 只带 id，拿不到标题/封面元数据（QQ 源无详情接口）——遗留，接上详情接口后补
            trackTitle: `在线曲目 · ${sourceId}`,
            remote: { sourceId, songId: intent.id },
          });
        } catch (err) {
          const code = (err as { code?: ErrorCode }).code;
          if (code) dispatch({ type: "player/error", code });
          else console.warn(`[scheme] 在线播放失败（source=${sourceId} id=${intent.id}）`);
        }
      })();
      return;
    }
    dispatch({ type: "queue/set", items: [intent.id], startAt: 0 });
  };
  api.onSchemeUrl(handleScheme);
  // 冷启动兜底：主进程 send 可能早于这里的订阅，就绪后主动拉一次 pending
  void api.schemePoll().then((p) => {
    if (p) handleScheme(p);
  });
}
