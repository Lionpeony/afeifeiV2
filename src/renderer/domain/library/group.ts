import type { Track } from "./schema.js";
import { initialsOf } from "../search/pinyin.js";

/**
 * 曲库三视图的分组纯函数（docs/08 §5.1 / M10-1）。
 *
 * 三视图共享同一份排序与过滤：分组函数只吃 `getFiltered()` 的结果，
 * 不重新扫描、不建第二套索引（docs/08 §9 判据"切视图不重扫"）。
 * 组间排序走拼音首字母（复用搜索的 initialsOf），"张"排在"周"前面不是巧合。
 */

export interface AlbumGroup {
  /** 分组键：专辑 + 歌手（同名专辑不同歌手不算同一张） */
  key: string;
  album: string;
  artist: string;
  /** 组内曲目保持曲库原顺序（通常是文件名序） */
  tracks: Track[];
}

export interface ArtistGroup {
  artist: string;
  tracks: Track[];
}

const NO_ALBUM = "未知专辑";
const NO_ARTIST = "未知歌手";

/** 分组用的歌手名（空标签兜底）。行上的歌手链接必须用同一个函数取值，否则点了跳不到。 */
export const artistNameOf = (track: Track): string => track.artist.trim() || NO_ARTIST;

/** 分组的专辑键。`:albumKeyOf` 与 `groupByAlbum` 的键必须逐字一致。 */
export const albumKeyOf = (track: Track): string =>
  `${track.album.trim() || NO_ALBUM}\u0000${artistNameOf(track)}`;

export function groupByAlbum(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const t of tracks) {
    const key = albumKeyOf(t);
    const group = map.get(key);
    if (group) group.tracks.push(t);
    else map.set(key, { key, album: t.album.trim() || NO_ALBUM, artist: artistNameOf(t), tracks: [t] });
  }
  return [...map.values()].sort((a, b) =>
    initialsOf(a.album).localeCompare(initialsOf(b.album)),
  );
}

export function groupByArtist(tracks: Track[]): ArtistGroup[] {
  const map = new Map<string, ArtistGroup>();
  for (const t of tracks) {
    const artist = artistNameOf(t);
    const group = map.get(artist);
    if (group) group.tracks.push(t);
    else map.set(artist, { artist, tracks: [t] });
  }
  return [...map.values()].sort((a, b) =>
    initialsOf(a.artist).localeCompare(initialsOf(b.artist)),
  );
}
