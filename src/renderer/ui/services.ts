/**
 * 装配层的"形状"文件（从 bootstrap.ts 拆出，00 §12 文件 ≤400 行）：
 * 桥的类型、Services 接口、错误收敛。实现都在 bootstrap.ts。
 */
import type { AudioEngine } from "../capability/audio/engine.js";
import type { LyricDoc, Quality, SearchResult } from "../../contracts/capability.js";
import type { QrSession } from "../capability/sources/netease/index.js";
import type { ScanStats } from "../domain/library/scan.js";
import { errorText, translateError } from "../capability/errors.js";

export interface Api {
  ping(): string;
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<void>;
  pickFiles(): Promise<string[]>;
  grant(filePath: string): Promise<string | null>;
  pickDir(): Promise<string | null>;
  scan(dirs: string[]): Promise<string[]>;
  readTags(filePaths: string[]): Promise<unknown[]>;
  statFiles(filePaths: string[]): Promise<{ path: string; size: number; mtimeMs: number }[]>;
  cover(filePath: string): Promise<string | null>;
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
  qqLogin(): Promise<{ loggedIn: boolean }>;
  qqProfile(): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }>;
  qqLogout(): Promise<void>;
  openMini(): Promise<void>;
  pushMiniState(json: string): void;
  onMiniAction(cb: (action: string) => void): void;
  onSchemeUrl(cb: (intent: { action: string; id: string; source?: string }) => void): void;
  schemePoll(): Promise<{ action: string; id: string; source?: string } | null>;
  exportTheme(json: string): Promise<boolean>;
  importTheme(): Promise<unknown>;
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
  pick(): Promise<string[]>;
  positionMs(): number;
  /** 选目录并扫描。取消返回 null。 */
  scan(onProgress?: (done: number, total: number) => void): Promise<ScanStats | null>;
  /** 取封面（带缓存与请求去重）。 */
  cover(id: string, path: string): Promise<string | null>;
  /** 已注册的音源（UI 的选项来源就是它，不写死）。 */
  sources(): { id: string; name: string; canAuth: boolean }[];
  /** 在线搜索。错误已经翻译成人话，直接显示。 */
  searchOnline(sourceId: string, keyword: string, page?: number): Promise<SearchResult>;
  /** 在线曲目歌词。错误已翻译成人话。 */
  lyric(sourceId: string, songId: string): Promise<LyricDoc>;
  /** 频谱采样（0–1 的 bins 个桶）。没在播返回 null。 */
  spectrum(bins: number): number[] | null;
  /** 弹文件框选一个 .js 用户源，返回内容。取消返回 null。 */
  importSource(): Promise<{ name: string; code: string } | null>;
  /** 装进沙箱 + 存 KV + 注册。返回音源 id 与名字。 */
  installSource(fileName: string, code: string): Promise<{ id: string; name: string }>;
  /** 开/聚焦迷你窗。 */
  openMini(): Promise<void>;
  /** 导出当前场景层 token 到文件。取消/失败返回 false。 */
  exportTheme(): Promise<boolean>;
  /** 从文件导入主题包，返回 sanitize 过的 token 覆盖。取消返回 null。 */
  importTheme(): Promise<Record<string, string> | null>;
  /** 备份数据到目录。取消返回 null。 */
  exportBackup(): Promise<string | null>;
  /** 恢复备份。恢复后需重启生效。 */
  importBackup(): Promise<{ restored: boolean } | null>;
  /** 取在线播放地址。拿到的是一个本地代理地址（真音源接入后才会有）。 */
  resolveOnlineUrl(sourceId: string, trackId: string, quality: Quality): Promise<string>;
  /** 开始登录：网易云弹扫码窗，QQ 开真实登录页（用户在页面里登录）。按 sourceId 路由。 */
  startLogin(sourceId: string): Promise<QrSession | { loggedIn: boolean }>;
  /** 轮询扫码结果（仅网易云） */
  pollLogin(key: string): Promise<{ code: number; loggedIn: boolean; message: string }>;
  /** 查询某音源的登录态（只看账号接口 / cookie，不看凭据字段） */
  loginStatus(sourceId: string): Promise<{ loggedIn: boolean; nick: string | null }>;
  /** 手机号登录：发短信验证码（仅网易云） */
  sendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>;
  /** 手机号登录：用验证码换登录态（仅网易云） */
  loginByCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  /** 退出登录（按 sourceId 路由）。 */
  logout(sourceId: string): Promise<void>;
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
