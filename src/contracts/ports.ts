/**
 * 出站端口（50 §2）：环 0–4 不许直接碰 electron / fs，只认这些接口。
 * 实现只有一处 —— renderer 的 bootstrap 把 preload 暴露的方法适配成端口。
 */

/** 应用状态持久化。主进程只负责读写文件，不知道里面是什么。 */
export interface StoragePort {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
}

/** 本地音频访问。渲染层永远拿不到裸路径，只拿令牌。 */
export interface MediaPort {
  /** 打开系统文件选择框，返回用户选中的路径。 */
  pickFiles(): Promise<string[]>;
  /** 把一个本地路径换成 appmedia:// 的 id（令牌 + TTL）。不合规的扩展名返回 null。 */
  grant(filePath: string): Promise<string | null>;
  /** 拼出可交给 <audio src> 的 URL。 */
  urlOf(id: string): string;
}

/** 主进程读出来的一条原始元数据（还没规范化成 Track）。 */
export interface RawMeta {
  path: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  size: number;
  mtimeMs: number;
  hasCover: boolean;
}

/**
 * 通用小文件存储：一个 key 一个文件。
 * 收藏 / 歌单 / 历史各用各的 key，加新东西不用改主进程。
 */
export interface KeyValuePort {
  read(key: string): Promise<string | null>;
  write(key: string, json: string): Promise<void>;
}

/**
 * 出站 HTTP。**主进程不认识 URL 的含义**，只负责发请求、带回 JSON 与 Set-Cookie。
 * cookie 由 Electron session 自动管理，所以扫码登录成功后不用我们自己搬运。
 */
export interface HttpPort {
  fetchJson(
    url: string,
    options?: {
      method?: "GET" | "POST";
      form?: Record<string, string | number | boolean>;
      headers?: Record<string, string>;
    },
  ): Promise<{ status: number; json: unknown; setCookie: string[] }>;
  /** 把文本画成二维码 dataURL（扫码登录用） */
  qrDataUrl(text: string): Promise<string>;
  /** 写一条 session cookie（有些接口要求带基础 cookie，否则 301/400） */
  setCookie(url: string, name: string, value: string): Promise<void>;
}

/**
 * 音源的本地通道。主进程侧内嵌了音源 SDK（网易云走 weapi 加密通道），
 * 渲染层只按"方法名 + 参数"调用，不认识加密细节，也不碰 cookie。
 */
export interface LocalApiPort {
  call(namespace: string, method: string, params?: Record<string, unknown>): Promise<unknown>;
  /** 登录态摘要（昵称 / uid），登录判定只看接口返回 */
  profile(namespace: string): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }>;
  logout(namespace: string): Promise<void>;
}

/** 曲库索引的存取与扫描。 */
export interface LibraryPort {
  pickDir(): Promise<string | null>;
  scan(dirs: string[]): Promise<string[]>;
  /** 一次拿一批，调用方负责分片（200 个一片）。 */
  readTags(filePaths: string[]): Promise<RawMeta[]>;
  /** 批量取 size/mtime，用于判断哪些文件真的变了（增量扫描的依据）。 */
  statFiles(filePaths: string[]): Promise<{ path: string; size: number; mtimeMs: number }[]>;
  /** 取封面缩略图（160px 的 dataURL）。没有封面返回 null。 */
  cover(filePath: string): Promise<string | null>;
  loadIndex(): Promise<string | null>;
  saveIndex(json: string): Promise<void>;
  readLog(): Promise<string>;
  appendLog(lines: string): Promise<void>;
  clearLog(): Promise<void>;
}
