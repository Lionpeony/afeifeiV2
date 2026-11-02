import fsp from "node:fs/promises";

export interface FileStat {
  path: string;
  size: number;
  mtimeMs: number;
}

/**
 * 批量取文件基本信息。比读标签快一个数量级 ——
 * 增量扫描靠它判断"哪些文件变了"，只对变了的文件才去解析标签（50 §6.2）。
 *
 * 调用方负责分片：一次几百个，别把 5000 个 stat 同时扔进来（会撞 fd 上限）。
 */
export async function statFiles(filePaths: string[]): Promise<FileStat[]> {
  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const stat = await fsp.stat(filePath);
        return { path: filePath, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
      } catch {
        return null; // 文件没了，跳过（上层据此判定"缺失"）
      }
    }),
  );
  return results.filter((r): r is FileStat => r !== null);
}
