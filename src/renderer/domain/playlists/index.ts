import type { TrackId } from "../../../contracts/index.js";
import type { KeyValuePort } from "../../../contracts/ports.js";

/**
 * 本机歌单（Ring 1）。
 *
 * 歌单只存 trackId，不存曲目快照：曲目信息永远以曲库为准，
 * 存一份副本就会出现"歌单里的歌手名和曲库不一样"的第二真相。
 */

const KEY = "playlists";
const MAX_NAME = 60;

export interface Playlist {
  id: string;
  name: string;
  trackIds: TrackId[];
  createdAt: number;
}

let lists: Playlist[] = [];
const listeners = new Set<() => void>();

export const getPlaylists = (): readonly Playlist[] => lists;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_NAME);
  return trimmed || "未命名歌单";
}

/** 唯一写入口：建歌单。 */
export function createPlaylist(name: string, now = Date.now()): Playlist {
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: cleanName(name),
    trackIds: [],
    createdAt: now,
  };
  lists = [...lists, playlist];
  notify();
  return playlist;
}

export function renamePlaylist(id: string, name: string): boolean {
  let changed = false;
  lists = lists.map((p) => {
    if (p.id !== id) return p;
    const nextName = cleanName(name);
    if (nextName === p.name) return p;
    changed = true;
    return { ...p, name: nextName };
  });
  if (changed) notify();
  return changed;
}

export function removePlaylist(id: string): boolean {
  const next = lists.filter((p) => p.id !== id);
  if (next.length === lists.length) return false;
  lists = next;
  notify();
  return true;
}

/** 加歌：已经在里面就不重复加（返回 false 表示没变化）。 */
export function addTrack(listId: string, trackId: TrackId): boolean {
  let changed = false;
  lists = lists.map((p) => {
    if (p.id !== listId || p.trackIds.includes(trackId)) return p;
    changed = true;
    return { ...p, trackIds: [...p.trackIds, trackId] };
  });
  if (changed) notify();
  return changed;
}

export function removeTrack(listId: string, trackId: TrackId): boolean {
  let changed = false;
  lists = lists.map((p) => {
    if (p.id !== listId) return p;
    const next = p.trackIds.filter((t) => t !== trackId);
    if (next.length === p.trackIds.length) return p;
    changed = true;
    return { ...p, trackIds: next };
  });
  if (changed) notify();
  return changed;
}

export function setPlaylists(next: Playlist[]): void {
  lists = next;
  notify();
}

function isPlaylist(x: unknown): x is Playlist {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<Playlist>;
  return typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.trackIds);
}

export async function loadPlaylists(port: KeyValuePort): Promise<number> {
  const raw = await port.read(KEY);
  if (!raw) return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      setPlaylists(
        parsed.filter(isPlaylist).map((p) => ({
          ...p,
          trackIds: p.trackIds.filter((t): t is string => typeof t === "string"),
        })),
      );
    }
  } catch {
    /* 坏文件当没有歌单 */
  }
  return lists.length;
}

export async function savePlaylists(port: KeyValuePort): Promise<void> {
  await port.write(KEY, JSON.stringify(lists));
}
