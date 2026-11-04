import { useEffect, useMemo, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { groupByAlbum, groupByArtist } from "../../../domain/library/group.js";
import { getFocus, setFocus, subscribeFocus, type LibraryFocus } from "../../library-focus.js";
import { TrackRows } from "./rows.js";

/**
 * 歌手页（M10-1，docs/08 §5.1）：歌手列表（拼音序 + 首数字母索引）→ 点开该歌手曲目。
 * 与列表/唱片墙共享同一份 filtered——搜索词在歌手页同样生效。
 *
 * 歌手详情除了曲目，还列出他的专辑（点一张 = 切到专辑详情）；
 * 打开哪个歌手同样由 `library-focus` 决定（M11：行上的歌手名可点）。
 */
export function ArtistsPage({
  tracks,
  onPlayGroup,
  cover,
}: {
  tracks: Track[];
  onPlayGroup(tracks: Track[], startAt: number): void;
  cover(id: string, path: string): Promise<string | null>;
}) {
  const artists = useMemo(() => groupByArtist(tracks), [tracks]);
  const [focus, setFocusState] = useState<LibraryFocus>(getFocus());
  useEffect(() => subscribeFocus(() => setFocusState(getFocus())), []);

  const current = focus?.kind === "artist" ? (artists.find((a) => a.artist === focus.artist) ?? null) : null;
  const albums = useMemo(
    () => (current ? groupByAlbum(current.tracks) : []),
    [current],
  );

  if (current) {
    return (
      <div className="group-detail">
        <button type="button" className="group-back" onClick={() => setFocus(null)}>
          ← 返回歌手列表
        </button>
        <p className="group-title">
          {current.artist} <span className="meta">{current.tracks.length} 首 · {albums.length} 张专辑</span>
        </p>
        {albums.length > 0 ? (
          <div className="artist-albums">
            {albums.map((album) => (
              <button
                type="button"
                key={album.key}
                className="artist-album"
                onClick={() => setFocus({ kind: "album", key: album.key })}
                title={`${album.album} · ${album.tracks.length} 首`}
              >
                {album.album}
                <span className="meta">{album.tracks.length}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="lib-list">
          <TrackRows
            tracks={current.tracks}
            onPlayTrack={(track) => onPlayGroup(current.tracks, current.tracks.indexOf(track))}
            cover={cover}
          />
        </div>
      </div>
    );
  }

  if (artists.length === 0) return <p className="lib-empty">没有歌手可展示。</p>;

  return (
    <div className="artist-list">
      {artists.map((a) => (
        <button
          type="button"
          key={a.artist}
          className="artist-item"
          onClick={() => setFocus({ kind: "artist", artist: a.artist })}
        >
          <span className="artist-name">{a.artist}</span>
          <span className="meta">{a.tracks.length} 首</span>
        </button>
      ))}
    </div>
  );
}
