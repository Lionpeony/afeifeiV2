import type { ErrorCode } from "./index.js";
import type { LyricDoc } from "./lyric.js";

/**
 * 能力契约（50 §7.2）：**先声明后使用**，UI 按声明渲染，不靠 try/catch 探测。
 *
 * 两种能力要分开：
 *   - 方法型：声明 true 就必须有同名方法，启动断言会验（`CAPABILITY_METHODS`）
 *   - 描述型：只用于渲染与提示（要不要登录、支持哪些音质），不绑方法
 */

export type Quality = "128k" | "320k" | "flac";

export interface MethodCapabilities {
  canSearch: boolean;
  canGetDetail: boolean;
  canGetUrl: boolean;
  canGetLyric: boolean;
  canLogin: boolean;
  canGetAlbum: boolean;
  canGetArtist: boolean;
  canGetPlaylist: boolean;
  canListPlaylists: boolean;
  canGetRadio: boolean;
  canFavorite: boolean;
  /** 榜单列表（A-14）。声明 true 就要有 listToplists，下钻复用 canGetPlaylist。 */
  canGetToplist: boolean;
}

/** 声明表里每一项 → 它要求的方法名。启动断言与实际方法一一对应。 */
export const CAPABILITY_METHODS: Record<keyof MethodCapabilities, string> = {
  canSearch: "search",
  canGetDetail: "getDetail",
  canGetUrl: "getUrl",
  canGetLyric: "getLyric",
  canLogin: "login",
  canGetAlbum: "getAlbum",
  canGetArtist: "getArtist",
  canGetPlaylist: "getPlaylist",
  canListPlaylists: "listPlaylists",
  canGetRadio: "getRadio",
  canFavorite: "favorite",
  canGetToplist: "listToplists",
};

export interface Traits {
  /** 播之前必须登录 */
  requiresAuth: boolean;
  /** 该源支持的音质档位，UI 只从这里取值 */
  qualities: Quality[];
}

export interface RemoteTrack {
  /** 音源内的原始 id（不是本机的 TrackId） */
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  coverUrl?: string;
}

export interface SearchResult {
  items: RemoteTrack[];
  /** 还有下一页就给出来；没有就 undefined */
  nextPage?: number;
}

/** 用户歌单（M9-5）。id 是音源内的歌单 id，取曲目走 getPlaylist(id)。 */
export interface OnlinePlaylist {
  id: string;
  name: string;
  /** 曲目数（只读展示用） */
  count: number;
  coverUrl?: string;
}

/**
 * 榜单（A-14）：只给"有什么榜"，曲目走 getPlaylist(id)。
 *
 * 刻意不叫 Playlist：榜单在音源侧就是一个只读歌单，但产品语义不同
 * （榜单是编辑给的，不随账号变，也不需要登录），混用会让 UI 上的"我的歌单"多出榜。
 */
export interface Toplist {
  id: string;
  name: string;
  count: number;
  coverUrl?: string;
}

/**
 * 歌词模型只有一份：`contracts/lyric.ts`（21 §二）。
 * 这里只做转出，方便音源侧一个 import 拿全契约，**不再另定义**。
 */
export type { LyricDoc } from "./lyric.js";

/**
 * 一家音源必须实现的东西。
 * 可选方法 + 声明表：方法可以不写（那项能力声明为 false），
 * 但**声明了 true 却没实现**会在启动时炸 —— 这是 50 §7.2 的全部意义。
 */
/**
 * 账号级数据（R1 第一批）。与「音源能力」分开的理由：
 * 这些接口都要求登录，返回的是**这个账号**的东西，不是这个源的公共数据；
 * 未登录时它们该抛 auth-required，而不是退化成空列表——空列表会让界面
 * 显示成「今天没有推荐」，用户不知道自己只是没登录。
 *
 * 五件事一一对应网易云的五个接口（见 docs/22 §R1）：
 *   dailySongs      → recommend_songs（每日推荐，登录后才有）
 *   likedIds        → likelist（账号红心的 songId，本地曲库的红心是另一套）
 *   setLiked        → like（收藏 / 取消）
 *   listeningHistory→ user_record（听歌排行，week = 近一周 / all = 全部）
 *   personalFm      → personal_fm（漫游）
 */
export interface AccountCapability {
  dailySongs(): Promise<RemoteTrack[]>;
  likedIds(): Promise<string[]>;
  setLiked(songId: string, liked: boolean): Promise<void>;
  listeningHistory(range: "week" | "all"): Promise<RemoteTrack[]>;
  personalFm(): Promise<RemoteTrack[]>;
}

export interface SourceProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: MethodCapabilities;
  readonly traits: Traits;
  /**
   * 有账号数据的源才提供这一块。UI 一律读「有没有 account」决定要不要出入口，
   * 不去 try 某个方法存不存在（同 capabilities 的纪律）。
   */
  readonly account?: AccountCapability;

  search(keyword: string, page?: number): Promise<SearchResult>;
  getDetail?(sourceId: string): Promise<RemoteTrack>;
  getUrl?(sourceId: string, quality: Quality): Promise<string>;
  getLyric?(sourceId: string): Promise<LyricDoc>;
  login?(): Promise<void>;
  getAlbum?(sourceId: string, page?: number): Promise<SearchResult>;
  getArtist?(sourceId: string, page?: number): Promise<SearchResult>;
  getPlaylist?(sourceId: string, page?: number): Promise<SearchResult>;
  /** 当前账号的歌单列表（M9-5）。未登录抛 auth-required，UI 只显示人话。 */
  listPlaylists?(): Promise<OnlinePlaylist[]>;
  getRadio?(sourceId: string, page?: number): Promise<SearchResult>;
  favorite?(sourceId: string, liked: boolean): Promise<void>;
  /** 榜单列表（A-14）。下钻用 getPlaylist(榜 id)。 */
  listToplists?(): Promise<Toplist[]>;
}

/** 上游错误统一收敛到这里，UI 只认码（50 §10）。 */
export interface SourceError extends Error {
  code: ErrorCode;
  /** 上游原始信息，只进日志，不进界面 */
  raw?: unknown;
}
