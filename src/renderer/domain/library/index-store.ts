import type { TrackId } from "../../../contracts/index.js";
import { normalizePath, type LibrarySnapshot, type Track } from "./schema.js";

/**
 * 索引存储：快照 + 增量日志（50 §6.2）。
 *
 * 为什么不是"每次全量重写 JSON"：5000 首每次启动写 2MB、解析 200ms，
 * 而实际每次只变几首。快照负责"上次的样子"，日志负责"之后变的那几首"，
 * 启动时把日志回放到快照上 —— 二次启动就从秒级降到毫秒级。
 */

export type LogOp = { op: "upsert"; track: Track } | { op: "remove"; id: TrackId };

/** 日志超过这个条数就压缩回快照，否则它会无限增长。 */
export const COMPACT_THRESHOLD = 200;

export function applyOp(snapshot: LibrarySnapshot, op: LogOp): LibrarySnapshot {
  return replay(snapshot, [op]);
}

/** 把日志回放到快照上。用 Map 而不是逐条数组复制，5000 首 × 200 条才不会变成 O(n·m)。 */
export function replay(snapshot: LibrarySnapshot, ops: LogOp[]): LibrarySnapshot {
  if (ops.length === 0) return snapshot;

  const byId = new Map<TrackId, Track>();
  for (const t of snapshot.tracks) byId.set(t.id, t);

  for (const op of ops) {
    if (op.op === "upsert") byId.set(op.track.id, op.track);
    else byId.delete(op.id);
  }

  return { ...snapshot, tracks: [...byId.values()] };
}

export function shouldCompact(logLineCount: number, threshold = COMPACT_THRESHOLD): boolean {
  return logLineCount >= threshold;
}

export function serializeOp(op: LogOp): string {
  return JSON.stringify(op);
}

/** 坏行直接跳过：一行写坏不该让整个曲库读不出来。 */
export function parseLog(text: string): LogOp[] {
  const out: LogOp[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as LogOp;
      if (parsed.op === "upsert" && parsed.track?.id) out.push(parsed);
      else if (parsed.op === "remove" && parsed.id) out.push(parsed);
    } catch {
      /* 坏行跳过 */
    }
  }
  return out;
}

export function serializeLog(ops: LogOp[]): string {
  return ops.map(serializeOp).join("\n") + (ops.length > 0 ? "\n" : "");
}

/**
 * 本次扫描范围内、但已经找不到的文件。
 *
 * 判据是"显示缺失，不自动移除条目"（50 §16 M2）：
 * 自动删会让用户以为歌被吞了；外接硬盘没插时更是灾难。
 * 只看本次扫描的目录范围 —— 用户只扫 A 目录，不该把 B 目录的歌标成缺失。
 */
export function findMissing(existing: Track[], scannedIds: Set<TrackId>, dirs: string[]): TrackId[] {
  const scope = dirs.map((d) => normalizePath(d));
  if (scope.length === 0) return [];

  return existing
    .filter((t) => !scannedIds.has(t.id))
    .filter((t) => scope.some((d) => normalizePath(t.path).startsWith(d)))
    .map((t) => t.id);
}

/** 增量比对：哪些文件需要重新读标签（新文件或 mtime/size 变了）。 */
export function diffPaths(
  existing: Map<TrackId, Track>,
  candidates: { path: string; id: TrackId; size: number; mtimeMs: number }[],
): { added: TrackId[]; changed: TrackId[]; unchanged: TrackId[] } {
  const added: TrackId[] = [];
  const changed: TrackId[] = [];
  const unchanged: TrackId[] = [];

  for (const c of candidates) {
    const old = existing.get(c.id);
    if (!old) added.push(c.id);
    else if (old.size !== c.size || old.mtimeMs !== c.mtimeMs) changed.push(c.id);
    else unchanged.push(c.id);
  }
  return { added, changed, unchanged };
}
