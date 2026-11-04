import { useEffect, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { isLiked, subscribe as subscribeLikes, toggleLike } from "../../../domain/likes/index.js";
import { peekCover } from "../../../domain/library/cover.js";
import { albumKeyOf, artistNameOf } from "../../../domain/library/group.js";
import { setFocus } from "../../library-focus.js";

/** 封面按需加载：只有真的渲染到这一行才去请求。（从 index.tsx 抽出，三视图共用） */
export function Cover({
  id,
  path,
  hasCover,
  load,
}: {
  id: string;
  path: string;
  hasCover: boolean;
  load: (id: string, path: string) => Promise<string | null>;
}) {
  const [state, setState] = useState(() => {
    const hit = peekCover(id);
    return hit === undefined ? { loaded: false, url: null as string | null } : { loaded: true, url: hit };
  });

  useEffect(() => {
    if (state.loaded || !hasCover) return;
    let alive = true;
    void load(id, path).then((url) => {
      if (alive) setState({ loaded: true, url });
    });
    return () => {
      alive = false;
    };
  }, [id, path, hasCover, load, state.loaded]);

  if (state.url) return <img className="lib-cover" src={state.url} alt="" />;
  return <span className="lib-cover lib-cover--empty" aria-hidden="true" />;
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/**
 * 分组视图的曲目行（专辑/歌手详情共用）。**不做虚拟化**——单个专辑/歌手的曲目数
 * 有界（几十到几百行），虚拟化的复杂度不值得；5000 行级别的滚动只发生在列表视图。
 */
export function TrackRows({
  tracks,
  onPlayTrack,
  cover,
}: {
  tracks: Track[];
  onPlayTrack(track: Track): void;
  cover(id: string, path: string): Promise<string | null>;
}) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeLikes(() => setTick((t) => t + 1)), []);

  return (
    <>
      {tracks.map((track) => (
        <div
          key={track.id}
          className="lib-row"
          style={{ height: 38 }}
          onClick={() => onPlayTrack(track)}
          title={track.missing ? `${track.path}（文件已不在）` : track.path}
        >
          <Cover id={track.id} path={track.path} hasCover={track.hasCover} load={cover} />
          <span className="lib-title">
            {track.title}
            {track.missing ? <em className="lib-missing">缺失</em> : null}
          </span>
          {/* 歌手名就是入口（M11）：点它跳歌手页，不跳就不该长得跟正文一样 */}
          <button
            type="button"
            className="lib-artist lib-link"
            title={`查看歌手：${artistNameOf(track)}`}
            onClick={(e) => {
              e.stopPropagation();
              setFocus({ kind: "artist", artist: artistNameOf(track) });
            }}
          >
            {artistNameOf(track)}
          </button>
          <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
          <button
            type="button"
            className={`lib-like${isLiked(track.id) ? " on" : ""}`}
            aria-label={isLiked(track.id) ? "取消收藏" : "收藏"}
            onClick={(e) => {
              e.stopPropagation();
              toggleLike(track.id);
            }}
          >
            ♥
          </button>
        </div>
      ))}
    </>
  );
}
