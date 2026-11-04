import fsp from "node:fs/promises";
import path from "node:path";
import { parseFile } from "music-metadata";

/**
 * 本地曲目歌词（P0-20）的**文件层**。
 *
 * 主进程只回答"这个文件旁边/里面有没有一段词"，**选哪份、怎么解析、要不要兜底去 LRCLIB
 * 全在渲染层**（环 1）。理由与 readTags 同：这里不该出现业务判断。
 */

export interface LocalLyricRaw {
  text: string;
  /** 同名 `.lrc` 文件 = local；音频标签里的词 = embedded */
  source: "local" | "embedded";
}

/**
 * 解码：Windows 上的 `.lrc` 大半是 **GBK**，直接当 utf8 读会整篇变「锟斤拷」。
 * 先严格试 utf8，抛错才退 GBK —— 顺序不能反：GBK 解码任何字节序列都不会报错，
 * 反过来问就等于永远走 GBK，纯 ASCII 之外的中文文件名/英文歌词都不受影响，但
 * utf8 的日文/Emoji 会被解坏。
 */
function decodeText(buf: Buffer): string {
  const body =
    buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("gbk").decode(body);
  }
}

/** 同名 `.lrc`：跟音频文件放一起、主名相同。 */
function sidecarPath(filePath: string): string {
  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.lrc`,
  );
}

/**
 * 取本地词：**同名 `.lrc` → 音频内嵌标签**。
 * 都没有返回 null（不抛错）——"没有词"是正常状态，不是错误。
 */
export async function readLocalLyric(filePath: string): Promise<LocalLyricRaw | null> {
  try {
    const text = decodeText(await fsp.readFile(sidecarPath(filePath))).trim();
    if (text) return { text, source: "local" };
  } catch {
    // 没有同名 lrc，往下走内嵌
  }

  try {
    const meta = await parseFile(filePath, { duration: false, skipCovers: true });
    const embedded = (meta.common.lyrics ?? []).find((t) => typeof t === "string" && t.trim());
    if (embedded) return { text: embedded.trim(), source: "embedded" };
  } catch {
    // 坏文件当没有词，不阻塞播放
  }

  return null;
}
