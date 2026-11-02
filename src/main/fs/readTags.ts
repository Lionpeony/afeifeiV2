import fsp from "node:fs/promises";
import path from "node:path";
import { parseFile } from "music-metadata";

/** 主进程只负责"读文件内容"，判断交给环 1（50 §2.1）。 */
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

const AUDIO_EXT = new Set([".mp3", ".flac", ".m4a", ".wav", ".opus", ".ogg", ".aac"]);

/**
 * 并发度。串行解析实测 7.5ms/首，5000 首要 37s，超过 30s 预算；
 * 8 路并发后同样的文件集快 3～4 倍（瓶颈在 I/O 与解码，不在 CPU 核数）。
 */
const CONCURRENCY = 8;

async function readOne(filePath: string): Promise<RawMeta | null> {
  try {
    const stat = await fsp.stat(filePath);
    // 首版不解析封面图：5000 首里几百张封面解码会拖慢扫描几十秒，只标 hasCover
    const meta = await parseFile(filePath, { duration: true, skipCovers: true });
    return {
      path: filePath,
      title: meta.common.title?.trim() || path.basename(filePath, path.extname(filePath)),
      artist: meta.common.artist?.trim() || "未知歌手",
      album: meta.common.album?.trim() || "未知专辑",
      durationMs: Math.round((meta.format.duration ?? 0) * 1000),
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      hasCover: (meta.common.picture?.length ?? 0) > 0,
    };
  } catch {
    return null; // 单个文件坏掉只跳过它自己
  }
}

/**
 * 批量读标签。**一次 IPC 拿一批（200 个），不要循环调 200 次**（50 §2.1）。
 * 批内按 CONCURRENCY 并发；结果按输入顺序返回，保证两次扫描的数组顺序一致。
 */
export async function readTags(filePaths: string[]): Promise<RawMeta[]> {
  if (filePaths.length === 0) return [];

  const results: (RawMeta | null)[] = new Array(filePaths.length).fill(null);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= filePaths.length) return;
      results[index] = await readOne(filePaths[index]);
    }
  };

  const workerCount = Math.min(CONCURRENCY, filePaths.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results.filter((r): r is RawMeta => r !== null);
}

/**
 * 递归扫描目录，只返回音频文件路径。跳过隐藏目录与符号链接环。
 * 返回的是**原始路径**，规范化交给环 1。
 */
export async function scanDirs(dirs: string[], maxDepth = 8): Promise<string[]> {
  const found: string[] = [];
  const seen = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const real = path.resolve(dir);
    if (seen.has(real)) return; // 符号链接环
    seen.add(real);

    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return; // 没权限的目录直接跳过
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile() && AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) found.push(full);
    }
  }

  for (const dir of dirs) await walk(dir, 0);
  return found;
}
