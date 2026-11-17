import type { LyricDoc } from "../../contracts/capability.js";
import { getState, subscribe } from "../kernel/index.js";
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
  /** 整曲进度 0..1，窗口底部那条细线 */
  song: number;
  /** 主窗当前主题：歌词窗是独立 renderer，纸签要跟着亮/暗换纸色 */
  theme: string;
}

const currentTheme = (): string => document.documentElement.dataset.theme ?? "light";

const emptyFrame = (): Frame => ({ text: "", translation: "", lit: 0, song: 0, theme: currentTheme() });

/** 跟随唯一取词点：doc 一到就换，桥自己不做任何判断。 */
function syncDoc(): void {
  doc = lyricState().doc;
}

export function startLyricBridge(services: Services): void {
  const api = window.api;
  let lastKey = "\u0000"; // 哨兵：保证第一帧一定推一次
  let lastTrack = "";
  let lastFrame: Frame | null = null;
  let lastLyricKey = "";
  let lastSongPush = 0;

  syncDoc();
  subscribeLyric(syncDoc);

  const send = (frame: Frame): void => {
    // 逐帧去重：歌词文本、字数、整曲进度（已量化）都不变就不过进程边界
    const key = `${frame.text}\u0000${frame.translation}\u0000${frame.lit}\u0000${frame.song}\u0000${frame.theme}`;
    if (key === lastKey) return;
    lastKey = key;
    lastFrame = frame;
    api.pushLyricState(JSON.stringify(frame));
  };

  // 主题切换不 dispatch 到 store，是直接改 document 属性 —— 暂停时没有 tick，
  // 用 MutationObserver 把纸色补推一次（mini-bridge 同款，2026-11-18）
  new MutationObserver(() => {
    if (lastFrame) send({ ...lastFrame, theme: currentTheme() });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // 切歌立刻清行：暂停态没有 tick，不清就一直挂着上一首的词
  subscribe(() => {
    const id = getState().player.trackId ?? "";
    if (id === lastTrack) return;
    lastTrack = id;
    send(emptyFrame());
  });

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
      const dur = services.engine.durationMs();
      const song = dur > 0 ? Math.round((ms / dur) * 200) / 200 : 0;
      send({ text: s.text, translation: s.translation, lit: s.lit, song, theme: currentTheme() });
    }
  });

  // 每帧算活动行（二分，开销可忽略）
  onTick((t) => {
    const s = desktopLyricState(doc, t);
    const dur = services.engine.durationMs();
    // 量化成 0.5%：不量化就是每帧一次跨进程发送（60 次/秒）
    const song = dur > 0 ? Math.round((t / dur) * 200) / 200 : 0;
    send({ text: s.text, translation: s.translation, lit: s.lit, song, theme: currentTheme() });
  });
}
