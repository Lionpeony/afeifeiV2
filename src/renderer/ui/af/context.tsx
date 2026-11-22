/* 界面层上下文：把 App 的真实状态/动作整理成原型组件能直接消费的形状。
   只承载 UI 与播放控制，不替代 kernel/domain。 */
import { createContext, useContext } from "react";

export interface AfSource {
  id: string;
  name: string;
  short: string;
  tone: string;
  account?: string;
  canAuth?: boolean;
  canPlaylists?: boolean;
  canDownload?: boolean;
  /** 上游支持的最高音质档（P0 #7） */
  qualities?: string[];
}

export interface AfRemote {
  sourceId: string;
  songId: string;
  coverUrl?: string;
  /** 有 id 才能从播放页 / 行菜单跳进艺人、专辑详情页 */
  artistId?: string;
  albumId?: string;
}

export interface AfTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover?: string | null;
  dur: number;
  remote?: AfRemote;
}

export type AfRepeat = "off" | "all" | "one";
export type AfThemePref = "light" | "dark" | "system";
export type AfMotion = "full" | "light" | "off";
export type AfDensity = "cozy" | "compact";

export interface AfToastOpts {
  hand?: boolean;
  icon?: string;
  action?: { label: string; onClick(): void };
  ms?: number;
}

export type AfOverlay = "river" | "live" | "lyric" | "idle" | "unbox" | null;

export interface AfMyList {
  id: string;
  name: string;
  note: string;
  cover: string;
  /** 成员曲目 id（本地路径或 remote:<source>:<song>） */
  tracks: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AfSleep {
  mode: "off" | "timer" | "song";
  until: number | null;
  minutes: number;
}

export interface AfEqState {
  preset: string;
  /** 5 段（60/240/1k/4k/12k），写回时换算成 10 段真实 EQ */
  bands: number[];
}

export interface AfListEditor {
  mode: "new" | "edit";
  list?: AfMyList;
  tracks: string[];
}

/** 搜索入口要跳的发现页详情（艺人 / 专辑）；at 是跳转信号，Discover 靠它识别新的一次跳转。 */
export interface AfDetailSeek {
  kind: "artist" | "album";
  id: string;
  name: string;
  coverUrl?: string;
  at: number;
}

export interface AfApi {
  /* 导航 */
  page: string;
  setPage(page: string): void;
  localTab: "library" | "downloads" | "radio";
  setLocalTab(t: "library" | "downloads" | "radio"): void;
  mineTab: "liked" | "recent" | "stats";
  setMineTab(t: "liked" | "recent" | "stats"): void;
  searchOnline(keyword: string): Promise<{ items: unknown[]; artists?: { id?: string; name: string; picUrl?: string }[] }>;
  /** 搜索浮层「查看全部结果」→ 跳发现页的整表搜索（批量下载入口） */
  seekOnlineSearch(text: string): void;
  /** 搜索浮层 → 发现页艺人 / 专辑详情页（无 id 的源由调用方回落直播行为） */
  openDiscoverDetail(ref: Omit<AfDetailSeek, "at">): void;
  /** Discover 消费完跳转信号后清空，避免回到页面时旧详情被重新打开 */
  clearDiscoverDetail(): void;
  discoverDetail: AfDetailSeek | null;
  /* 当前曲 */
  track: AfTrack;
  currentId: string;
  resolveTrack(id: string): AfTrack;
  playing: boolean;
  togglePlay(): void;
  setPlaying(value: boolean): void;
  positionMs(): number;
  durationMs(): number;
  seekTo(seconds: number): void;
  /* 队列 */
  queue: AfTrack[];
  queueIndex: number;
  goTo(id: string): void;
  next(): void;
  prev(): void;
  userSkip(kind: "next" | "prev"): void;
  /* 播放模式 */
  shuffle: boolean;
  toggleShuffle(): void;
  repeat: AfRepeat;
  cycleRepeat(): void;
  /* 红心 */
  isLiked(track: AfTrack): boolean;
  toggleLike(track?: AfTrack): void;
  reportDislike(track: AfTrack): void;
  /* 音量 */
  volume: number;
  setVolume(v: number): void;
  /* 音源 / 账号 */
  source: string;
  sources: AfSource[];
  setSource(id: string): void;
  switchSource(id: string, opts?: { scope?: "pill" | "content"; quiet?: boolean }): void;
  srcSwap: { id: string; phase: "close" | "hold" | "open" | "sync" | "done"; scope?: "pill" | "content"; dir?: "l" | "r" } | null;
  loginSrc: string | null;
  openScan(id: string): void;
  closeScan(): void;
  accounts: Record<string, boolean>;
  loggedIn: boolean;
  /** 当前账号的真实头像/昵称（没有登录返回 null） */
  profileOf(id: string): { nick: string | null; avatarUrl: string | null } | null;
  loginFor(id: string): void;
  logout(id: string): void;
  /* 反馈 */
  toast(text: string, opts?: AfToastOpts): void;
  /** 用系统浏览器打开外链（点歌分享；主进程有白名单） */
  openExternal(url: string): void;
  onoma(text: string, opts?: { tone?: string; x?: number; y?: number }): void;
  onomaAt(el: HTMLElement | null, text: string, tone?: string): void;
  focus(): void;
  /* 彩蛋 / 色板 */
  eggs: string[];
  /** 各包独立收集的彩蛋进度：palette → 该包内首次拾到的 egg id */
  packEggs: Record<string, string[]>;
  discover(id: string, opts?: { silent?: boolean }): void;
  palette: string;
  setPalette(p: string): void;
  /** 换包过渡动画当前播放的包 id（空 = 没在播） */
  /** 换主题的换景状态（页面/换源/换主题共用幕布） */
  themeScene: { id: string; phase: "close" | "hold" | "open"; dir: "l" | "r" } | null;
  unlocked: string[];
  tryCode(code: string): boolean;
  /* 偏好 */
  themePref: AfThemePref;
  setThemePref(p: AfThemePref): void;
  resolvedTheme: "light" | "dark";
  motion: AfMotion;
  /** 用户选择：完整 / 轻 / 关闭 / 跟随系统（不同于已解析的 motion） */
  motionPref: AfMotion | "system";
  setMotion(m: AfMotion): void;
  reduce: boolean;
  density: AfDensity;
  setDensity(d: AfDensity): void;
  sfx: boolean;
  setSfx(v: boolean): void;
  /* 歌词 / 窗口 */
  lyricsOn: boolean;
  setLyricsOn(v: boolean): void;
  /* 全屏播放页 */
  playerOpen: boolean;
  playerClosing: boolean;
  openPlayer(): void;
  closePlayer(): void;
  /* 浮层 */
  rowMenu: { trackId: string; x: number; y: number } | null;
  openRowMenu(trackId: string, rect: DOMRect): void;
  closeRowMenu(): void;
  demoOpen: boolean;
  setDemoOpen(v: boolean): void;
  overlay: AfOverlay;
  setOverlay(v: AfOverlay): void;
  /** 角落小人：bye=背影离开，peek=探头回来（E27 断网恢复） */
  corner: null | "bye" | "peek";
  /* 彩蛋状态 */
  struckId: string | null;
  sheerSide: "l" | "r" | null;
  chorusAt: number | null;
  markChorus(sec: number): void;
  plays: Record<string, number>;
  onLogoClick(): void;
  triggerEgg(id: string): void;
  /* 歌曲行菜单动作 */
  addDownload(trackId: string): void;
  playNext(trackId: string): void;
  /* 真实数据动作 */
  playRemote(sourceId: string, track: unknown, list: unknown[], origin: string): void;

