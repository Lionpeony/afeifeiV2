import type { Quality, RemoteTrack, SourceProvider } from "../../../contracts/capability.js";
import { listProviders } from "../registry.js";
import { findRemoteMatch, type MatchTarget } from "../../domain/library/match.js";

export interface FallbackResult {
  sourceId: string;
  track: RemoteTrack;
  url: string;
}

/**
 * 跨音源自动寻找替补曲目及可播地址。
 * 当源 A 的某首曲目由于无版权/403/失效无法播放时，从其他可用在线源进行同名检索并替补。
 */
export async function findOnlineFallback(
  target: MatchTarget,
  excludeSourceId: string,
  quality: Quality = "320k",
  providers: SourceProvider[] = listProviders()
): Promise<FallbackResult | null> {
  const title = target.title?.trim();
  if (!title) return null;

  const otherProviders = providers.filter(
    (p) => p.id !== excludeSourceId && p.capabilities.canSearch && p.capabilities.canGetUrl && typeof p.getUrl === "function"
  );

  const query = `${title} ${target.artist || ""}`.trim();

  for (const provider of otherProviders) {
    try {
      const res = await provider.search(query, 0);
      if (!res?.items || res.items.length === 0) continue;

      const matched = findRemoteMatch(res.items, target);
      if (matched && provider.getUrl) {
        const url = await provider.getUrl(matched.sourceId, quality);
        if (url) {
          return { sourceId: provider.id, track: matched, url };
        }
      }
    } catch {
      // 某源检索或解析失败，继续尝试下一个备用源
    }
  }

  return null;
}
