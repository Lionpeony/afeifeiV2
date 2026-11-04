/**
 * 装配层的"形状"文件（从 bootstrap.ts 拆出，00 §12 文件 ≤400 行）：
 * 桥的类型、Services 接口、错误收敛。实现都在 bootstrap.ts。
 */
import type { AudioEngine } from "../capability/audio/engine.js";
import type {
  LyricDoc,
  OnlinePlaylist,
  Quality,
  RemoteTrack,
  SearchResult,
  Toplist,
} from "../../contracts/capability.js";
import type { QrSession } from "../capability/sources/netease/index.js";
import type { ScanStats } from "../domain/library/scan.js";
import type { Track } from "../domain/library/schema.js";
import type { LrclibHit } from "../domain/lyrics/fetch-lrclib.js";
import type { Theme } from "./theme.js";
import { errorText, translateError } from "../capability/errors.js";

export interface Api {
  ping(): string;
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<void>;
  pickFiles(): Promise<string[]>;
  grant(filePath: string): Promise<string | null>;
  scan(dirs: string[]): Promise<string[]>;
  /** 已保存的曲库目录（M9）；空数组 = 还没添加过 */
  libraryRoots(): Promise<string[]>;
  /** 弹目录选择器并加入列表；取消返回 null */
  addLibraryRoot(): Promise<string[] | null>;
  removeLibraryRoot(dir: string): Promise<string[]>;
  /** 系统通知（窗口在后台时才有意义） */
  notify(payload: { title: string; body: string }): Promise<boolean>;
  autoLaunch(): Promise<boolean>;
  setAutoLaunch(on: boolean): Promise<boolean>;
  readTags(filePaths: string[]): Promise<unknown[]>;
  statFiles(filePaths: string[]): Promise<{ path: string; size: number; mtimeMs: number }[]>;
  cover(filePath: string): Promise<string | null>;
  /** 本地词原文（同名 .lrc → 内嵌标签）；没有返回 null。 */
  localLyric(filePath: string): Promise<{ text: string; source: "local" | "embedded" } | null>;
  /** 出站 HTTP（主进程发）：形状同 `HttpPort.fetchJson`，只给 LRCLIB 兜底用。 */
  fetchJson(
    url: string,
    options?: {
      method?: "GET" | "POST";
      form?: Record<string, string | number | boolean>;
      headers?: Record<string, string>;
    },
  ): Promise<{ status: number; json: unknown; setCookie: string[] }>;
  loadIndex(): Promise<string | null>;
  saveIndex(json: string): Promise<void>;
  readIndexLog(): Promise<string>;
  appendIndexLog(lines: string): Promise<void>;
  clearIndexLog(): Promise<void>;
  readStore(key: string): Promise<string | null>;
  writeStore(key: string, json: string): Promise<void>;

