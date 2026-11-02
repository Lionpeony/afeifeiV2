import { useMemo, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { groupByArtist } from "../../../domain/library/group.js";
import { TrackRows } from "./rows.js";

/**
 * 歌手页（M10-1，docs/08 §5.1）：歌手列表（拼音序 + 首数字母索引）→ 点开该歌手曲目。
 * 与列表/唱片墙共享同一份 filtered——搜索词在歌手页同样生效。
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
  const [open, setOpen] = useState<string | null>(null);
  const current = open === null ? null : (artists.find((a) => a.artist === open) ?? null);

  if (current) {
    return (
      <div className="group-detail">
        <button type="button" className="group-back" onClick={() => setOpen(null)}>
          ← 返回歌手列表
        </button>
        <p className="group-title">
          {current.artist} <span className="lib-count">{current.tracks.length} 首</span>
        </p>
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
        <button type="button" key={a.artist} className="artist-item" onClick={() => setOpen(a.artist)}>
          <span className="artist-name">{a.artist}</span>
          <span className="lib-count">{a.tracks.length} 首</span>
        </button>
      ))}
    </div>
  );
}
