import type { DownloadItem } from "../../../contracts/index.js";

/**
 * 下载文件名模板（Ring 1 纯函数）。
 *
 * 参考 lx `SettingDownload.vue`：它只给「歌名 / 歌手」两个占位符和二选一的分隔符，
 * 我们多给 `{album}` / `{index}` / `{id}`，但规则一样——**模板只写文件名，不写目录**。
 * 目录由下载目录设置决定，混进来就会出现 `../` 越权路径。
 */

export const NAME_TEMPLATE_DEFAULT = "{artist} - {title}";
export const NAME_TEMPLATE_MAX = 120;
export const NAME_PLACEHOLDERS = ["title", "artist", "album", "index", "id"] as const;

export interface NameContext {
  title: string;
  artist: string;
  album?: string;
  /** 批量下载时的序号（从 1 起）；单曲下载不传 */
  index?: number;
  /** 源的曲目 id，用于兜底文件名 */
  id?: string;
}

export const NAME_TEMPLATE_HINT = `可用：{title} {artist} {album} {index} {id}`;

/** 清理成 Windows / macOS 都能落盘的文件名；空值兜底，绝不返回空串。 */
function sanitize(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim() // 必须先 trim：名前带空格时 `^\.+` 匹配不到，会留下 "..晴天"
    .replace(/^\.+/, "")
    .replace(/[\s.]+$/, "")
    .trim()
    .slice(0, NAME_TEMPLATE_MAX);
  return cleaned || fallback;
}

/** 渲染模板（不含扩展名）。不认识的占位符原样留着，让用户一眼看出拼错了。 */
export function renderName(template: string, ctx: NameContext): string {
  const values: Record<string, string> = {
    title: ctx.title,
    artist: ctx.artist,
    album: ctx.album ?? "",
    index: ctx.index ? String(ctx.index) : "",
    id: ctx.id ?? "",
  };
  const rendered = template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
  return sanitize(rendered, sanitize(ctx.title || ctx.id || "", "未命名曲目"));
}

/**
 * 同名去重：队列里别的任务已经占了同一个 destPath 就加 ` (2)`、` (3)`…。
 * 不查磁盘（那要 IO，不是纯函数）；磁盘上真有同名文件时由主进程 `.part` 写入策略处理。
 * ponytail: 只在内存队列内查重，跨应用实例同名会覆盖；要彻底避免需在 destPath 里带 hash。
 */
export function uniqueDestPath(
  dir: string,
  base: string,
  ext: string,
  currentId: string,
  items: DownloadItem[],
): string {
  const taken = new Set(items.filter((i) => i.id !== currentId).map((i) => i.destPath));
  const join = (name: string): string => `${dir}/${name}${ext}`;
  if (!taken.has(join(base))) return join(base);
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(join(candidate))) return join(candidate);
  }
  return join(`${base}-${Date.now()}`);
}