  // 音源本地通道（主进程内嵌 SDK）
  ncmCall(method: string, params?: Record<string, unknown>): Promise<unknown>;
  ncmProfile(): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }>;
  ncmLogout(): Promise<void>;
  qqCall(method: string, params?: Record<string, unknown>): Promise<unknown>;
  importUserSource(): Promise<{ name: string; code: string } | null>;
  installUserSource(sourceId: string, code: string): Promise<unknown>;
  callUserSource(sourceId: string, method: string, params?: unknown): Promise<unknown>;
  qqLogin(channel?: string): Promise<{ key: string; qrImage: string }>;
  qqPoll(key: string): Promise<{ code: number; loggedIn: boolean; message: string }>;
  qqProfile(): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }>;
  qqLogout(): Promise<void>;
  openMini(): Promise<void>;
  pushMiniState(json: string): void;
  onMiniAction(cb: (action: string) => void): void;
  /** 开桌面歌词窗；已开着且在穿透态则解锁（M9-1）。 */
  openLyric(): Promise<void>;
  unlockLyric(): Promise<void>;
  pushLyricState(json: string): void;
  onSchemeUrl(cb: (intent: { action: string; id: string; source?: string }) => void): void;
  schemePoll(): Promise<{ action: string; id: string; source?: string } | null>;
  /** 媒体键与托盘发来的命令名（A-24）：`toggle` / `next` / `prev`，语义在命令注册表里 */
  onPlaybackCommand(cb: (cmd: string) => void): void;
  /** 上报 Chromium MediaSession 能不能用（A-24）：能 → 媒体键交给系统媒体面板，不能 → 主进程注册 globalShortcut 兜底 */
  setMediaSessionSupported(supported: boolean): void;
  /** 全局快捷键（A-24 可配置那半）：给绑定 → 主进程注册；结果与按键分别回传。 */
  setGlobalShortcuts(bindings: { action: string; accelerator: string }[]): void;
  onGlobalShortcut(cb: (action: string) => void): void;
  onGlobalShortcutStatus(
    cb: (results: { action: string; accelerator: string; registered: boolean }[]) => void,
  ): void;
  /** 托盘显示用（A-25）：只推「在播什么 / 是否在播」，主进程不做判断 */
  pushTrayState(state: { playing: boolean; title: string | null }): void;
  exportTheme(json: string): Promise<boolean>;
  importTheme(): Promise<unknown>;

  // 下载（M7，桥接 DownloadPort）
  downloadDir(): Promise<string>;
  downloadSetDir(): Promise<string | null>;
  downloadUsage(): Promise<number>;
  downloadFetch(
    taskId: string,
    url: string,
    destPath: string,
  ): Promise<{ bytes: number; resumed: boolean }>;
  downloadCancel(taskId: string): Promise<void>;
  downloadRemove(filePath: string): Promise<void>;
  onDownloadProgress(cb: (p: { taskId: string; received: number; total: number }) => void): () => void;

  // 更新与崩溃（M8）
  onUpdateAvailable(cb: (v: { version: string; url: string }) => void): void;
  lastCrash(): Promise<{ at: string; kind: string; file: string } | null>;
  markCrashSeen(file: string): Promise<void>;
  /** 外链（白名单域，主进程校验）。 */
  openExternal(url: string): Promise<void>;
  exportBackup(): Promise<string | null>;
  importBackup(): Promise<{ restored: boolean } | null>;
}

declare global {
  interface Window {
    api: Api;
  }
}

export interface Services {
  engine: AudioEngine;
  /** 启动时读到的明暗主题（docs/09 B4）。 */
  theme: Theme;
  /** 切换并持久化，返回生效值。 */
  setTheme(theme: Theme): Theme;
  pick(): Promise<string[]>;
  positionMs(): number;
  /** 按已保存的目录列表扫描；一个都没有时先让你选一个（M9）。取消返回 null。 */
  scan(onProgress?: (done: number, total: number) => void): Promise<ScanStats | null>;
  /**
   * 改本地曲目的显示元数据（M11）。**不写音频文件标签**（照 folia：标签写坏了没法回滚），
   * 只改索引之上的一层覆盖；三个字段都留空 = 恢复文件原值。
   */
  editTrackMeta(id: string, patch: { title?: string; artist?: string; album?: string }): Promise<void>;
  /** 已保存的曲库目录（M9）。空数组 = 还没添加过。 */
  libraryRoots(): Promise<string[]>;
  /** 弹目录选择器并加入列表；取消返回 null。 */
  addLibraryRoot(): Promise<string[] | null>;
  removeLibraryRoot(dir: string): Promise<string[]>;
  /** 开机自启（M9）：状态以系统为准，返回生效值。 */
  autoLaunch(): Promise<boolean>;
  setAutoLaunch(on: boolean): Promise<boolean>;
  /** 歌词正则过滤（B-2）：一行一条；返回写错了、已忽略的模式。改规则不重抓歌词。 */
  lyricFilters(): Promise<string>;
  setLyricFilters(text: string): Promise<string[]>;
  /** 取封面（带缓存与请求去重）。 */
  cover(id: string, path: string): Promise<string | null>;
  /** 已注册的音源（UI 的选项来源就是它，不写死）。canDownload = canGetUrl（M7）。 */
  sources(): {
    id: string;
    name: string;
    canAuth: boolean;
    canDownload: boolean;
    canPlaylists: boolean;
    canToplists: boolean;
    /** 有账号级数据（每日推荐 / 红心 / 播放记录 / 漫游） */
    canAccount: boolean;
  }[];
  /** 在线搜索。错误已经翻译成人话，直接显示。 */
  searchOnline(sourceId: string, keyword: string, page?: number): Promise<SearchResult>;
  /** 当前账号的在线歌单（M9-5）。未登录抛 auth-required 的人话。 */
  listPlaylists(sourceId: string): Promise<OnlinePlaylist[]>;
  /** 榜单列表（A-14）。下钻曲目走 playlistTracks(sourceId, 榜 id)。 */
  listToplists(sourceId: string): Promise<Toplist[]>;
  /** 歌单曲目（分页）。收藏的在线歌单也用这条取曲目。 */
  playlistTracks(sourceId: string, playlistId: string, page?: number): Promise<SearchResult>;

