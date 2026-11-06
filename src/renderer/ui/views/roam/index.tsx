import { useEffect, useRef, useState } from "react";
import type { RemoteTrack } from "../../../../contracts/capability.js";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subscribeLikes } from "../../../domain/likes/index.js";
import {
  addDislike,
  getDislikes,
  hasDislike,
  remoteDislikeKey,
  subscribe as subscribeDislikes,
} from "../../../domain/dislikes/index.js";
import { getHistory, subscribe as subscribeHistory } from "../../../domain/history/index.js";
import { getState, remoteTrackId, subscribe as subscribeKernel } from "../../../kernel/index.js";
import { dailyPicks, dailySeed, reasonOf, shuffledBy } from "../../../domain/recommend/index.js";
import { cardSource } from "../../../domain/recommend/roam-card.js";
import { bumpSalt, getSalt, subscribe as subscribeSalt } from "../../../domain/recommend/salt.js";
import { useAccountBundle, type AccountBundle } from "../../account-data.js";
import { PageHead } from "../../PageHead.js";
import { fmtDuration } from "../library/rows.js";

export interface RoamViewProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  /** 账号漫游（个人 FM）。有数据就整页走账号，没有才退回本地抽签。 */
  account(): Promise<AccountBundle>;
  /**
   * list = 这一批 FM：收下一首要能顺着批次往下播，不能只播一首。
   * stream = 无限流标记：这批放完由 bootstrap 再要一批接上。
   */
  onPlayRemote(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], stream?: boolean): void;
  /** 上报「少推这首」给在线源（B-11）。失败返回 false，本地名单照样生效。 */
  onReportDislike(sourceId: string, songId: string): Promise<boolean>;
  cover(id: string, path: string): Promise<string | null>;
}

interface Draw {
  key: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  why: string;
  kept: boolean;
  /** 在线抽到的：收下就走 playRemote（不进本地队列） */
  remote?: { sourceId: string; track: RemoteTrack };
  /** 本地抽到的：收下才需要 queue */
  local?: Track;
}

/**
 * 漫游（ref pages-v11/07-roam）：抽签式听歌。
 *
 * 登录后抽的是**账号的个人 FM**（网易云按你的口味推的流），
 * 没登录才退回本地那套"今日推荐洗牌 + 抽签"。
 * 两种模式的差别只在牌堆来源，抽签/收下/记录的交互完全一样。
 */
