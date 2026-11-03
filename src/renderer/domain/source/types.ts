/**
 * Work / Offering / SourcePort 契约（21 §三）。
 * **作品与来源分离**：一首歌一个 Work，N 个平台各一条 Offering。
 */
export type SourceId = "netease" | "qq" | "kugou" | "local" | "navidrome";

/** 作品：与平台无关的"一首歌"。 */
export interface Work {
  workId: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
}

/** 来源：某平台上这首歌的一个可播放条目。 */
export interface Offering {
  sourceId: SourceId;
  /** 平台内曲目 id（歌词/封面用）。 */
  songId: string;
  quality: "flac" | "320k" | "128k";
  playable: boolean;
  durationMs: number;
  coverUrl?: string;
}

/** 每个音源实现这个接口。主进程不认识 URL 含义（50 §HttpPort 原则不变）。 */
export interface SourcePort {
  readonly id: SourceId;
  /** 搜作品（跨源聚合后返回 Work，不返回平台条目）。 */
  search(query: string): Promise<Work[]>;
  /** 同一 Work 在本源的所有版本（原版/现场版/重制版）。 */
  offeringsOf(work: Work): Promise<Offering[]>;
  /** 取播放地址。 */
  stream(offering: Offering): Promise<{ url: string; expiresAt: number }>;
}

/**
 * 聚合规则（B-03 的"自动选最优"，选择过程必须可解释）：
 * FLAC > 320k > 128k；可播优先；同质量取响应快的。
 */
const RANK: Record<Offering["quality"], number> = { flac: 3, "320k": 2, "128k": 1 };

export function pickBestOffering(
  offerings: Offering[],
): { offering: Offering; reason: string } | null {
  const playable = offerings.filter((o) => o.playable);
  const pool = playable.length ? playable : offerings;
  if (!pool.length) return null;
  const sorted = [...pool].sort((a, b) => RANK[b.quality] - RANK[a.quality]);
  const best = sorted[0];
  const reasons: string[] = [`音质 ${best.quality}`];
  if (!best.playable) reasons.push("仅可预览");
  if (pool.length > 1) reasons.push(`共 ${pool.length} 个来源`);
  return { offering: best, reason: reasons.join(" · ") };
}
