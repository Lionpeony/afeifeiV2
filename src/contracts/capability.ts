import type { ErrorCode } from "./index.js";

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
  canGetRadio: boolean;
  canFavorite: boolean;
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
  canGetRadio: "getRadio",
  canFavorite: "favorite",
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

export type LyricFormat = "lrc" | "qrc" | "yrc" | "ttml" | "plain";

export interface LyricLine {
  /** 开始（毫秒，与 clock 同一单位） */
  at: number;
  /** 持续（毫秒）。没有结束标记时按下一行推算 */
  dur: number;
  text: string;
}

export interface LyricWord {
  /** 属于第几行（lines 的索引） */
  line: number;
  at: number;
  dur: number;
  char: string;
}

/**
 * 解析一次，渲染器可换（50 §7.4）。
 * **时间一律毫秒** —— 与 clock 同单位，渲染层不再做单位换算（少一次换错的机会）。
 */
export interface LyricDoc {
  format: LyricFormat;
  /** 纯文本（无时间轴），给"极简"渲染器和复制用 */
  plain: string;
  lines: LyricLine[];
  words: LyricWord[];
  /** 翻译层，按语言标记；没有就是空数组 */
  translations: { lang: string; lines: LyricLine[] }[];
}

/**
 * 一家音源必须实现的东西。
 * 可选方法 + 声明表：方法可以不写（那项能力声明为 false），
 * 但**声明了 true 却没实现**会在启动时炸 —— 这是 50 §7.2 的全部意义。
 */
export interface SourceProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: MethodCapabilities;
  readonly traits: Traits;

  search(keyword: string, page?: number): Promise<SearchResult>;
  getDetail?(sourceId: string): Promise<RemoteTrack>;
  getUrl?(sourceId: string, quality: Quality): Promise<string>;
  getLyric?(sourceId: string): Promise<LyricDoc>;
  login?(): Promise<void>;
  getAlbum?(sourceId: string, page?: number): Promise<SearchResult>;
  getArtist?(sourceId: string, page?: number): Promise<SearchResult>;
  getPlaylist?(sourceId: string, page?: number): Promise<SearchResult>;
  getRadio?(sourceId: string, page?: number): Promise<SearchResult>;
  favorite?(sourceId: string, liked: boolean): Promise<void>;
}

/** 上游错误统一收敛到这里，UI 只认码（50 §10）。 */
export interface SourceError extends Error {
  code: ErrorCode;
  /** 上游原始信息，只进日志，不进界面 */
  raw?: unknown;
}
