import type { AppState, DownloadItem, Intent, PlaybackConfig } from "../../contracts/index.js";
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
    playbackRate: 1,
    preservesPitch: true,
    error: null,
    buffering: false,
    remote: null,
  },
  queue: {
    items: [],
    cursor: -1,
    context: [],
    history: [],
    /* 默认列表循环：歌单播完自动绕回第一首（2026-11-08 用户定「歌单播放了不应该没了」）。
       老会话快照里存了 order 的照旧恢复——只改新会话默认，不覆盖用户显式选择。 */
    mode: "repeat-all",
    shuffleSeed: 1,
    failed: [],
    remote: {},
    stream: null,
    origin: null,
  },
  // 10 段与 capability/audio/eq.ts 的 EQ_BANDS 对齐；kernel 不 import capability（环约束），
  // 这条一致性由 test/audio.test.mjs 钉住 —— 上次段数从 6 改 10 就是这里漏了
  audio: { preampDb: 0, eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], crossfadeSec: 0, outputId: "" },
  // 默认自动跳过（P0-15，抄 MusicFreeDesktop 的 `playMusic.playError` 默认值）：
  // 播放器卡在坏文件上比"跳过了用户没注意"更糟
  playback: { onError: "skip" },
  lyrics: { offsets: {} },
  stage: {
    preset: "paper",
    // 2026-11-10 播放页第二代：默认落在「封套」，明暗跟随全局主题（toneAuto）
    skin: "sleeve",
    tone: "dark",
    toneAuto: true,
    layers: { lyric: true },
    lyricRenderer: "press",
    // 有译文就并排显示（A-03 判据）；没有译文的曲目这一项不起作用
    translation: true,
    customTokens: null,
  },
  sleep: { endsAt: null, waitEnd: false, pending: false },
  download: { items: [] },
};

/** 音频配置的限幅（±12dB，与 capability 侧 GAIN_LIMIT_DB 同值）。kernel 不 import capability，这里只做数值 clamp。 */
const AUDIO_LIMIT_DB = 12;
const clampAudioDb = (v: number): number =>
  Number.isFinite(v) ? Math.min(AUDIO_LIMIT_DB, Math.max(-AUDIO_LIMIT_DB, v)) : 0;

/**
 * 歌词校准限幅（P0-18）：±10 秒。
 * 超过这个量级的"对不齐"通常不是误差，而是**词根本不是这一首**——该重新匹配（P0-19），
 * 硬调只会把词越推越离谱。
 */
const LYRIC_OFFSET_LIMIT_MS = 10_000;

const clampLyricOffset = (v: number): number =>
  Number.isFinite(v)
    ? Math.max(-LYRIC_OFFSET_LIMIT_MS, Math.min(LYRIC_OFFSET_LIMIT_MS, Math.round(v)))
    : 0;

/** KV 里的校准表 → 合法对象。坏条目逐条丢，不整份作废。 */
export function sanitizeLyricOffsets(raw: string | null): Record<string, number> {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "number") continue;
      const ms = clampLyricOffset(value);
      if (id && ms !== 0) out[id] = ms;
    }
    return out;
  } catch {
    return {};
  }
}

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
/**
 * 切到队列里的第 cursor 格，落什么状态由调用方决定：
 *
 * - `"play"`（默认）用户切歌 / 播完续播 / 删当前曲时原来在播 —— **切了就要响**
 * - `"pause"` 暂停中删当前曲 —— 换了曲目但保持暂停，别自己响
 * - `"load"` `queue/set` 专用：只换队列，播不播由随后的 `player/play` 或
 *   `player/cue`（重启恢复要停在暂停，P0-13）决定
 *
 * 曾经这里一律落 loading，指望引擎的 `onReady` 接上；但 `player/ready`
 * 的语义是"载入完成、停在暂停等用户"，于是每次切歌都变成「已暂停」。
 */
type SwitchMode = "play" | "pause" | "load";

