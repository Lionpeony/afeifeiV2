import type { Track } from "./schema.js";

/**
 * 本地曲目元数据覆盖（Ring 1，纯函数）。
 *
 * **不写回文件标签**：folia 的 `LocalSongMetadataMatchDialog` 也只写它自己的库、
 * 保留 `importedMetadata` 快照可一键还原，理由一样——音频标签的写入要处理
 * ID3v1/v2、APEv2、FLAC picture、编码、损坏文件，任何一处写错就是用户的原文件报废。
 * 这里在「索引之上」盖一层：扫到的新标签照旧存着，显示与搜索用覆盖值，
 * 取消覆盖就回到文件本身的样子。
 *
 * 键是 `trackId`（= 路径哈希），换文件路径就换身份，覆盖自然失效。
 */

export interface TrackMetaPatch {
  title?: string;
  artist?: string;
  album?: string;
}

export type MetaOverrides = Record<string, TrackMetaPatch>;

const MAX_FIELD = 200;

function cleanPatch(raw: unknown): TrackMetaPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: TrackMetaPatch = {};
  for (const field of ["title", "artist", "album"] as const) {
    const v = src[field];
    if (typeof v === "string") {
      const text = v.trim().slice(0, MAX_FIELD);
      if (text) out[field] = text;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** KV 读回：坏 JSON / 坏条目一律当没有，一条坏数据不能让整个覆盖层消失。 */
export function parseMetaOverrides(raw: string | null): MetaOverrides {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: MetaOverrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const patch = cleanPatch(value);
      if (id && patch) out[id] = patch;
    }
    return out;
  } catch {
    return {};
  }
}

export const serializeMetaOverrides = (overrides: MetaOverrides): string => JSON.stringify(overrides);

/** 应用覆盖：未改过的字段保持文件里的值。返回新对象，不改入参。 */
export function applyMeta(track: Track, patch?: TrackMetaPatch): Track {
  if (!patch) return track;
  return {
    ...track,
    title: patch.title ?? track.title,
    artist: patch.artist ?? track.artist,
    album: patch.album ?? track.album,
  };
}

/**
 * 生成下一次的覆盖表：**整条替换**，不做字段合并。
 * 合并会让「把歌手改回空」变不回来——空字段被清掉后旧值又冒出来。
 * 调用方（编辑框）每次都提交三个字段，所以整条替换才是正确的语义。
 * 三个字段都空 = 恢复文件原值，整条摘掉。
 */
export function patchMeta(prev: MetaOverrides, id: string, patch: unknown): MetaOverrides {
  const next = { ...prev };
  const cleaned = cleanPatch(patch);
  if (!cleaned) delete next[id];
  else next[id] = cleaned;
  return next;
}

/** 只有改过的曲目才留条目，其余字段回落到文件值。 */
export const metaOf = (overrides: MetaOverrides, id: string): TrackMetaPatch | undefined => overrides[id];
