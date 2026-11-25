import type { LyricDoc } from "../../../contracts/lyric.js";
import { listProviders } from "../registry.js";
import { findRemoteMatch } from "../../domain/library/match.js";

/**
 * 本地曲目在线歌词云端刮削。
 * 当本地同名 lrc、内嵌标签和 LRCLIB 均无歌词时，
 * 依次尝试从注册的在线源（网易云、QQ 音乐等）中搜索并提取歌词。
 */
export async function scrapeOnlineLyric(
  query: string,
  trackId: string,
  durationMs?: number,
  providers = listProviders()
): Promise<LyricDoc | null> {
  const q = query.trim();
  if (!q) return null;

  const lyricProviders = providers.filter(
    (p) => p.capabilities.canSearch && p.capabilities.canGetLyric && typeof p.getLyric === "function"
  );

  for (const provider of lyricProviders) {
    try {
      const res = await provider.search(q, 0);
      if (!res?.items || res.items.length === 0) continue;

      const matched = findRemoteMatch(res.items, { title: q, durationMs });
      const target = matched ?? res.items[0];

      if (target && provider.getLyric) {
        const doc = await provider.getLyric(target.sourceId);
        if (doc && doc.lines && doc.lines.length > 0) {
          return {
            ...doc,
            trackId,
            source: provider.id as any,
          };
        }
      }
    } catch {
      // 容错继续尝试下一家
    }
  }

  return null;
}
