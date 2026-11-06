import type { CSSProperties } from "react";
import type { RemoteTrack } from "../../../../contracts/capability.js";

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

interface Props {
  /** 右栏抬头：看的是哪个歌单 */
  name: string;
  /** 抬头右侧的 mono 注：「42 首 · 网易云音乐」 */
  meta: string;
  /** 收藏动作；undefined = 这张不可收藏（无选中 / 跨源收藏项） */
  save?: { on: boolean; run(): void };
  tracks: RemoteTrack[];
  busy: boolean;
  nextPage?: number;
  /** 没有曲目时的一句话（「左边选一个歌单」/「这个歌单是空的」） */
  empty: string;
  /** list = 整张歌单：点哪首就从哪首开始（队列 = 这张歌单） */
  onPlay(track: RemoteTrack, list: RemoteTrack[]): void;
  onMore(): void;
}

/**
 * 右栏曲目表：和榜单页同一套骨架（序号 + 封套 + 四列），
 * 区别只是歌单从 01 连续排，没有前三名台柱——歌单的名次不是信息，曲序才是。
 */
export function TrackList({ name, meta, save, tracks, busy, nextPage, empty, onPlay, onMore }: Props) {
  return (
    <div className="lib-list">
      {name ? (
        <p className="list-now">
          <b>{name}</b>
          <span>{meta}</span>
          {/* 收藏跟着「正在看的这张」走：左栏 240px 里放不下一个有尺寸的按钮 */}
          {save ? (
            <button type="button" className={`now-act${save.on ? " on" : ""}`} onClick={save.run}>
              {save.on ? "已收藏 · 取消" : "收藏到我的歌单"}
            </button>
          ) : null}
        </p>
      ) : null}

      {/* 取曲目期间摆骨架行：只留一句「取曲目中…」会被读成卡死 */}
      {busy && tracks.length === 0 ? (
        <div className="online-skel" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="sk-row" key={i} style={{ "--i": i } as CSSProperties}>
              <span className="sk-bar t" />
              <span className="sk-bar a" />
              <span className="sk-bar d" />
            </div>
          ))}
        </div>
      ) : null}

      {tracks.length > 0 ? (
        <div className="lib-thead online-thead playlists-thead">
          <span className="th-no">#</span>
          <span className="th-cover" aria-hidden="true" />
          <span className="th-title">TITLE</span>
          <span className="th-a">ARTIST</span>
          <span className="th-b">ALBUM</span>
          <span className="th-dur">TIME</span>
        </div>
      ) : null}

      {/* 行是真按钮：行内没有别的可点元素（不像在线页要放下载勾选），
          键盘与读屏都走原生语义，不用 role="button" 手搓一遍 */}
      {tracks.map((track, i) => (
        <button
          key={track.sourceId}
          type="button"
          className="lib-row online-row"
          onClick={() => onPlay(track, tracks)}
          title={`${track.title} — ${track.artist}`}
        >
          <span className="lib-no">{pad(i + 1)}</span>
          <span className="row-cover">
            {track.coverUrl ? (
              <img
                src={track.coverUrl}
                alt=""
                width={34}
                height={34}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : (
              <i aria-hidden="true" />
            )}
          </span>
          <span className="lib-title">{track.title}</span>
          <span className="lib-artist">{track.artist}</span>
          <span className="lib-artist">{track.album}</span>
          <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
        </button>
      ))}

      {nextPage !== undefined ? (
        <button type="button" className="pl-more" disabled={busy} onClick={onMore}>
          {busy ? "加载中…" : "加载更多"}
        </button>
      ) : null}

      {tracks.length === 0 && !busy ? <p className="lib-empty">{empty}</p> : null}
    </div>
  );
}