  /* ---- 收藏的在线歌单（M11）：分享链接 / id → 收藏 → 点开就播 ---- */
  /** 已收藏的在线歌单（本机持久化，与账号歌单列表是两件事）。 */
  onlinePlaylists(): Promise<SavedPlaylistView[]>;
  /** 存一个已知头信息的歌单（账号歌单行上的「收藏」走这条）。重复 = 更新。 */
  savePlaylist(
    sourceId: string,
    playlist: { id: string; name: string; count: number; coverUrl?: string },
  ): Promise<SavedPlaylistView[]>;
  /**
   * 粘贴分享文案导入：认 `?id=`、`/playlist/123`、纯数字三种写法。
   * 认不出就抛人话，不猜。名字取不到时退回「歌单 <id>」。
   */
  importPlaylist(sourceId: string, ref: string): Promise<SavedPlaylistView[]>;
  removePlaylist(sourceId: string, id: string): Promise<SavedPlaylistView[]>;

  /* ---- 账号级数据（R1 第一批）：源没有 account 就抛 capability-missing ---- */
  /** 这个源有没有账号数据能力。首页/漫游读它决定要不要出入口，不去 try 方法。 */
  canAccount(sourceId: string): boolean;
  /** 每日推荐（账号）。未登录抛 auth-required 的人话。 */
  accountDailySongs(sourceId: string): Promise<RemoteTrack[]>;
  /** 账号红心的 songId 列表。**不是**本地曲库那套 trackId。 */
  accountLikedIds(sourceId: string): Promise<string[]>;
  /** 账号红心的曲目详情（批量取，不是 N 次单曲请求）。 */
  accountLikedSongs(sourceId: string): Promise<RemoteTrack[]>;
  /** 平台自报的红心总数，用来分辨「真空」和「读取失败」。 */
  accountLikedTotal(sourceId: string): Promise<number>;
  /** 收藏 / 取消（账号级）。 */
  accountSetLiked(sourceId: string, songId: string, liked: boolean): Promise<void>;
  /** 听歌排行：week 近一周 / all 全部。 */
  accountHistory(sourceId: string, range: "week" | "all"): Promise<RemoteTrack[]>;
  /** 个人 FM（漫游）。每次调用给一批。 */
  accountPersonalFm(sourceId: string): Promise<RemoteTrack[]>;
  /**
   * 上报「少推这首」（B-11）。返回 false = 源不支持或上报失败，
   * 本地名单已生效，界面不该因为这个把操作回滚。
   */
  reportDislike(sourceId: string, songId: string, scene: "fm" | "daily"): Promise<boolean>;
  /** 在线曲目歌词。错误已翻译成人话。 */
  lyric(sourceId: string, songId: string): Promise<LyricDoc>;
  /** 本地曲目歌词（P0-20）：同名 lrc → 内嵌 → LRCLIB，带缓存；都没有抛「纯音乐」。 */
  localLyric(track: Track | undefined): Promise<LyricDoc>;
  /** 手动换词（P0-19）：按「歌名 歌手」搜 LRCLIB 候选。空查询返回空数组。 */
  searchLyrics(query: string): Promise<LrclibHit[]>;
  /** 存下用户挑的那版词（key 见 `lyricBindKey`）并返回 doc。 */
  bindLyric(key: string, trackId: string, text: string, totalMs?: number): Promise<LyricDoc>;
  /** 频谱采样（0–1 的 bins 个桶）。没在播返回 null。 */
  spectrum(bins: number): number[] | null;
  /** 弹文件框选一个 .js 用户源，返回内容。取消返回 null。 */
  importSource(): Promise<{ name: string; code: string } | null>;
  /** 装进沙箱 + 存 KV + 注册。返回音源 id 与名字。 */
  installSource(fileName: string, code: string): Promise<{ id: string; name: string }>;
  /** 开/聚焦迷你窗。 */
  openMini(): Promise<void>;
  /** 开桌面歌词窗；已开着且在穿透态则解锁（M9-1）。 */
  openLyric(): Promise<void>;
  /** 解锁桌面歌词（穿透 → 交互）。 */
  unlockLyric(): Promise<void>;
  /** 导出当前场景层 token 到文件。取消/失败返回 false。 */
  exportTheme(): Promise<boolean>;
  /** 从文件导入主题包，返回 sanitize 过的 token 覆盖。取消返回 null。 */
  importTheme(): Promise<Record<string, string> | null>;
  /* ---- 全局配色包（B-9）：与播放页共用文件 IO，白名单各一份 ---- */
  globalTokens(): Promise<Record<string, string> | null>;
  /** 导入全局配色包。取消返回 null；拿播放页的包来导会抛人话。 */
  importGlobalTheme(): Promise<Record<string, string> | null>;
  /** 导出当前全局覆盖；没有覆盖时返回 false（没东西可导）。 */
  exportGlobalTheme(): Promise<boolean>;
  clearGlobalTheme(): Promise<void>;
  /** 备份数据到目录。取消返回 null。 */
  exportBackup(): Promise<string | null>;
  /** 恢复备份。恢复后需重启生效。 */
  importBackup(): Promise<{ restored: boolean } | null>;

