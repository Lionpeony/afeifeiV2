import type { LyricDoc } from "../../contracts/capability.js";

/**
 * 全应用唯一的歌词取词点（A-02）。
 *
 * 之前只有播放页 StageView 会去取词，于是"没进过播放页"时桌面歌词窗永远是空的——
 * 桌面歌词的判据是"与主窗同步"，不该以用户是否点开过某页为前提。
 *
 * 现在：主窗外壳在切歌时统一取词，播放页与桌面歌词桥都只是**订阅者**。
 * 依赖方向也是干净的——本模块只认一个 `fetch` 回调，不认识 store、不认 window.api，
 * 所以能在 node 里直接单测（判据见 test/lyric-source.test.mjs）。
 */

export interface LyricState {
  doc: LyricDoc | null;
  /** 空态/错误文案（"本地曲目暂无歌词" 之类），播放页与桌面歌词都读这一份 */
  note: string;
}

let doc: LyricDoc | null = null;
let note = "";
/** 词自带的时间轴偏移（扒词人标的），取词时记下来，校准时不能覆盖它。 */
let baseOffset = 0;
/** 用户校准（P0-18），毫秒：正 = 歌词整体往后推。 */
let userOffset = 0;
/** 已经取到（或正在取）的曲目键：同一首不重复取 */
let loadedKey: string | null = null;
/** 请求序号：切歌时作废在途请求，慢的旧响应不许盖掉新歌 */
let seq = 0;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const fn of listeners) fn();
};

export function lyricState(): LyricState {
  return { doc, note };
}

export function subscribeLyric(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 切歌到本地曲目/空队列时清空。reason 是播放页要显示的空态文案。 */
export function clearLyric(reason = ""): void {
  seq += 1; // 在途请求作废
  loadedKey = null;
  baseOffset = 0;
  if (doc === null && note === reason) return; // 幂等：订阅者不该收到重复通知
  doc = null;
  note = reason;
  emit();
}

/**
 * 设置用户校准（P0-18）。必须在切歌/改校准时由装配层推下来 ——
 * 这里不读 store（本模块能进 node 单测，就靠"只认注入"这条）。
 */
export function setUserOffset(ms: number): void {
  const next = Number.isFinite(ms) ? Math.round(ms) : 0;
  if (next === userOffset) return;
  userOffset = next;
  if (!doc) return; // 还没有词：记住值，下次取到词时会带上
  doc = { ...doc, offsetMs: baseOffset + userOffset };
  emit();
}

/** 当前生效的用户校准（测试与界面读它，不读闭包变量）。 */
export function userOffsetOf(): number {
  return userOffset;
}

/**
 * 用户手动挑了另一版词（P0-19）：**直接换 doc**，不等下一次取词。
 * `seq` 要自增 —— 否则切歌时那个还在路上的旧请求回来，会把用户刚挑的词盖掉。
 */
export function setManualLyric(next: LyricDoc): void {
  seq += 1;
  baseOffset = next.offsetMs;
  doc = { ...next, offsetMs: baseOffset + userOffset };
  note = "";
  emit();
}

/**
 * 取某首在线曲目的词。
 * @param fetch 注入的取词函数（生产是 services.lyric，测试是假函数）
 */
export async function loadLyric(
  sourceId: string,
  songId: string,
  fetch: (sourceId: string, songId: string) => Promise<LyricDoc>,
): Promise<void> {
  const key = `${sourceId}\u0000${songId}`;
  if (key === loadedKey && doc) return; // 同一首已经有了：直接复用

  loadedKey = key;
  doc = null;
  note = "";
  const my = (seq += 1);
  emit(); // 先清行：切歌瞬间不许还挂着上一首的词

  try {
    const next = await fetch(sourceId, songId);
    if (my !== seq) return; // 期间又切歌了，丢弃
    // 两个偏移分开存：词自带的 + 用户校准的。合并成一份后算总账，
    // 否则每调一次都会把词自带的偏移吃掉一层（叠着叠着就歪了）
    baseOffset = next.offsetMs;
    doc = { ...next, offsetMs: baseOffset + userOffset };
    note = "";
    emit();
  } catch (err: unknown) {
    if (my !== seq) return;
    doc = null;
    note = err instanceof Error ? err.message : "歌词拿不到";
    loadedKey = null; // 失败不占位：再进播放页要能重试
    emit();
  }
}
