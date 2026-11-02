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
