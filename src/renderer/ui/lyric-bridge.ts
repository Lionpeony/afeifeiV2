import type { LyricDoc } from "../../contracts/capability.js";
import { getState, subscribe } from "../kernel/index.js";
import { onTick } from "./compositor.js";
import { lyricState, subscribeLyric } from "./lyric-source.js";
import { minimalState } from "./views/stage/lyric-state.js";

/**
 * 主窗 → 桌面歌词窗的桥（M9-1）：迷你窗同款单向流，**写者仍然只有 store 一个**。
 *
 * 行判定复用播放页同一份 `minimalState`（ lyric-state 的唯一判定），所以桌面歌词
 * 与播放页天然同轴——对拍判据由 lyric-state 的测试钉死，这里不再各算一遍。
 *
 * doc 来自 `lyric-source`（A-02：全应用唯一的取词点），所以"没进过播放页"时
 * 这里也拿得到词；本模块只跟随，不发请求。
 */
let doc: LyricDoc | null = null;

/** 跟随唯一取词点：doc 一到就换，桥自己不做任何判断。 */
function syncDoc(): void {
  doc = lyricState().doc;
}

export function startLyricBridge(): void {
  const api = window.api;
  let last = "\u0000"; // 哨兵：保证第一帧一定推一次
  let lastTrack = "";

  syncDoc();
  subscribeLyric(syncDoc);

  // 切歌立刻清行：暂停态没有 tick，不清就一直挂着上一首的词
  subscribe(() => {
    const id = getState().player.trackId ?? "";
    if (id === lastTrack) return;
    lastTrack = id;
    if (last !== "") {
      last = "";
      api.pushLyricState(JSON.stringify({ text: "" }));
    }
  });

  // 每帧算活动行（二分，开销可忽略），文本变了才过进程边界
  onTick((t) => {
    const text = doc ? minimalState(doc, t).text : "";
    if (text === last) return;
    last = text;
    api.pushLyricState(JSON.stringify({ text }));
  });
}
