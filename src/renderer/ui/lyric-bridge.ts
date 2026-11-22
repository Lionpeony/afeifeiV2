import type { LyricDoc } from "../../contracts/capability.js";
import { isAccountLiked, subscribe as subscribeAccountLikes } from "../domain/account-likes/index.js";
import { isLiked, subscribe as subscribeLikes } from "../domain/likes/index.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { onTick } from "./compositor.js";
import { desktopLyricState } from "./desktop-lyric-state.js";
import { lyricState, subscribeLyric } from "./lyric-source.js";
import type { Services } from "./services.js";

/**
 * 主窗 → 桌面歌词窗的桥（M9-1 / P0-21）：迷你窗同款单向流，
 * **写者仍然只有 store 一个**。
 *
 * 行判定与逐字进度复用播放页同一份 `karaokeState`（经 `desktop-lyric-state`），
 * 所以桌面歌词与播放页天然同轴 —— 对拍判据由 `desktop-lyric` 的测试钉死。
 * 行内进度也一并推（量化 2%）：窗口用裁剪做平滑扫过，不再一个字一个字跳。
 *
 * doc 来自 `lyric-source`（A-02：全应用唯一的取词点），所以"没进过播放页"时
 * 这里也拿得到词；本模块只跟随，不发请求。
 */
let doc: LyricDoc | null = null;

/** 推给窗口的一帧。`mode` 由主进程合并（它才知道穿透状态）。 */
interface Frame {
  text: string;
  translation: string;
  /** 已唱字数（逐字） */
  lit: number;
  /** 行内进度 0..1（单行平滑扫过用） */
  progress: number;
  /** 整曲进度 0..1，窗口底部那条细线 */
  song: number;
  /** 主窗当前主题：歌词窗是独立 renderer，纸签要跟着亮/暗换纸色 */
  theme: string;
  /** 播放态：工具条上的播放/暂停图标 */
  status: string;
  /** 当前曲是否已喜欢：红心按钮实心/空心 */
  liked: boolean;
}

const currentTheme = (): string => document.documentElement.dataset.theme ?? "light";

const statusNow = (): string => getState().player.status;

/** 与迷你窗同一套红心分流：在线看账号红心，本机看本机红心。 */
const likedNow = (): boolean => {
  const s = getState();
  const remote = s.player.remote;
  if (remote) return isAccountLiked(remote.songId);
  return s.player.trackId ? isLiked(s.player.trackId) : false;
};

/** 跟随唯一取词点：doc 一到就换，桥自己不做任何判断。 */
function syncDoc(): void {
  doc = lyricState().doc;
}

export function startLyricBridge(services: Services, opts: { onLike?: () => void } = {}): void {
  const api = window.api;
  let lastKey = "\u0000"; // 哨兵：保证第一帧一定推一次
  let lastTrack = "";
  let lastFrame: Frame | null = null;
  let lastLyricKey = "";
  let lastSongPush = 0;

  const frame = (text: string, translation: string, lit: number, progress: number, song: number): Frame => ({
    text,
    translation,
    lit,
    progress,
    song,
    theme: currentTheme(),
    status: statusNow(),
    liked: likedNow(),
  });

  syncDoc();
  subscribeLyric(syncDoc);

  const send = (next: Frame): void => {
    // 逐帧去重：文本、字数、行内进度（2%）、整曲进度、主题、播放态、红心都不变就不过进程边界
    const p = Math.round(next.progress * 50) / 50;
    const key = `${next.text}\u0000${next.translation}\u0000${next.lit}\u0000${p}\u0000${next.song}\u0000${next.theme}\u0000${next.status}\u0000${next.liked}`;
    if (key === lastKey) return;
    lastKey = key;
    lastFrame = next;
    api.pushLyricState(JSON.stringify(next));
  };

  // 主题切换不 dispatch 到 store，是直接改 document 属性 —— 暂停时没有 tick，
  // 用 MutationObserver 把纸色补推一次（mini-bridge 同款，2026-11-18）
  new MutationObserver(() => {
    if (lastFrame) send({ ...lastFrame, theme: currentTheme() });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // 切歌立刻清行：暂停态没有 tick，不清就一直挂着上一首的词
  subscribe(() => {
    const s = getState();
    const id = s.player.trackId ?? "";
    if (id !== lastTrack) {
      lastTrack = id;
      send(frame("", "", 0, 0, 0));
      return;
    }
    // 暂停/继续、红心变化不经过歌词 tick，但工具条要跟着变
    if (lastFrame && (lastFrame.status !== s.player.status || lastFrame.liked !== likedNow())) {
      send({ ...lastFrame, status: s.player.status, liked: likedNow() });
    }
  });

  /* 红心不属 store：本机红心与账号红心各有自己的域，各补推一帧 */
  const refreshHeart = (): void => {
    if (lastFrame) send({ ...lastFrame, liked: likedNow(), status: statusNow() });
  };
  subscribeLikes(refreshHeart);
  subscribeAccountLikes(refreshHeart);

  /* 主窗最小化 = rAF 停了 → onTick 不跑，桌面歌词也会冻住（P0-21，与迷你窗同因）。
     订阅 engine 的 timeupdate（约 4Hz，最小化也走）；行一变立刻推，进度 500ms 节流。 */
  services.engine.onTime((ms) => {
    if (getState().player.status !== "playing") return;
    const s = desktopLyricState(doc, ms);
    const key = `${s.text}\u0000${s.translation}\u0000${s.lit}`;
    const now = performance.now();
    if (key !== lastLyricKey || now - lastSongPush >= 500) {
      lastLyricKey = key;
      lastSongPush = now;
      const dur = services.durationMs();
      const song = dur > 0 ? Math.round((ms / dur) * 200) / 200 : 0;
      send(frame(s.text, s.translation, s.lit, s.progress, song));
    }
  });

  // 每帧算活动行（二分，开销可忽略）
  onTick((t) => {
    const s = desktopLyricState(doc, t);
    const dur = services.engine.durationMs();
    // 量化成 0.5%：不量化就是每帧一次跨进程发送（60 次/秒）
    const song = dur > 0 ? Math.round((t / dur) * 200) / 200 : 0;
    send(frame(s.text, s.translation, s.lit, s.progress, song));
  });

  // 歌词窗的播控意图 → 主窗 dispatch（主进程只转手，不认播放语义）
  api.onLyricAction((action) => {
    if (action === "toggle") dispatch({ type: "player/toggle" });
    else if (action === "next") dispatch({ type: "queue/next" });
    else if (action === "prev") dispatch({ type: "queue/prev", atPositionMs: services.positionMs() });
    else if (action === "like") opts.onLike?.();
  });
}
