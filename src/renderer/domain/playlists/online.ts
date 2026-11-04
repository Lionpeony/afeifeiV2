import type { OnlinePlaylist } from "../../../contracts/capability.js";
import type { KeyValuePort } from "../../../contracts/ports.js";

/**
 * 「我收藏的在线歌单」（Ring 1）。
 *
 * 与 `playlists/index.ts` 是两件事，刻意不合并：
 *  - 本机歌单存的是 `trackId`（能播的本地文件）；
 *  - 在线歌单存的是 `sourceId + playlistId`（要联网取曲目，随时可能被作者删掉）。
 * 混成一张表就会出现「歌单里一半是文件一半是远端 id」，播放链路要分叉。
 *
 * 抄 lx `OpenListModal` + `addSongListDetail` 的行为规则：
 *  同一个 `sourceId + playlistId` 只留一条，重复导入 = 更新名字/曲目数，不新增第二行。
 */

const KEY = "online-playlists";
const MAX = 200;

export interface SavedPlaylist extends OnlinePlaylist {
  /** 音源 id：同一个歌单 id 在不同源上是两个歌单 */
  sourceId: string;
  savedAt: number;
}

let saved: SavedPlaylist[] = [];
const listeners = new Set<() => void>();

export const getSavedPlaylists = (): readonly SavedPlaylist[] => saved;

export function subscribeSaved(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

/**
 * 从分享文案里取歌单 id。三种形态都认，其余一律返回 null（不猜）：
 *  - `https://music.163.com/playlist?id=123456&userid=1`（分享链接最常见）
 *  - `https://music.163.com/#/playlist/123456`
 *  - `123456`（用户直接粘 id）
 */
export function parsePlaylistRef(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  // 分享文案常常是「一句话 + 一条链接」，先把链接抠出来；没链接再看是不是纯 id
  const url = /^https?:\/\//i.test(raw) ? raw : (/https?:\/\/[^\s'"]+/.exec(raw)?.[0] ?? "");
  if (url) {
    // 单曲 / 专辑链接也带 ?id=，不能当歌单导入
    if (!/playlist/i.test(url)) return null;
    const byParam = /[?&#]id=(\d{1,20})/.exec(url);
    if (byParam) return byParam[1];
    const byPath = /\/playlist\/(\d{1,20})/.exec(url);
    return byPath ? byPath[1] : null;
  }
  const pure = /^(\d{1,20})$/.exec(raw);
  return pure ? pure[1] : null;
}

/** 加入/更新：同源同 id 就地更新（保留位置），否则新增到最前面；超过 200 条丢最旧的。 */
export function mergeSaved(list: readonly SavedPlaylist[], entry: Omit<SavedPlaylist, "savedAt">, now = Date.now()): SavedPlaylist[] {
  const next: SavedPlaylist = { ...entry, savedAt: now };
  const exists = list.some((p) => p.sourceId === entry.sourceId && p.id === entry.id);
  if (exists) {
    return list.map((p) => (p.sourceId === entry.sourceId && p.id === entry.id ? next : p));
  }
  return [next, ...list].slice(0, MAX);
}

export function dropSaved(list: readonly SavedPlaylist[], sourceId: string, id: string): SavedPlaylist[] {
  return list.filter((p) => !(p.sourceId === sourceId && p.id === id));
}

function isSaved(x: unknown): x is SavedPlaylist {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<SavedPlaylist>;
  return (
    typeof p.id === "string" &&
    typeof p.sourceId === "string" &&
    typeof p.name === "string" &&
    typeof p.count === "number"
  );
}

/** KV 读回：坏条目丢弃，不抛——一条坏数据不该让收藏列表整个消失。 */
export function parseSaved(raw: string | null): SavedPlaylist[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSaved).map((p) => ({
      id: p.id,
      sourceId: p.sourceId,
      name: p.name.trim().slice(0, 80) || "未命名歌单",
      count: Number.isFinite(p.count) && p.count > 0 ? p.count : 0,
      coverUrl: typeof p.coverUrl === "string" ? p.coverUrl : undefined,
      savedAt: Number.isFinite(p.savedAt) ? p.savedAt : 0,
    }));
  } catch {
    return [];
  }
}

export function setSavedPlaylists(next: SavedPlaylist[]): void {
  saved = next;
  notify();
}

export async function loadSavedPlaylists(port: KeyValuePort): Promise<number> {
  setSavedPlaylists(parseSaved(await port.read(KEY)));
  return saved.length;
}

export async function saveSavedPlaylists(port: KeyValuePort): Promise<void> {
  await port.write(KEY, JSON.stringify(saved));
}
