import type { LyricDoc } from "../../contracts/lyric.js";
import type { HttpPort } from "../../contracts/ports.js";
import { parseLyrics } from "../capability/lyrics/index.js";
import { fetchLyricText } from "../domain/lyrics/fetch-lrclib.js";
import { lrcOffsetOf } from "../domain/lyrics/lrc-meta.js";
import { fileNameOf, type Track } from "../domain/library/schema.js";

/**
 * 本地曲目的歌词（P0-20）：**同名 `.lrc` → 内嵌标签 → LRCLIB → 纯音乐**。
 *
 * 依赖全部注入（读文件、发 HTTP），所以本模块能在 node 里单测 —— 判据见
 * `test/local-lyric.test.mjs`。也正因为注入，这里不认识 `window.api`。
 */

export interface LocalLyricDeps {
  /** 主进程读文件：同名 .lrc → 内嵌标签，都没有返回 null。 */
  read(filePath: string): Promise<{ text: string; source: "local" | "embedded" } | null>;
  /** LRCLIB 兜底用；只借 `fetchJson`。 */
  http: Pick<HttpPort, "fetchJson">;
}

/** `[offset:]` 换算在环 1（`domain/lyrics/lrc-meta.ts`），这里转出去给判据用。 */
export { lrcOffsetOf };

/**
 * 手动绑定的原文 → doc（P0-19）。与本地词同一套 `[offset:]` 换算，
 * 只是来源标成 manual（界面据此说"这版是你自己挑的"）。
 */
export function bindingToDoc(text: string, trackId: string, totalMs?: number): LyricDoc {
  return parseLyrics(text, { trackId, source: "manual", totalMs, offsetMs: lrcOffsetOf(text) });
}

/** 扫描器对缺标签的兜底值，拿去搜 LRCLIB 只会搜出无关结果。 */
const UNKNOWN_ARTIST = "未知歌手";

/**
 * 取本地曲目的词。第四条路是**抛错**（"纯音乐"）：
 * `lyric-source` 把错误消息当空态文案显示（播放页与桌面歌词读同一份），且失败不占位，
 * 下次进播放页还会重试 —— 比造一个 `quality:"none"` 的空 doc 更省分支。
 */
export async function resolveLocalLyric(
  filePath: string,
  track: Track | undefined,
  deps: LocalLyricDeps,
): Promise<LyricDoc> {
  const trackId = track?.id ?? filePath;
  const totalMs = track?.durationMs;

  const local = await deps.read(filePath);
  if (local?.text) {
    return parseLyrics(local.text, {
      trackId,
      source: local.source,
      totalMs,
      offsetMs: lrcOffsetOf(local.text),
    });
  }

  const artist = track?.artist && track.artist !== UNKNOWN_ARTIST ? track.artist : undefined;
  const text = await fetchLyricText(deps.http, {
    trackName: track?.title?.trim() || fileNameOf(filePath),
    artistName: artist,
    durationMs: totalMs,
  });
  if (text?.trim()) {
    return parseLyrics(text, { trackId, source: "lrclib", totalMs, offsetMs: lrcOffsetOf(text) });
  }

  throw new Error("纯音乐");
}
