/**
 * 歌词域（环 1）。对上只暴露 LyricPort（contracts/lyric.ts）。
 * 网络抓取（LRCLIB / 在线）走 HttpPort，在 fetch 层 —— 这里只管解析与缓存。
 */
import type { LyricDoc, LyricPort, LyricSourceId } from "../../../contracts/lyric";
import type { TrackId } from "../../../contracts/index";
import type { HttpPort } from "../../../contracts/ports";
import { parseLrc } from "./parse-lrc";
import { cursorAt, lineStartMs } from "./cursor";
import { fetchLyricText } from "./fetch-lrclib";

export { parseLrc } from "./parse-lrc";
export { cursorAt, lineStartMs } from "./cursor";
export { fetchLyricText, pickBest, searchLrclib } from "./fetch-lrclib";

/**
 * KV key 约定：`lyric:<trackId>` 存 LyricDoc JSON，`lyric-off:<trackId>` 存用户偏移。
 * KeyValuePort 一 key 一文件（50 §2），加歌词不用改主进程。
 */
const kvKey = (trackId: TrackId) => `lyric:${trackId}`;

/** 曲目元数据提供者（从 LibraryIndex 取，用于 LRCLIB 查询参数）。 */
export interface TrackMeta {
  title: string;
  artist?: string;
  durationMs?: number;
}

export interface LyricDeps {
  kv: {
    read(key: string): Promise<string | null>;
    write(key: string, json: string): Promise<void>;
  };
  /** 可选：给了才会在线抓取（LRCLIB）。 */
  http?: Pick<HttpPort, "fetchJson">;
  /** 可选：trackId → 查询用的元数据。 */
  metaOf?: (trackId: TrackId) => TrackMeta | null;
}

export function createLyricPort(deps: LyricDeps): LyricPort {
  const { kv } = deps;
  const cache = new Map<TrackId, LyricDoc>();
  /** 本会话内抓取失败的不再重试（避免每句歌词一次网络请求）。 */
  const failed = new Set<TrackId>();

  const load = async (trackId: TrackId): Promise<LyricDoc | null> => {
    const hit = cache.get(trackId);
    if (hit) return hit;
    const raw = await kv.read(kvKey(trackId));
    if (!raw) return null;
    try {
      const doc = JSON.parse(raw) as LyricDoc;
      cache.set(trackId, doc);
      return doc;
    } catch {
      return null;
    }
  };

  const save = async (doc: LyricDoc): Promise<void> => {
    cache.set(doc.trackId, doc);
    await kv.write(kvKey(doc.trackId), JSON.stringify(doc));
  };

  const api: LyricPort = {
    async get(trackId) {
      const cached = await load(trackId);
      if (cached) return cached;

      // 在线抓取：需要 http + 元数据，且本会话没失败过
      const meta = deps.metaOf?.(trackId);
      if (deps.http && meta?.title && !failed.has(trackId)) {
        const text = await fetchLyricText(deps.http, {
          trackName: meta.title,
          artistName: meta.artist,
          durationMs: meta.durationMs,
        });
        if (text) {
          const doc = parseLrc(text, { trackId, source: "lrclib" });
          if (doc.quality !== "none") {
            await save(doc);
            return doc;
          }
        }
        failed.add(trackId);
      }

      return {
        trackId,
        source: "local",
        hasWordTiming: false,
        lines: [],
        segments: [],
        offsetMs: 0,
        quality: "none" as const,
        fetchedAt: 0,
      };
    },

    cursorAt,

    async setOffset(trackId, offsetMs) {
      const doc = await load(trackId);
      if (!doc) throw new Error("lyric: no doc for offset");
      const next: LyricDoc = { ...doc, offsetMs };
      cache.set(trackId, next);
      await kv.write(kvKey(trackId), JSON.stringify(next));
      return next;
    },

    async refetch(trackId, source) {
      // 清缓存后重新走 get（LRCLIB 会重抓；manual 等走 importLrcText 由调用方写入 KV）
      if (source === "lrclib" && deps.http) {
        cache.delete(trackId);
        failed.delete(trackId);
        return api.get(trackId);
      }
      const doc = await load(trackId);
      return doc ?? parseLrc("", { trackId });
    },
  };
  return api;
}

/** 手动粘贴 LRC 的入口（设置/歌词页的"手动匹配"）。 */
export function importLrcText(trackId: TrackId, text: string, offsetMs = 0): LyricDoc {
  return parseLrc(text, { trackId, source: "manual", offsetMs });
}