function switchTo(current: AppState, cursor: number, mode: SwitchMode = "play"): AppState {
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
  // 在线曲目在队列表里有元数据（点每日推荐/榜单时整份写入）；本地曲目查不到，
  // 标题交给 UI 从路径取，在线标题与封面在这里恢复
  const meta = queue.remote[trackId];
  return {
    ...current,
    player: {
      ...player,
      status: mode === "play" ? "playing" : mode === "pause" ? "paused" : "loading",
      trackId,
      trackTitle: meta ? `${meta.title} — ${meta.artist}` : null,
      positionMs: 0,
      error: null,
      remote: meta ? { sourceId: meta.sourceId, songId: meta.songId, coverUrl: meta.coverUrl } : null,
    },
    queue: { ...queue, cursor, history: pushHistory(queue.history, trackId) },
  };
}

/**
 * 当前在播的那首在队列里的下标 —— **不要拿 `queue.cursor` 当位置基准**。
 *
 * 在线曲目走 `playRemote` 只发 `player/play`、不进队列（docs/03 遗留项），
 * 此时 `cursor` 是上一次本地播放留下的残值。照着它推进会把"光标在队尾"
 * 误判成"队列到头"，于是点「下一首」直接变"播完了"并把还在放的歌停掉。
 *
 * 返回 -1 表示当前曲不在队列里：`stepForward` / `stepBackward` 见到 -1 会从头开始。
 */
function playingCursor(s: AppState): number {
  if (!s.player.trackId) return s.queue.cursor;
  return s.queue.items.indexOf(s.player.trackId);
}

/**
 * 播放行为配置的入口净化（P0-15）。KV 里可能是旧版/手改的字符串，
 * 只认这两个值，其余一律按默认 `skip`。
 */
export function sanitizePlaybackConfig(raw: string | null): PlaybackConfig {
  try {
    const parsed = raw ? (JSON.parse(raw) as { onError?: unknown }) : null;
    return { onError: parsed?.onError === "pause" ? "pause" : "skip" };
  } catch {
    return { onError: "skip" };
  }
}