  /** 加入下载队列（M7）。返回给用户看的一句话。 */
  downloadTrack(
    sourceId: string,
    track: { sourceId: string; title: string; artist: string; album?: string },
  ): Promise<string>;
  /** 批量加入下载队列（B-10）。已在队列里的曲目自动跳过，返回一句话汇总。 */
  downloadTracks(
    sourceId: string,
    tracks: { sourceId: string; title: string; artist: string; album?: string }[],
  ): Promise<string>;
  /** 下载设置（B-10）：命名模板 + 并发上限。 */
  downloadSettings(): Promise<{ template: string; concurrency: number }>;
  setDownloadSettings(next: { template: string; concurrency: number }): Promise<{ template: string; concurrency: number }>;
  /** 取消并删除一个任务（含磁盘文件）。 */
  removeDownload(id: string): Promise<void>;
  /** 下载目录当前占用（字节）。 */
  downloadUsage(): Promise<number>;
  /** 自定义下载目录。取消返回 null；已有文件不搬。 */
  setDownloadDir(): Promise<string | null>;

  /** 有新版本（启动 30s 查一次，非弹窗，只提示）。 */
  onUpdateAvailable(cb: (v: { version: string; url: string }) => void): void;
  /** 上次异常退出的崩溃记录；没有或已提示过返回 null。 */
  lastCrash(): Promise<{ at: string; kind: string; file: string } | null>;
  markCrashSeen(file: string): Promise<void>;
  /** 打开发布页（白名单域，主进程校验）。 */
  openExternal(url: string): Promise<void>;
  /** 取在线播放地址。拿到的是一个本地代理地址（真音源接入后才会有）。 */
  resolveOnlineUrl(sourceId: string, trackId: string, quality: Quality): Promise<string>;
  /** 开始登录：网易云弹扫码窗，QQ 开真实登录页（用户在页面里登录）。按 sourceId 路由。 */
  startLogin(sourceId: string, channel?: string): Promise<QrSession | { loggedIn: boolean }>;
  /** 轮询扫码结果（key 前缀 qq: 走 QQ）。qrImage 有值 = 页面刷新了二维码，UI 要更新。 */
  pollLogin(key: string): Promise<{ code: number; loggedIn: boolean; message: string; qrImage?: string }>;
  /** 查询某音源的登录态（只看账号接口 / cookie，不看凭据字段） */
  loginStatus(sourceId: string): Promise<{ loggedIn: boolean; nick: string | null }>;
  /** 手机号登录：发短信验证码（仅网易云） */
  sendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>;
  /** 手机号登录：用验证码换登录态（仅网易云） */
  loginByCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  /** 退出登录（按 sourceId 路由）。 */
  logout(sourceId: string): Promise<void>;
}

/** 收藏的在线歌单（存 KV，跨重启）。`sourceId + id` 唯一。 */
export interface SavedPlaylistView {
  sourceId: string;
  id: string;
  name: string;
  count: number;
  coverUrl?: string;
  savedAt: number;
}

export interface NcmBody {
  code?: number;
  msg?: string;
  message?: string;
}

/** 把能力层抛的错收敛成一句人话。界面永远只看到这句话。 */
export function humanize(err: unknown): Error {
  const code = translateError(err);
  const wrapped = new Error(errorText(code));
  (wrapped as Error & { code?: string }).code = code;
  return wrapped;
}