export function RoamView({ onPlayGroup, account, onPlayRemote, onReportDislike, cover }: RoamViewProps) {
  const [, setRev] = useState(0);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [dislikeNote, setDislikeNote] = useState("");
  const coverFn = useRef(cover);
  coverFn.current = cover;
  const acct = useAccountBundle(account, "fm");

  const bump = (): void => setRev((r) => r + 1);
  useEffect(() => subscribeLibrary(bump), []);
  useEffect(() => subscribeLikes(bump), []);
  useEffect(() => subscribeHistory(bump), []);
  useEffect(() => subscribeSalt(bump), []);
  useEffect(() => subscribeDislikes(bump), []);
  // 收下之后牌面要跟着队列走（播到第几首就显示第几首），所以得订阅播放状态
  useEffect(() => subscribeKernel(bump), []);

  const tracks = getTracks();
  const liked = getLikes();
  const recent = getHistory().map((e) => e.trackId);
  const seed = dailySeed() + getSalt();

  // 本地牌堆：每日推荐优先，切牌时按新种子重洗；抽完一轮再洗
  const deck = dailyPicks({ tracks, liked, recent, seed, count: 30, disliked: getDislikes() });
  // 在线牌堆：FM 给的一批按顺序翻，翻完让用户点「再要一批」；不喜欢名单先摘掉
  const fm = acct.songs.filter((t) => !hasDislike(remoteDislikeKey(acct.sourceId, t.sourceId)));
  const onlineMode = acct.songs.length > 0;
  const drawnOnline = draws.filter((d) => d.remote).length;

  /**
   * 正在播的那一档（必须是本页这批 FM）：收下之后队列就是这条流，
   * 牌面要跟着它走 —— 否则播到第 2 首了卡片还停在第 1 抽，看着像没反应。
   */
  const playingTrack = (() => {
    const st = getState();
    if (!st.queue.stream || st.queue.stream.sourceId !== acct.sourceId) return null;
    const id = st.player.trackId;
    if (!id) return null;
    return fm.find((t) => remoteTrackId(acct.sourceId, t.sourceId) === id) ?? null;
  })();

  const drawn = draws[draws.length - 1];
  // 优先级在 domain 里定（先抽牌、再播放、最后兜底），这里只按结果取数据
  const source = cardSource(drawn, playingTrack);
  const fromStream = source === "playing";
  const current: Draw | undefined =
    source === "playing" && playingTrack
      ? {
          key: `play:${playingTrack.sourceId}`,
          title: playingTrack.title,
          artist: playingTrack.artist,
          album: playingTrack.album,
          durationMs: playingTrack.durationMs,
          why: "正在播放这一批 FM，播完会自动续下一批",
          kept: true,
          remote: { sourceId: acct.sourceId, track: playingTrack },
        }
      : drawn;

  const draw = (): void => {
    if (onlineMode) {
      const track = fm[drawnOnline % fm.length];
      if (!track) return;
      setDraws((prev) => [
        ...prev,
        {
          key: `r:${track.sourceId}:${prev.length}`,
          title: track.title,
          artist: track.artist,
          album: track.album,
          durationMs: track.durationMs,
          why: "当前账号按你的口味推的，不是本地曲库抽的",
          kept: false,
          remote: { sourceId: acct.sourceId, track },
        },
      ]);
      return;
    }

    // 再过一遍名单：刚点「不喜欢」时 React 还没重渲染，deck 是上一份
    const pool = (deck.length > 0 ? deck : shuffledBy(tracks, seed)).filter((t) => !hasDislike(t.id));
    if (pool.length === 0) return;
    // 尽量不重复抽同一首：先挑还没出现过的，抽干了才允许重样
    const seen = new Set(draws.map((d) => d.local?.id).filter(Boolean));
    const fresh = pool.filter((t) => !seen.has(t.id));
    const list = fresh.length > 0 ? fresh : pool;
    const track = list[Math.floor(Math.random() * list.length)];
    setDraws((prev) => [
      ...prev,
      {
        key: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationMs: track.durationMs,
        why: reasonOf(track, tracks, liked, recent),
        kept: false,
        local: track,
      },
    ]);
  };

  useEffect(() => {
    let alive = true;
    if (!current) {
      setCoverUrl(null);
      return;
    }
    if (current.remote?.track.coverUrl) {
      setCoverUrl(current.remote.track.coverUrl);
      return;
    }
    if (!current.local) {
      setCoverUrl(null);
      return;
    }
    void coverFn
      .current(current.local.id, current.local.path)
      .then((u) => {
        if (alive) setCoverUrl(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [current?.key]);

  const keep = (): void => {
    if (!current) return;
    setDraws((prev) => prev.map((d, i) => (i === prev.length - 1 ? { ...d, kept: true } : d)));
    if (current.remote) {
      // 队列 = 这一批 FM，从收下的这首开始；stream 让这批放完自动续下一批（FM 是无尽流）
      onPlayRemote(current.remote.sourceId, current.remote.track, fm, true);
      return;
    }
    if (!current.local) return;
    onPlayGroup([current.local, ...deck.filter((t) => t.id !== current.local?.id)], 0);
  };

  /**
   * 不喜欢（B-11）：先记名单、再换下一首。
   * 本地和在线都靠名单过滤；在线额外尽力上报一次，失败也要说清"只在本机生效"。
   */
  const dislikeCurrent = async (): Promise<void> => {
    if (!current) return;
    const remote = current.remote;
    const key = remote ? remoteDislikeKey(remote.sourceId, remote.track.sourceId) : current.local?.id;
    if (!key) return;
    addDislike(key);
    setDislikeNote("已记下，本机以后不再抽到这首。");
    if (remote) {
      const ok = await onReportDislike(remote.sourceId, remote.track.sourceId).catch(() => false);
      setDislikeNote(ok ? "已告诉上游少推这首。" : "本机已记下；没通知到上游，仍按本机名单过滤。");
    }
    draw();
  };

  /** 重洗：在线就是再要一批 FM，本地就是换副牌 */
  const reshuffle = (): void => {
    setDraws([]);
    if (onlineMode) {
      acct.reload();
      return;
    }
    bumpSalt();
  };

  const keptCount = draws.filter((d) => d.kept).length;
  const keptArtists = [...new Set(draws.filter((d) => d.kept).map((d) => d.artist))];

  return (
    <section className="roam">
      <PageHead
        title="漫游"
        desc={
          onlineMode
            ? "牌堆来自当前账号的个人 FM——按你的口味推的流，这里一张一张翻。"
            : "让机器挑，你只负责点头或摇头。抽的是什么，卡片上写清为什么是它。"
        }
        meta={`DRAWN · ${draws.length}`}
        extra={
          <div className="next-up">
            <b>
              {keptCount} / {draws.length}
            </b>
            收下 / 抽到
          </div>
        }
      />

      <div className="roam-body">
        <div className="dial">
          <div className={current ? "vin on" : "vin"}>
            <span className="ring" />
            <span className="needle" />
            <div className="art" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined} />
            <span className="pin" />
          </div>
          <span className="dial-cap">
            ROAM · {onlineMode ? "账号 FM" : "本地牌堆"}，抽一首，点「收下」开始听
          </span>
        </div>

        <div className="picked">
          {current ? (
            <>
              <span className="kick">
                {fromStream ? "正在播放" : `本轮第 ${Math.max(draws.length, 1)} 抽`} ·{" "}
                {fmtDuration(current.durationMs)}
              </span>
              <h2>{current.title}</h2>
              <p className="who">
                {current.artist}
                <em>{current.album || "未知专辑"}</em>
              </p>
              <p className="why">
                <b>为什么是它</b>
                {current.why}
              </p>
              <div className="acts">
                <button type="button" className="btn primary" onClick={keep} disabled={current.kept}>
                  {current.kept ? "正在听" : "收下 · 开始听"}
                </button>
                <button type="button" className="btn" onClick={draw} disabled={onlineMode && drawnOnline >= fm.length}>
                  换一首
                </button>
                <button type="button" className="btn ghost" onClick={() => void dislikeCurrent()}>
                  不喜欢 · 少推
                </button>
                <button type="button" className="btn ghost" onClick={reshuffle}>
                  {onlineMode ? "再要一批" : "重洗这副牌"}
                </button>
              </div>
              {dislikeNote ? <p className="deck-empty">{dislikeNote}</p> : null}
              {onlineMode && drawnOnline >= fm.length ? (
                <p className="deck-empty">这一批抽完了，点「再要一批」让当前账号再推一轮。</p>
              ) : null}
            </>
          ) : (
            <>
              <span className="kick">ROAM · 待发车</span>
              <h2>还没抽第一张</h2>
              <p className="who">
                {onlineMode ? `账号 FM 共 ${fm.length} 首` : `曲库 ${tracks.length} 首`}
                <em>{onlineMode ? "翻完点「再要一批」" : "今日推荐优先，抽过的这一轮不重样"}</em>
              </p>
              <p className="why">
                <b>怎么抽</b>
                {onlineMode
                  ? "当前账号按你的口味给一批，这里按顺序一张一张翻；收下就直接播。"
                  : "今天的推荐单洗成一副牌，一张一张翻；翻完一轮才重洗。红心曲目在牌堆里更靠前。"}
              </p>
              <div className="acts">
                <button
                  type="button"
                  className="btn primary"
                  onClick={draw}
                  disabled={onlineMode ? fm.length === 0 : tracks.length === 0}
                >
                  抽第一张
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="draws">
          <h3>
            本轮记录<span>
              {draws.length} 抽 · 收 {keptCount}
            </span>
          </h3>
          <div className="list">
            {draws
              .slice()
              .reverse()
              .map((d, i) => (
                <div className={d.kept ? "dr kept" : "dr"} key={`${d.key}-${draws.length - i}`}>
                  <span className="t">{d.title}</span>
                  <span className="a">{d.artist}</span>
                  <span className="s">{d.kept ? "已收" : "略过"}</span>
                </div>
              ))}
            {draws.length === 0 ? <p className="deck-empty">还没有记录</p> : null}
          </div>
          <p className="stat">
            {keptArtists.length > 0 ? `收下的来自 ${keptArtists.slice(0, 3).join(" / ")}` : "收下后这里会记下口味偏向"}
          </p>
        </aside>
      </div>
    </section>
  );
}