function reduce(current: AppState, intent: Intent): AppState {
  const { player, queue } = current;

  switch (intent.type) {
    case "player/play": {
      const trackId = intent.trackId;
      if (!trackId) {
        if (player.status === "playing") return current;
        // 没有当前曲（队列被删空、或从没播过）：队列里还有歌就从第一首起，
        // 队列空就什么都别做 —— 否则界面显示「在播」、引擎没东西可放
        if (!player.trackId) {
          if (queue.items.length === 0) return current;
          return switchTo(current, clampCursor(queue.items, 0), "play");
        }
        return { ...current, player: { ...player, status: "playing", error: null } };
      }
      if (player.trackId === trackId && player.status === "playing") return current;
      const cursor = queue.items.indexOf(trackId);
      const nextQueue =
        cursor >= 0 ? { ...queue, cursor, history: pushHistory(queue.history, trackId) } : queue;
      // 在队列面板里点播在线曲目时 UI 只给 id：音源标识从队列表补，否则封面与歌词会丢
      const meta = queue.remote[trackId];
      return {
        ...current,
        player: {
          ...player,
          status: "playing",
          trackId,
          trackTitle: intent.trackTitle ?? (meta ? `${meta.title} — ${meta.artist}` : null),
          positionMs: 0,
          error: null,
          remote: intent.remote ?? (meta ? { sourceId: meta.sourceId, songId: meta.songId, coverUrl: meta.coverUrl } : null),
        },
        queue: nextQueue,
      };
    }

    case "player/pause": {
      // loading 也要接：切歌瞬间按暂停，不能等元数据到了自己响起来
      if (player.status !== "playing" && player.status !== "loading") return current;
      return { ...current, player: { ...player, status: "paused" } };
    }

    case "player/toggle": {
      if (player.status === "playing" || player.status === "loading") {
        return { ...current, player: { ...player, status: "paused" } };
      }
      if (player.status === "paused" || player.status === "ended") {
        if (!player.trackId) {
          if (queue.items.length === 0) return current;
          return switchTo(current, clampCursor(queue.items, 0), "play");
        }
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

    case "player/setPlaybackRate": {
      // 限幅 0.5–2（抄 lx-music-desktop 的 usePlaybackRate.ts）
      const rate = Math.min(2, Math.max(0.5, intent.rate));
      if (player.playbackRate === rate) return current;
      return { ...current, player: { ...player, playbackRate: rate } };
    }

    case "player/setPreservesPitch": {
      if (player.preservesPitch === intent.on) return current;
      return { ...current, player: { ...player, preservesPitch: intent.on } };
    }

    case "player/ended": {
      // 睡眠定时到点了、且勾了「播完再停」（P0-24）：就停在这儿，不切下一首、不循环
      if (current.sleep.pending) {
        return {
          ...current,
          sleep: { ...current.sleep, pending: false },
          player: { ...player, status: "paused", positionMs: 0 },
        };
      }
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
      return { ...current, player: { ...player, status: "error", error: intent.code, buffering: false } };
    }

    case "player/buffering": {
      // 只有"正在播"才有缓冲可言：暂停/加载态收到迟到的 waiting 不算
      if (player.status !== "playing" && intent.on) return current;
      if (player.buffering === intent.on) return current;
      return { ...current, player: { ...player, buffering: intent.on } };
    }

    case "player/cue": {
      // 快照可能缺标题（老存档）：在线曲目从队列表兜底，别让顶栏空着
      const cueMeta = intent.trackId ? queue.remote[intent.trackId] : undefined;
      return {
        ...current,
        player: {
          ...player,
          status: "loading",
          trackId: intent.trackId,
          // 标题与在线标识一起落，别留着上一首的（P0-13：恢复后顶栏要显示歌名而不是直链）
          trackTitle: intent.trackTitle ?? (cueMeta ? `${cueMeta.title} — ${cueMeta.artist}` : null),
          remote:
            intent.remote ??
            (cueMeta ? { sourceId: cueMeta.sourceId, songId: cueMeta.songId, coverUrl: cueMeta.coverUrl } : null),
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
          // 换了一整条队列：上一批的失败标记、在线元数据、流式标记一起作废
          queue: {
            ...queue,
            items: [],
            cursor: -1,
            context: intent.context ?? [],
            history: [],
            failed: [],
            remote: {},
            stream: null,
            origin: null,
          },
        };
      }
      const cursor = clampCursor(items, intent.startAt ?? 0);
      const staged: AppState = {
        ...current,
        player,
        queue: {
          ...queue,
          items,
          cursor,
          context: intent.context ?? items,
          history: [],
          failed: [],
          remote: intent.remote ?? {},
          stream: intent.stream ?? null,
          origin: intent.origin ?? null,
        },
      };
      // "load"：只换队列。点列表播的那条随后会 player/play；重启恢复走 player/cue 停在暂停态
      return switchTo(staged, cursor, "load");
    }

    case "player/joinLive": {
      const items = intent.items;
      if (items.length === 0) return current;
      const cursor = clampCursor(items, intent.startAt ?? 0);
      const trackId = items[cursor];
      const positionMs = Number.isFinite(intent.positionMs) ? Math.max(0, intent.positionMs) : 0;
      // 不走 switchTo：后者把状态压回 loading/0，异步 load 完成后偏移就没了。
      // 这里直接进入 playing + 偏移，reconcile 的换歌分支会在 load 后带着它起播。
      return {
        ...current,
        player: {
          ...player,
          status: "playing",
          trackId,
          trackTitle: intent.trackTitle ?? null,
          positionMs,
          error: null,
          remote: null,
        },
        queue: {
          ...queue,
          items,
          cursor,
          context: intent.context ?? items,
          history: pushHistory([], trackId),
          failed: [],
        },
      };
    }

    case "queue/trim": {
      // 只裁"当前曲之前"的部分：光标跟着正在播的那首一起前移，播放不受影响。
      // shuffle 下被删的可能还没轮到——FM 是流，少了某一首不影响它继续推。
      const keep = Math.max(0, Math.floor(intent.keepBefore));
      const drop = queue.cursor - keep;
      if (drop <= 0) return current; // 还没攒够，不产生新状态（也不通知）
      const items = queue.items.slice(drop);
      // 元数据与失败标记跟着 items 走，别留孤儿键
      const kept = new Set(items);
      const remote: typeof queue.remote = {};
      for (const id of items) {
        const meta = queue.remote[id];
        if (meta) remote[id] = meta;
      }
      return {
        ...current,
        queue: {
          ...queue,
          items,
          cursor: queue.cursor - drop,
          remote,
          failed: queue.failed.filter((id) => kept.has(id)),
        },
      };
    }

    case "queue/add": {
      // 追加到队尾：不打断当前播放，光标不动（唱完这几首才会轮到）
      const add = intent.items.filter((id) => typeof id === "string" && id.length > 0);
      if (add.length === 0) return current;
      const items = [...queue.items, ...add];
      // FM 续批追加的是在线曲目：元数据一起并进表里，否则新的一批会显示成逻辑 id
      const remote = intent.remote ? { ...queue.remote, ...intent.remote } : queue.remote;
      return { ...current, queue: { ...queue, items, remote } };
    }

    case "queue/next": {
      const order = orderOf(queue.items, queue.mode, queue.shuffleSeed);
      // byUser=true：用户主动点「下一首」，单曲循环也照常切（自然结束那条路走 player/ended）
      const next = stepForward(order, playingCursor(current), queue.mode, true);
      // 当前曲不在队列（在线单曲）且队列里没有可切的：保持播放。
      // 把它标成"播完了"并暂停是谎报——歌还在放，用户只是点了下一首
      if (next < 0 && player.trackId && !queue.items.includes(player.trackId)) return current;
      // 用户自己点了下一首：睡眠定时的"等这首播完"到此为止，别在他换的歌上突然停
      const base: AppState = current.sleep.pending
        ? { ...current, sleep: { ...current.sleep, pending: false } }
        : current;
      return next < 0
        ? { ...base, player: { ...base.player, status: "ended", positionMs: 0 } }
        : switchTo(base, next);
    }

    case "queue/prev": {
      const at = intent.atPositionMs ?? player.positionMs;
      if (prevAction(at) === "restart") {
        if (player.positionMs === 0) return current;
        return { ...current, player: { ...player, positionMs: 0 } };
      }
      const order = orderOf(queue.items, queue.mode, queue.shuffleSeed);
      const prev = stepBackward(order, playingCursor(current), queue.mode, true);
      // 同 queue/next：在线单曲没有队列位置时，别把正在播的歌清掉
      if (prev < 0 && player.trackId && !queue.items.includes(player.trackId)) return current;
      return switchTo(current, prev);
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
      const removed = queue.items[at];
      const items = [...queue.items];
      items.splice(at, 1);
      // 删掉的歌不该还留着"播放失败"标记（P0-16），否则同一 id 重新入队就带着旧标记
      const failed = queue.failed.filter((id) => id !== removed);
      // 在线元数据同理：删了就该丢，别留在表里发霉
      const remote = { ...queue.remote };
      delete remote[removed];

      // 删的是当前之后的：光标不动，后面整体前移一格
      if (at > queue.cursor) return { ...current, queue: { ...queue, items, failed, remote } };
      // 删的是当前之前的：光标记的"第几格"要减一，否则会指向下一首
      if (at < queue.cursor) return { ...current, queue: { ...queue, items, failed, remote, cursor: queue.cursor - 1 } };

      // 删的就是正在播这首：接到同位置的下一条；删空了就结束（不假装还有歌）。
      // 状态跟着原来的走：在放就接着放，暂停中就保持暂停，别因为删一首歌自己响起来
      const nextCursor = at < items.length ? at : -1;
      return switchTo(
        { ...current, queue: { ...queue, items, failed, remote, cursor: nextCursor } },
        nextCursor,
        player.status === "playing" ? "play" : "pause",
      );
    }

    case "queue/clear": {
      // 空队列态是五个状态之一：真实置空，别留个"ended + 有光标"的假空
      return {
        ...current,
        player: {
          ...player,
          status: "idle",
          trackId: null,
          trackTitle: null,
          positionMs: 0,
          error: null,
          remote: null,
        },
        queue: {
          ...queue,
          items: [],
          cursor: -1,
          context: [],
          history: [],
          failed: [],
          remote: {},
          stream: null,
          origin: null,
        },
      };
    }

    case "queue/fail": {
      const has = queue.failed.includes(intent.trackId);
      if (intent.failed === has) return current;
      const failed = intent.failed
        ? [...queue.failed, intent.trackId]
        : queue.failed.filter((id) => id !== intent.trackId);
      return { ...current, queue: { ...queue, failed } };
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
      /* 2026-11-09 默认列表循环迁移：老快照里的 order 是旧默认的产物，不是用户显式选择——
         恢复时升级为 repeat-all（用户诉求「播完最后一首应该重头再来」）。
         误伤面：真想要顺序播放的用户点一下底栏模式钮即回 order。 */
      const migratedMode = restored.mode === "order" ? "repeat-all" : restored.mode;
      return {
        ...current,
        // 老快照没有 failed / remote / stream 字段：按空值补，别让 undefined 漏进真相
        queue: {
          ...restored,
          mode: migratedMode,
          failed: Array.isArray(restored.failed) ? restored.failed : [],
          remote: restored.remote && typeof restored.remote === "object" ? restored.remote : {},
          stream: restored.stream && typeof restored.stream === "object" ? restored.stream : null,
          // 老快照没有 origin：按 null 补，别让 undefined 漏进真相
          origin: typeof restored.origin === "string" ? restored.origin : null,
          cursor: clampCursor(restored.items, restored.cursor),
        },
      };
    }

    /* ---- 睡眠定时（A-23）：状态里只有截止时刻，倒计时与触发都在 UI ---- */

    case "sleep/set": {
      if (!Number.isFinite(intent.endsAt)) return current;
      const waitEnd = intent.waitEnd ?? current.sleep.waitEnd;
      if (current.sleep.endsAt === intent.endsAt && current.sleep.waitEnd === waitEnd) return current;
      // 重新定时 = 重新开始：上一次"等这首播完"的挂起必须一起清掉
      return { ...current, sleep: { endsAt: intent.endsAt, waitEnd, pending: false } };
    }

    case "sleep/setWaitEnd": {
      if (current.sleep.waitEnd === intent.waitEnd) return current;
      const next: AppState = { ...current, sleep: { ...current.sleep, waitEnd: intent.waitEnd } };
      // 已经挂起（等到点了一直在等这首放完），这时取消勾选 = "别等了"，立刻停
      if (current.sleep.pending && !intent.waitEnd && player.status === "playing") {
        return { ...next, sleep: { ...next.sleep, pending: false }, player: { ...player, status: "paused" } };
      }
      return next;
    }

    case "sleep/clear": {
      if (current.sleep.endsAt === null && !current.sleep.pending) return current;
      return { ...current, sleep: { ...current.sleep, endsAt: null, pending: false } };
    }

    case "sleep/expire": {
      // 没设定时就不该有"到点"——迟到的计时器直接忽略
      if (current.sleep.endsAt === null) return current;
      // 播完再停（P0-24）：不暂停，挂个 pending，等 player/ended 那一刻再停
      if (current.sleep.waitEnd) {
        return { ...current, sleep: { ...current.sleep, endsAt: null, pending: true } };
      }
      const cleared: AppState = { ...current, sleep: { ...current.sleep, endsAt: null, pending: false } };
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

    case "audio/setOutput": {
      // 空串就是"跟随系统默认"，不做白名单：设备 id 是浏览器给的，kernel 不认识它
      const id = typeof intent.id === "string" ? intent.id : "";
      if (current.audio.outputId === id) return current;
      return { ...current, audio: { ...current.audio, outputId: id } };
    }

    case "audio/restore": {
      const config = intent.config;
      const outputId = typeof config.outputId === "string" ? config.outputId : "";
      // 段数必须与当前一致：老存档/外来配置的迁移在 capability/audio/eq.ts 做，
      // kernel 不认识频段，只能守住"长度不变"这条不变式
      if (config.eq.length !== current.audio.eq.length) {
        const eq = current.audio.eq.map(() => 0);
        const preampDb = clampAudioDb(config.preampDb);
        const crossfadeSec = config.crossfadeSec === 3 || config.crossfadeSec === 6 ? config.crossfadeSec : 0;
        const untouched =
          preampDb === current.audio.preampDb &&
          crossfadeSec === current.audio.crossfadeSec &&
          outputId === current.audio.outputId &&
          eq.every((v, i) => v === current.audio.eq[i]);
        return untouched ? current : { ...current, audio: { preampDb, eq, crossfadeSec, outputId } };
      }
      if (
        config.preampDb === current.audio.preampDb &&
        config.crossfadeSec === current.audio.crossfadeSec &&
        outputId === current.audio.outputId &&
        config.eq.length === current.audio.eq.length &&
        config.eq.every((v, i) => v === current.audio.eq[i])
      ) {
        return current;
      }
      // 展开 current.audio 而不是直接拿 config：config 是外部来的，字段可能缺
      return { ...current, audio: { ...current.audio, ...config, outputId } };
    }

    /* ---- 歌词校准（P0-18）：按曲记，±10 秒封顶，0 就删键（不留一堆 0 把存档撑大） ---- */
    case "lyric/nudgeOffset": {
      const { trackId } = intent;
      if (!trackId) return current;
      const prev = current.lyrics.offsets[trackId] ?? 0;
      const next = clampLyricOffset(prev + intent.deltaMs);
      if (next === prev) return current;
      const offsets = { ...current.lyrics.offsets };
      if (next === 0) delete offsets[trackId];
      else offsets[trackId] = next;
      return { ...current, lyrics: { offsets } };
    }

    case "lyric/resetOffset": {
      const { trackId } = intent;
      if (!(trackId in current.lyrics.offsets)) return current;
      const offsets = { ...current.lyrics.offsets };
      delete offsets[trackId];
      return { ...current, lyrics: { offsets } };
    }

    case "lyric/restoreOffsets": {
      // 外部数据（KV）：只认有限数字并夹到范围内，坏条目直接丢，不整份作废
      const offsets: Record<string, number> = {};
      for (const [id, value] of Object.entries(intent.offsets ?? {})) {
        const ms = clampLyricOffset(value);
        if (id && ms !== 0) offsets[id] = ms;
      }
      return { ...current, lyrics: { offsets } };
    }

    /* ---- 播放行为（P0-15）：只有一个开关，两种来源同一套净化 ---- */
    case "playback/setOnError":
    case "playback/restore": {
      const onError =
        (intent.type === "playback/setOnError" ? intent.onError : intent.config.onError) === "pause"
          ? "pause"
          : "skip";
      if (current.playback.onError === onError) return current;
      return { ...current, playback: { onError } };
    }

    case "stage/setPreset": {
      if (current.stage.preset === intent.preset) return current;
      return { ...current, stage: { ...current.stage, preset: intent.preset } };
    }

    case "stage/setSkin": {
      if (current.stage.skin === intent.skin) return current;
      return { ...current, stage: { ...current.stage, skin: intent.skin } };
    }

    case "stage/setTone": {
      if (current.stage.tone === intent.tone) return current;
      return { ...current, stage: { ...current.stage, tone: intent.tone } };
    }

    case "stage/setToneAuto": {
      if (current.stage.toneAuto === intent.on) return current;
      return { ...current, stage: { ...current.stage, toneAuto: intent.on } };
    }

    case "stage/toggleLayer": {
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
        c.skin === current.stage.skin &&
        c.tone === current.stage.tone &&
        c.toneAuto === current.stage.toneAuto &&
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
