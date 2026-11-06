import { useEffect, useState } from "react";
import type { RemoteTrack } from "../../../../contracts/capability.js";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subscribeLikes, toggleLike } from "../../../domain/likes/index.js";
import {
  getAccountLikes,
  isAccountLiked,
  subscribe as subscribeAccountLikes,
} from "../../../domain/account-likes/index.js";
import { AccountBlock } from "../../AccountBlock.js";
import { useAccountBundle, type AccountBundle } from "../../account-data.js";
import { PageHead } from "../../PageHead.js";
import { TapeRail } from "../../live/TapeRail.js";
import { tapeProgram } from "../../../projection/room-program.js";
import { fmtDuration } from "../library/rows.js";

export interface LikedViewProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  /** 账号红心（A 方案：账号归账号、本地归本地，两栏各自完整，不做 id 合并） */
  account(): Promise<AccountBundle>;
  onPlayRemote(sourceId: string, track: RemoteTrack, list?: RemoteTrack[]): void;
  /** 取消账号红心；失败必须 reject，行才回得去 */
  onUnlike(sourceId: string, songId: string): Promise<void>;
}

const fmtTotal = (ms: number): string => {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} 小时 ${min % 60} 分` : `${min} 分`;
};

/**
 * 喜欢的音乐（ref pages-v11/08-liked）：红心登记簿。
 *
 * 稿子上有「收讫来源 / 收讫日」两列——那要记录每颗红心是哪天从哪个页面按下的，
 * 现在的 likes 只存 id 集合，没有这段历史，所以不编：换成真实的专辑列 + 艺人分布。
 */
export function LikedView({ onPlayGroup, account, onPlayRemote, onUnlike }: LikedViewProps) {
  const [, setRev] = useState(0);
  const [byAlbum, setByAlbum] = useState(false);
  const bump = (): void => setRev((r) => r + 1);
  const acct = useAccountBundle(account, "liked");

  /*
   * 账号红心的**唯一事实源**是域（播放条那颗心读的也是它）：
   * 页面只负责把域里的 id 套在详情上，取消红心后域一变，行自己就没了。
   * 域还没读完时不过滤——否则会把整页清空，闪一下再回来。
   */
  const [, setLikeRev] = useState(0);
  useEffect(() => subscribeAccountLikes(() => setLikeRev((r) => r + 1)), []);
  const likeState = getAccountLikes();
  const acctRows =
    likeState.status === "ready"
      ? {
          ...acct,
          songs: acct.songs.filter((t) => isAccountLiked(t.sourceId)),
          error: acct.error ?? (likeState.error ?? null),
        }
      : { ...acct, error: acct.error ?? (likeState.status === "error" ? likeState.error : null) };

  useEffect(() => subscribeLibrary(bump), []);
  useEffect(() => subscribeLikes(bump), []);

  const likes = getLikes();
  const tracks = getTracks();
  const kept = tracks.filter((t) => likes.has(t.id));
  const gone = likes.size - kept.length;
  const totalMs = kept.reduce((sum, t) => sum + (t.durationMs || 0), 0);

  // 艺人分布：不排序只列前三，替代稿子上编出来的「收讫来源」
  const byArtist = new Map<string, number>();
  for (const t of kept) byArtist.set(t.artist, (byArtist.get(t.artist) ?? 0) + 1);
  const topArtists = [...byArtist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const rows = byAlbum
    ? [...kept].sort((a, b) => a.album.localeCompare(b.album, "zh-Hans-CN") || a.artist.localeCompare(b.artist))
    : [...kept].sort((a, b) => a.mtimeMs - b.mtimeMs);
  // 喜欢只存 id 集合，没有收藏时间；归档带按文件入库时间说，口径写在带子下面
  const tape = kept.length ? tapeProgram(kept, Date.now(), "喜欢的音乐") : null;

  const play = (at: number): void => {
    if (rows.length > 0) onPlayGroup(rows, at);
  };

  return (
    <section className="liked">
      <PageHead
        title="喜欢的音乐"
        desc="上栏是当前账号的红心（与平台 App 同一份），下栏是本机曲库的红心——两套 id 不混在一起。"
        meta={`KEEPINGS · ${acct.songs.length + kept.length}`}
      />

      <AccountBlock
        title="账号红心"
        note="来自当前登录的账号。点行末那颗心可从账号移除（会同步到平台 App）。"
        state={acctRows}
        empty={
          likeState.countedEmpty
            ? "这个账号确实还没有红心（平台确认 0 首）。"
            : "这一栏是空的：要么刚把红心都取消了，要么还没读到。"
        }
        onPlay={onPlayRemote}
        onUnlike={onUnlike}
      />

      <div className="acct-div" />

      {tape ? (
        <TapeRail
          program={tape}
          note="按入库时间归档（红心本身没有记录收藏时间）"
          onPlay={(id) => play(rows.findIndex((track) => track.id === id))}
        />
      ) : null}

      <div className="ledger">
        <div className="keep">
          <span className="seal-h">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 13C4.8 10.8 2.9 8.9 2.9 6.7c0-1.6 1.2-2.8 2.7-2.8 1 0 1.9.5 2.4 1.4.5-.9 1.4-1.4 2.4-1.4 1.5 0 2.7 1.2 2.7 2.8 0 2.2-1.9 4.1-5.1 6.3z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </span>
          <span className="n">{kept.length}</span>
          <span className="u">
            <b>首红心</b>
            <br />
            共 {fmtTotal(totalMs)}
          </span>
        </div>

        <div className="div" />

        <div className="srcs">
          <span className="h">艺人分布</span>
          <div className="row">
            {topArtists.map(([artist, n]) => (
              <span className="src" key={artist}>
                {artist}
                <b>·{n}</b>
              </span>
            ))}
            {gone > 0 ? <span className="src alt">不在曲库 {gone}</span> : null}
            {topArtists.length === 0 && gone === 0 ? <span className="src alt">还没有红心</span> : null}
          </div>
        </div>
      </div>

      <div className="ops">
        <button type="button" className="btn primary" onClick={() => play(0)} disabled={rows.length === 0}>
          从第一张开始播
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => play(Math.floor(Math.random() * rows.length))}
          disabled={rows.length === 0}
        >
          抽一张听
        </button>
        <span className="sp" />
        <span className="order">
          排序 · <b>{byAlbum ? "按专辑" : "按文件时间"}</b>
        </span>
        <button type="button" className="sort" onClick={() => setByAlbum((v) => !v)}>
          切换排序
        </button>
      </div>

      <div className="reg">
        <div className="thead">
          <span>编号</span>
          <span />
          <span>曲目 / 艺人</span>
          <span>专辑</span>
          <span>时长</span>
        </div>
        <div className="rows">
          {rows.map((track, i) => (
            <div
              key={track.id}
              className="rr"
              role="button"
              tabIndex={0}
              onClick={() => play(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") play(i);
              }}
            >
              <span className="no">{String(i + 1).padStart(2, "0")}</span>
              <button
                type="button"
                className="hm"
                aria-label="取消红心"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLike(track.id);
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 13C4.8 10.8 2.9 8.9 2.9 6.7c0-1.6 1.2-2.8 2.7-2.8 1 0 1.9.5 2.4 1.4.5-.9 1.4-1.4 2.4-1.4 1.5 0 2.7 1.2 2.7 2.8 0 2.2-1.9 4.1-5.1 6.3z" />
                </svg>
              </button>
              <span className="tx">
                <b>{track.title}</b>
                <span>{track.artist}</span>
              </span>
              <span className="tag">{track.album || "—"}</span>
              <span className="du">{fmtDuration(track.durationMs)}</span>
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="lib-empty">还没有红心。去「本地」把喜欢的行点一下，它就会收到这里。</p>
          ) : null}
        </div>
        <div className="foot">
          <i />
          <span>
            共 {kept.length} 首
            {gone > 0 ? ` · 另有 ${gone} 首已不在曲库` : ""}
          </span>
          <i />
        </div>
      </div>
    </section>
  );
}
