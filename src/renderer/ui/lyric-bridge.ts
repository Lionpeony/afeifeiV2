import type { LyricDoc } from "../../contracts/capability.js";
import { getState, subscribe } from "../kernel/index.js";
import { onTick } from "./compositor.js";
import { minimalState } from "./views/stage/lyric-state.js";

/**
 * 主窗 → 桌面歌词窗的桥（M9-1）：迷你窗同款单向流，**写者仍然只有 store 一个**。
 *
 * 行判定复用播放页同一份 `minimalState`（ lyric-state 的唯一判定），所以桌面歌词
 * 与播放页天然同轴——对拍判据由 lyric-state 的测试钉死，这里不再各算一遍。
 * doc 由 StageView 写入（它已负责取词），本模块只读，不重复发歌词请求。
 */
let doc: LyricDoc | null = null;

/** StageView 取到/清掉歌词文档时同步到这里。 */
export function setLyricDoc(d: LyricDoc | null): void {
  doc = d;
}

export function startLyricBridge(): void {
  const api = window.api;
  let last = "\u0000"; // 哨兵：保证第一帧一定推一次
  let lastTrack = "";

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
