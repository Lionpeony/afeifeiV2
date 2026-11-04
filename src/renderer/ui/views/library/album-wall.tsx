import { useEffect, useMemo, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { groupByAlbum } from "../../../domain/library/group.js";
import { getFocus, setFocus, subscribeFocus, type LibraryFocus } from "../../library-focus.js";
import { Cover, TrackRows } from "./rows.js";

/**
 * 唱片墙（M10-1，docs/08 §5.1）：专辑卡片网格 → 点开专辑内曲目。
 * 分组走 domain 的纯函数（与列表视图共享同一份 filtered，不重扫）；
 * 卡片封面取组内第一首（同一专辑的封面本就相同）。
 *
 * 打开的是哪张专辑由 `library-focus` 决定，不是本地 state：
 * 列表行上点专辑名要能直接落到这里（M11）。
 */
export function AlbumWall({
  tracks,
  onPlayGroup,
  cover,
}: {
  tracks: Track[];
  onPlayGroup(tracks: Track[], startAt: number): void;
  cover(id: string, path: string): Promise<string | null>;
}) {
  const albums = useMemo(() => groupByAlbum(tracks), [tracks]);
  const [focus, setFocusState] = useState<LibraryFocus>(getFocus());
  useEffect(() => subscribeFocus(() => setFocusState(getFocus())), []);

  const open = focus?.kind === "album" ? (albums.find((a) => a.key === focus.key) ?? null) : null;

  if (open) {
    return (
      <div className="group-detail">
        <button type="button" className="group-back" onClick={() => setFocus(null)}>
          ← 返回唱片墙
        </button>
        <p className="group-title">
          {open.album}{" "}
          <span className="meta">
            <button
              type="button"
              className="lib-link"
              onClick={() => setFocus({ kind: "artist", artist: open.artist })}
            >
              {open.artist}
            </button>{" "}
            · {open.tracks.length} 首
          </span>
        </p>
        <div className="lib-list">
          <TrackRows
            tracks={open.tracks}
            onPlayTrack={(track) => onPlayGroup(open.tracks, open.tracks.indexOf(track))}
            cover={cover}
          />
        </div>
      </div>
    );
  }

  if (albums.length === 0) return <p className="lib-empty">没有专辑可展示。</p>;

  return (
    <div className="album-grid">
      {albums.map((album) => {
        const first = album.tracks[0];
        return (
          <button
            type="button"
            key={album.key}
            className="album-card"
            onClick={() => setFocus({ kind: "album", key: album.key })}
          >
            <Cover id={first.id} path={first.path} hasCover={first.hasCover} load={cover} />
            <span className="album-name">{album.album}</span>
            <span className="album-artist">
              {album.artist} · {album.tracks.length} 首
            </span>
          </button>
        );
      })}
    </div>
  );
}
