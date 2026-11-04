/**
 * 「从某一行跳到歌手 / 专辑」的目标（Ring 4，纯 UI 导航状态）。
 *
 * 不放进 domain：这是"用户现在看哪一页"，不是曲库事实；
 * 但它要跨页面（本地列表 → 歌手详情），所以放一个独立的小模块，
 * 谁点谁 setFocus，详情视图订阅它。
 *
 * 取值一律走 `domain/library/group.ts` 的 `artistNameOf` / `albumKeyOf`，
 * 保证链接种下的键和分组算出来的键逐字相同（单测钉住这条）。
 */

export type LibraryFocus =
  | { kind: "artist"; artist: string }
  | { kind: "album"; key: string }
  | null;

let focus: LibraryFocus = null;
const listeners = new Set<() => void>();

export const getFocus = (): LibraryFocus => focus;

export function setFocus(next: LibraryFocus): void {
  focus = next;
  for (const fn of listeners) fn();
}

export function subscribeFocus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 有 focus 时该切到哪个视图；没有就返回 null（交给页面自己的 tab）。 */
export function viewOfFocus(next: LibraryFocus): "albums" | "artists" | null {
  if (!next) return null;
  return next.kind === "artist" ? "artists" : "albums";
}