  /* v5.6：页面 / 台侧工具 / 用户资产 */
  history: { id: string; at: number }[];
  clearHistory(): void;
  archiveFilter: string;
  setArchiveFilter(v: string): void;
  playIds(ids: string[], startAt?: number): void;
  myLists: AfMyList[];
  setMyLists(v: AfMyList[]): void;
  addToMyList(listId: string, trackId: string): void;
  removeFromMyList(listId: string, trackId: string): void;
  openList(id: string): void;
  focusList: string | null;
  setFocusList(v: string | null): void;
  listEditor: AfListEditor | null;
  setListEditor(v: AfListEditor | null): void;
  studio: { tab: "sleep" | "quality" | "eq" } | null;
  setStudio(v: { tab: "sleep" | "quality" | "eq" } | null): void;
  quality: "standard" | "hq" | "lossless" | "hires";
  setQuality(q: "standard" | "hq" | "lossless" | "hires"): void;
  eq: AfEqState;
  setEq(v: AfEqState): void;
  sleep: AfSleep;
  startSleep(arg: "song" | number): void;
  stopSleep(): void;
  sleepLeft: number;
  showTr: boolean;
  setShowTr(v: boolean): void;
  keysOpen: boolean;
  setKeysOpen(v: boolean): void;
  lyricsFull: boolean;
  setLyricsFull(v: boolean): void;
  keysHintSeen: boolean;
  dismissKeysHint(): void;
  muted: boolean;
  toggleMute(): void;
}

export const AfContext = createContext<AfApi | null>(null);

export function useAf(): AfApi {
  const api = useContext(AfContext);
  if (!api) throw new Error("AfContext 未挂载");
  return api;
}
