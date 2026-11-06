import type { ReactNode } from "react";
import type { RemoteTrackMeta, TrackId } from "../../../../contracts/index.js";
import type { Track } from "../../../domain/library/schema.js";
import { fmt, pad2, fileOf } from "./types.js";

export interface QueueRowsProps {
  items: TrackId[];
  indices: number[];
  playOrder: number[];
  tracks: Map<string, Track>;
  covers: Record<string, string>;
  /** 在线曲目的标题/歌手/时长（`remote:` 开头的 id，本地曲目查不到） */
  remote?: Record<TrackId, RemoteTrackMeta>;
  onPlay: (id: TrackId) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
  dense?: boolean;
}

export function QueueRows({ items, indices, playOrder, tracks, covers, remote, onPlay, onMove, onRemove, dense = false }: QueueRowsProps) {
  return <>
    {indices.map((at) => {
      const id = items[at];
      const track = tracks.get(id);
      const meta = remote?.[id];
      const orderIndex = playOrder.indexOf(at) + 1;
      return (
        <div className="st-nx" key={id}>
          <button type="button" className="st-nx-main" title="播放这首" onClick={() => onPlay(id)}>
            <i className="no">{pad2(orderIndex)}</i>
            {!dense ? <span className="art" style={covers[id] ? { backgroundImage: `url(${JSON.stringify(covers[id])})` } : undefined} /> : null}
            <span className="tx">
              {track?.title ?? meta?.title ?? fileOf(id)}
              <small>{track?.artist ?? meta?.artist ?? (/^https?:\/\//i.test(id) ? "在线音源" : "")}</small>
            </span>
            <time>{track ? fmt(track.durationMs) : meta?.durationMs ? fmt(meta.durationMs) : "--:--"}</time>
          </button>
          <span className="st-nx-ops">
            <button type="button" aria-label="上移一位" disabled={at === 0} onClick={() => onMove(at, -1)}>↑</button>
            <button type="button" aria-label="从队列移除" onClick={() => onRemove(at)}>×</button>
          </span>
        </div>
      );
    })}
  </>;
}

export function StageQueuePanel(props: QueueRowsProps & { total: number; cursor: number }) {
  const { total, cursor, indices } = props;
  return <>
    <div className="st-side-h"><b>接下来</b><span>QUEUE · {indices.length} / {total}</span></div>
    {indices.length ? <QueueRows {...props} /> : <p className="st-side-empty">队列里没有下一首</p>}
    <div className="st-seal"><b>QUEUE {pad2(Math.max(0, cursor + 1))}</b><small>TOTAL {total}</small></div>
  </>;
}
