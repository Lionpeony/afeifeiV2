/* 我喜欢的音乐 · 原型 .page.likes（账号红心 + 本机红心） */
import { useEffect, useState } from "react";
import type { RemoteTrack } from "../../../../contracts/capability.js";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subscribeLikes, toggleLike } from "../../../domain/likes/index.js";
import { getAccountLikes, isAccountLiked, subscribe as subscribeAccountLikes } from "../../../domain/account-likes/index.js";
import { useAccountBundle, type AccountBundle } from "../../account-data.js";
import { useAf } from "../context.js";
import { likedEmptyCopy } from "../copy.js";
import { TrackArt } from "../art.js";
import { IconHeart, IconHeartFill, IconPickOutline, IconPlay } from "../icons.js";
import { EmptySetlist, Tape } from "../ui.js";

export interface LikedPageProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  account(): Promise<AccountBundle>;
  onPlayRemote(sourceId: string, track: RemoteTrack, list?: RemoteTrack[]): void;
  onUnlike(sourceId: string, songId: string): Promise<void>;
  tabs?: React.ReactNode;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const fmtDur = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

export function LikedPage(props: LikedPageProps) {
  const af = useAf();
  const acct = useAccountBundle(props.account, "liked");
  const [, setLikeRev] = useState(0);
  const [, setLibRev] = useState(0);
  useEffect(() => subscribeAccountLikes(() => setLikeRev((r) => r + 1)), []);
  useEffect(() => subscribeLikes(() => setLikeRev((r) => r + 1)), []);
  useEffect(() => subscribeLibrary(() => setLibRev((r) => r + 1)), []);

  const likeState = getAccountLikes();
  const acctSongs =
    likeState.status === "ready" ? acct.songs.filter((t) => isAccountLiked(t.sourceId)) : acct.songs;
  const localLiked = getTracks().filter((t) => getLikes().has(t.id));
  const total = acctSongs.length + localLiked.length;

  return (
    <div className="page likes" data-screen-label="我喜欢的音乐">
      <div className="likes__head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>MY FAVORITES · {total} 首</div>
          <h1 className="display">我喜欢的<span className="marker">音乐</span></h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 440 }}>
            盖过拨片印记的歌都会落在这儿，最新的在最上面。账号红心与本机红心分两段列出。
          </p>
          {props.tabs}
        </div>
        <div className="likes__stat">
          <b className="num">{total}</b>
          <span>首被我标记过</span>
        </div>
      </div>

      {acct.hint ? <p className="lib-note">{acct.hint}</p> : null}
      {acct.error ? <p className="lib-note">{acct.error}</p> : null}

      {total === 0 && !acct.loading ? (
        <div style={{ maxWidth: 520, marginTop: 8 }}>
          <EmptySetlist title={likedEmptyCopy(af.palette).title} sub={likedEmptyCopy(af.palette).sub} cta={likedEmptyCopy(af.palette).cta} onGo={() => af.setPage("online")} />
        </div>
      ) : (
        <div className="paper likes__sheet">
          <Tape w={76} rot={-2.6} style={{ top: -11, left: 40 }} />
          <div className="likes__sheet-head">
            <span className="eyebrow">TAPE SIDE A · 手写目录</span>
            <button className="btn btn-primary btn-sm" disabled={!acctSongs[0] && !localLiked[0]} onClick={() => {
              if (acctSongs[0]) { props.onPlayRemote(acct.sourceId, acctSongs[0], acctSongs); af.openPlayer(); }
              else if (localLiked[0]) { props.onPlayGroup(localLiked, 0); af.openPlayer(); }
            }}>
              <IconPlay size={13} />全部播放
            </button>
          </div>

          <div className="tbl">
            <div className="tbl__head">
              <span className="tbl__c-no">#</span>
              <span className="tbl__c-title">TITLE</span>
              <span className="tbl__c-artist">ARTIST</span>
              <span className="tbl__c-album">ALBUM</span>
              <span className="tbl__c-time">TIME</span>
            </div>

            {acctSongs.map((t, i) => (
              <div key={"a" + t.sourceId + i} className="tbl__row" role="button" tabIndex={0} onClick={() => { props.onPlayRemote(acct.sourceId, t, acctSongs); af.openPlayer(); }} onKeyDown={(e) => { if (e.key === "Enter") { props.onPlayRemote(acct.sourceId, t, acctSongs); af.openPlayer(); } }}>
                <span className="tbl__c-no num">{pad(i + 1)}</span>
                <span className="tbl__c-title">
                  {t.coverUrl ? <img className="tbl__cover" src={t.coverUrl} alt="" referrerPolicy="no-referrer" /> : <TrackArt id={t.sourceId} size={34} radius={4} />}
                  <span className="tbl__title-text"><span className="tbl__name truncate">{t.title}</span></span>
                  <span className="tbl__badge">账号</span>
                </span>
                <span className="tbl__c-artist truncate">{t.artist}</span>
                <span className="tbl__c-album truncate">{t.album}</span>
                <span className="tbl__c-time">
                  <button className="tbl__heart is-on" title="从账号红心移除" onClick={(e) => { e.stopPropagation(); void props.onUnlike(acct.sourceId, t.sourceId).catch(() => undefined); }}>
                    <IconHeartFill size={14} />
                  </button>
                  <span className="num">{fmtDur(t.durationMs)}</span>
                </span>
              </div>
            ))}

            {localLiked.map((t, i) => (
              <div key={"l" + t.id} className="tbl__row" role="button" tabIndex={0} onClick={() => { props.onPlayGroup(localLiked, i); af.openPlayer(); }} onKeyDown={(e) => { if (e.key === "Enter") { props.onPlayGroup(localLiked, i); af.openPlayer(); } }}>
                <span className="tbl__c-no num">{pad(acctSongs.length + i + 1)}</span>
                <span className="tbl__c-title">
                  <TrackArt id={t.id} size={34} radius={4} />
                  <span className="tbl__title-text"><span className="tbl__name truncate">{t.title}</span></span>
                  <span className="tbl__badge">本地</span>
                </span>
                <span className="tbl__c-artist truncate">{t.artist}</span>
                <span className="tbl__c-album truncate">{t.album}</span>
                <span className="tbl__c-time">
                  <button className="tbl__heart is-on" title="取消红心" onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }}>
                    <IconHeart size={14} />
                  </button>
                  <span className="num">{fmtDur(t.durationMs)}</span>
                </span>
              </div>
            ))}
          </div>
          {acct.loading ? <div className="search-busy"><span className="hand">正在取账号红心……</span></div> : null}
        </div>
      )}

      <div className="likes__foot row gap8">
        <IconPickOutline size={13} style={{ color: "var(--coral)" }} />
        <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>红心和底部播放栏是连在一起的，取消就真的取消了。</span>
      </div>
    </div>
  );
}
