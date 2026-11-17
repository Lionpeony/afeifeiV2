import type { ErrorCode, RemoteTrackMeta } from "../../contracts/index.js";
import { dispatch, getState, remoteTrackId, subscribe } from "../kernel/index.js";
import { trackById } from "../domain/library/state.js";
import { isLiked, subscribe as subscribeLikes } from "../domain/likes/index.js";
import { isAccountLiked, subscribe as subscribeAccountLikes } from "../domain/account-likes/index.js";
import { onTick } from "./compositor.js";
import { desktopLyricState } from "./desktop-lyric-state.js";
import { lyricState, subscribeLyric } from "./lyric-source.js";
import type { Services } from "./services.js";

/**
 * 主窗 → 迷你窗的桥（M5 / P0-27）。
 *
 * 方向单向：主窗 store 变化 + 每帧节流 500ms 的位置 → 推投影；迷你窗的按钮
 * 以 action 字符串回来，在这里 dispatch —— **写者仍然只有 store 一个**。
 * 主进程不存状态，转手即弃。
 *
 * 封面只在**变了**的时候带上：一张 160px dataURL 二十来 KB，每 500ms 发一次
 * 就是白白占一条 IPC。迷你窗收到没带 cover 的包时沿用上一张。
 */
export function startMiniBridge(services: Services, opts: { onLike?: () => void } = {}): void {
  const api = window.api;
  let lastT = 0;
  let lastDur = 0;
  let lastPush = 0;
  let doc = lyricState().doc;
  let cover: string | null = null;
  let coverToken = ""; // 正在取哪一首的封面
  let sentCover: string | null | undefined; // undefined = 还没发过
  let lastLyricKey = "";

  subscribeLyric(() => {
    doc = lyricState().doc;
    // 取词完成 / 切歌清行：歌词文本变了要立刻推，不等 500ms 节流
    lastLyricKey = "";
    push();
  });

  /** 封面三路（P0-27 修「QQ 歌没图」）：队列元数据 → player.remote → 本地曲库。
   *  在线封面是 https 外链，不要经过 services.cover（那是给本地文件读盘的），
   *  直接返回地址让 <img> 自己去取；本地才走异步缓存，晚到一拍补推一次。 */
  const resolveCover = (): string | null => {
    const s = getState();
    const id = s.player.trackId;
    if (!id) return null;
    const meta = id ? s.queue.remote[id] : undefined;
    if (meta?.coverUrl) return meta.coverUrl;
    if (s.player.remote?.coverUrl) return s.player.remote.coverUrl;
    if (/^https?:\/\//i.test(id)) return cover; // 在线且元数据没带封面：保持现状
    if (coverToken !== id) {
      coverToken = id;
      cover = null;
      void services
        .cover(id, id)
        .then((url) => {
          cover = url;
          push(); // 图晚到一拍：主动补一次
        })
        .catch(() => undefined);
    }
    return cover;
  };

  const push = (): void => {
    const s = getState();
    const id = s.player.trackId;
    const fallback = id ? (id.split(/[\\/]/).pop() ?? "") : "";
    const meta = id ? s.queue.remote[id] : undefined;
    const local = id && !meta ? trackById(id) : undefined;
    const line = desktopLyricState(doc, lastT);
    const nextCover = resolveCover();
    /* 红心与底栏同一套分流：在线看账号红心（songId），本机看本机红心（trackId）。
       迷你窗只是第二个视图，状态仍只有一个写者。 */
    const remote = s.player.remote;
    const liked = remote ? isAccountLiked(remote.songId) : id ? isLiked(id) : false;
    const payload: Record<string, unknown> = {
      status: s.player.status,
      title: meta?.title ?? local?.title ?? s.player.trackTitle ?? (fallback || "未在播放"),
      artist: meta?.artist ?? local?.artist ?? "",
      source: meta ? (s.player.remote?.sourceId ?? "") : "",
      /* SETLIST：队内序号 + 队列长度，和播放页同一个来源 */
      index: s.queue.cursor + 1,
      count: s.queue.items.length,
      liked,
      t: Math.round(lastT),
      dur: Math.round(lastDur),
      lyric: line.text,
      tr: line.translation,
      /* 逐字进度：和桌面歌词共用 desktopLyricState 的同一份 lit */
      lit: line.lit,
      /* 迷你窗是独立 renderer，读不到主窗的 data-theme / data-motion（2026-11-10 修 BUG：
         此前夜间主题下小窗仍是米白）。跟着主窗 document 的当前值走。 */
      theme: document.documentElement.dataset.theme ?? "light",
      motion: document.documentElement.dataset.motion ?? "full",
    };
    if (nextCover !== sentCover) {
      payload.cover = nextCover; // 显式 null 也要发：换到没封面的歌要把上一张清掉
      sentCover = nextCover;
    }
    api.pushMiniState(JSON.stringify(payload));
  };

  subscribe(push);
  /* 红心不属于 store：本机红心与账号红心各有自己的域，跟着它们各推一次 */
  subscribeLikes(push);
  subscribeAccountLikes(push);

  // 主题切换不 dispatch 到 store，是直接改 document 属性 —— 用 MutationObserver 补一只眼
  new MutationObserver(push).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-motion"],
  });

  // 迷你窗就绪 → 立刻补推（暂停下开窗不再挂"未在播放"，2026-11-10）
  api.onMiniHello(push);

  /* 位置与歌词不能只靠主窗的帧循环（P0-27 修「最小化后歌词冻住」）：
     主窗最小化 = rAF 停了，音频照播，小窗就定在上一句。
     订阅 engine 的 timeupdate（约 4Hz，最小化也走）；行一变立刻推，进度 500ms 节流。 */
  const beat = (ms: number): void => {
    const s = getState();
    // 暂停/没歌：不需要推送，store 变化的那次 push 足够
    if (s.player.status !== "playing") return;
    lastT = ms;
    lastDur = services.engine.durationMs();
    const line = desktopLyricState(doc, lastT);
    const key = `${line.text}\u0000${line.translation}\u0000${line.lit}`;
    if (key !== lastLyricKey) {
      lastLyricKey = key;
      push();
      return;
    }
    const now = performance.now();
    if (now - lastPush >= 500) {
      lastPush = now;
      push();
    }
  };
  services.engine.onTime(beat);

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
    // 拖进度条走字符串通道（"seek:12345"）：不加新频道，主进程照样只搬运
    if (action.startsWith("seek:")) {
      const ms = Number(action.slice(5));
      if (Number.isFinite(ms)) dispatch({ type: "player/seek", positionMs: Math.max(0, ms) });
      return;
    }
    if (action === "toggle") dispatch({ type: "player/toggle" });
    else if (action === "next") dispatch({ type: "queue/next" });
    else if (action === "prev") dispatch({ type: "queue/prev", atPositionMs: services.positionMs() });
    else if (action === "like") opts.onLike?.();
    // focus：双击封面回主窗。窗口归主进程管，主进程自己处理，不往这儿转
  });

  // afeifei:// 冷/热启动都汇到这里。无 source = 本地曲库 id；带 source = 在线曲目
  const handleScheme = (intent: {
    action: string;
    id: string;
    source?: string;
    list?: string[];
  }): void => {
    if (intent.action !== "play") return;
    if (intent.source) {
      // 在线分支（M6.1 收尾）：先验证拿得到地址（失败 → 未登录/无版权，打进播放条），
      // 队列里落**逻辑 id** 而不是直链 —— 直链会过期，重启与「下一首」都得重新解析
      const sourceId = intent.source;
      void (async () => {
        try {
          // 只验证点的那一首：整列里个别拿不到地址不该让唤起失败
          await services.resolveOnlineUrl(sourceId, intent.id, "320k");
          // list = 调用方给的整列（`afeifei://play?id=x&source=s&list=x,y,z` → 唤起即连播）；
          // 不传就只有点的那一首，行为与以前一致
          const ids = intent.list && intent.list.length > 0 ? intent.list : [intent.id];
          const items = ids.map((songId) => remoteTrackId(sourceId, songId));
          const remote: Record<string, RemoteTrackMeta> = {};
          for (const songId of ids) {
            // scheme 只带 id，拿不到标题/封面（QQ 源无详情接口）——遗留，接上详情接口后补
            remote[remoteTrackId(sourceId, songId)] = { sourceId, songId, title: "在线曲目", artist: sourceId };
          }
          const at = items.indexOf(remoteTrackId(sourceId, intent.id));
          dispatch({ type: "queue/set", items, startAt: at >= 0 ? at : 0, remote });
          dispatch({ type: "player/play" });
        } catch (err) {
          const code = (err as { code?: ErrorCode }).code;
          if (code) dispatch({ type: "player/error", code });
          else console.warn(`[scheme] 在线播放失败（source=${sourceId} id=${intent.id}）`);
        }
      })();
      return;
    }
    // queue/set 只落 loading —— 协议唤起同样要补一脚 play 才会出声
    dispatch({ type: "queue/set", items: [intent.id], startAt: 0 });
    dispatch({ type: "player/play" });
  };
  api.onSchemeUrl(handleScheme);
  // 冷启动兜底：主进程 send 可能早于这里的订阅，就绪后主动拉一次 pending
  void api.schemePoll().then((p) => {
    if (p) handleScheme(p);
  });
}
