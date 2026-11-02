import { nativeImage } from "electron";
import { parseFile } from "music-metadata";

/**
 * 封面缩略图（50 §6.3 / 51 §4 M2 第 5 步）。
 *
 * 三条约束：
 *   1. **按需**，不在扫描时读 —— 5000 首里几百张封面解码会拖慢首次扫描几十秒；
 *   2. **缩到 160px 再回渲染层**，原图动辄几 MB，传一张能卡一帧；
 *   3. **主进程侧也有 LRU**，否则来回滚动会把同一张图反复解析。
 */

const MAX_CACHE = 500;
const THUMB_SIZE = 160;

/** path → dataURL（null 表示"这首没有封面"，也要缓存，避免反复解析） */
const cache = new Map<string, string | null>();

function remember(key: string, value: string | null): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, value);
}

export async function readCover(filePath: string): Promise<string | null> {
  const hit = cache.get(filePath);
  if (hit !== undefined) return hit;

  let dataUrl: string | null = null;
  try {
    const meta = await parseFile(filePath, { duration: false, skipCovers: false });
    const picture = meta.common.picture?.[0];
    if (picture) {
      const image = nativeImage.createFromBuffer(Buffer.from(picture.data));
      if (!image.isEmpty()) {
        dataUrl = image.resize({ width: THUMB_SIZE, height: THUMB_SIZE, quality: "good" }).toDataURL();
      }
    }
  } catch {
    dataUrl = null; // 读不出来就是没有封面，不是错误
  }

  remember(filePath, dataUrl);
  return dataUrl;
}
