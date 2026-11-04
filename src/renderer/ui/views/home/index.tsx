import { useEffect, useRef, useState } from "react";
import type { RemoteTrack } from "../../../../contracts/capability.js";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subscribeLikes } from "../../../domain/likes/index.js";
import { getHistory, subscribe as subscribeHistory } from "../../../domain/history/index.js";
import {
  dailyPicks,
  dailySeed,
  nextRefreshMs,
  radioOf,
  recentAdds,
  recentPlayed,
} from "../../../domain/recommend/index.js";
import { bumpSalt, getSalt, subscribe as subscribeSalt } from "../../../domain/recommend/salt.js";
import { onTick } from "../../compositor.js";
import type { PageId } from "../../pages.js";
import { PageHead } from "../../PageHead.js";
import { fmtDuration } from "../library/rows.js";

/**
 * 首页推荐的两种来源：
 * - 账号（R1）：登录后拿的是账号的每日推荐——**跟你在网易云看到的是同一份**；
 * - 本地（降级）：没登录 / 这个源没有账号能力时，用红心 + 最近播放 + 曲库洗牌。
 * 两份数据形状不同（RemoteTrack vs Track），所以 bill 行分两处渲染，不硬凑一个模型。
 */
export interface DailyBundle {
  sourceId: string;
  songs: RemoteTrack[];
  /** 有账号能力但没登录时的一句话；没有就 null */
  hint: string | null;
}

export interface HomeViewProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  cover(id: string, path: string): Promise<string | null>;
  onGo(page: PageId): void;
  /** 账号每日推荐。空 songs + 有 hint = 未登录；抛错 = 网络/上游，界面显示人话。 */
  daily(): Promise<DailyBundle>;
  onPlayRemote(sourceId: string, track: RemoteTrack): void;
}

/**
 * 距下次 06:00 换新。
 * 时间只从合成器的 onTick 来（I1：ui 不许自己起定时器），文本没变就不碰 DOM，
 * 每秒最多一次写入，逐帧比对只是拼个字符串。
 */
function Countdown() {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      onTick(() => {
        const total = Math.floor(nextRefreshMs() / 1000);
        const text = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
          .map((n) => String(n).padStart(2, "0"))
          .join(":");
        if (el.current && el.current.textContent !== text) el.current.textContent = text;
      }),
    [],
  );
  return <span ref={el}>--:--:--</span>;
}

/** 小封面：加载走 Services.cover 的缓存，失败就留空框，不占位不闪 */
function Tile({
  track,
  cover,
  onClick,
}: {
  track: Track;
  cover: (id: string, path: string) => Promise<string | null>;
  onClick(): void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const coverFn = useRef(cover);
  coverFn.current = cover;

  useEffect(() => {
    let alive = true;
    void coverFn
      .current(track.id, track.path)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [track.id, track.path]);

  return (
    <button type="button" className="home-tile" onClick={onClick} title={`${track.title} — ${track.artist}`}>
      <span className="im" style={url ? { backgroundImage: `url("${url}")` } : undefined} />
      <b>{track.title}</b>
      <span>{track.artist}</span>
    </button>
  );
}

/**
 * 首页 · 每日推荐（ref pages-v11/02-home）：
 * 上：今日 30 首（左封面 / 中节目单 / 右动作），下：三栏次级卡片。
 *
 * 推荐优先用账号的（登录后与网易云一致），拿不到才退回本地算法。
 */
export function HomeView({ onPlayGroup, cover, onGo, daily, onPlayRemote }: HomeViewProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  // 曲库/红心/历史都是外部状态，任一变化就整体重算（三个信号本来就被同一份推荐吃掉）
  const [, setRev] = useState(0);
  const bump = (): void => setRev((r) => r + 1);
  const coverFn = useRef(cover);
  coverFn.current = cover;

  // 账号推荐只在挂载时拉一次：切页回来重拉会多打一次接口，而它一天才换一份
  const [acct, setAcct] = useState<{ sourceId: string; songs: RemoteTrack[] } | null>(null);
  const [acctNote, setAcctNote] = useState<string | null>(null);
  const dailyFn = useRef(daily);
  dailyFn.current = daily;

  useEffect(() => {
    let alive = true;
    void dailyFn
      .current()
      .then((bundle) => {
        if (!alive) return;
        setAcct(bundle.songs.length > 0 ? { sourceId: bundle.sourceId, songs: bundle.songs } : null);
        setAcctNote(bundle.songs.length > 0 ? null : bundle.hint);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setAcct(null);
        setAcctNote(err instanceof Error ? err.message : "取账号推荐失败");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => subscribeLibrary(bump), []);
  useEffect(() => subscribeLikes(bump), []);
  useEffect(() => subscribeHistory(bump), []);
  useEffect(() => subscribeSalt(bump), []);

  const tracks = getTracks();
  const recent = getHistory().map((e) => e.trackId);
  const seed = dailySeed() + getSalt();
  const picks = dailyPicks({ tracks, liked: getLikes(), recent, seed });
  const adds = recentAdds(tracks, 3);
  const played = recentPlayed(tracks, recent, 3);
  const radio = radioOf(tracks, seed);

  const online = acct?.songs ?? [];
  const onlineMode = online.length > 0;
  const opening = picks[0];
  const heroCover = onlineMode ? (online[0]?.coverUrl ?? null) : coverUrl;

  useEffect(() => {
    let alive = true;
    if (onlineMode || !opening) {
      setCoverUrl(null);
      return;
    }
    void coverFn
      .current(opening.id, opening.path)
      .then((u) => {
        if (alive) setCoverUrl(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [onlineMode, opening?.id, opening?.path]);

  const playAll = (startAt = 0): void => {
    if (onlineMode && acct) {
      const first = online[startAt] ?? online[0];
      if (first) onPlayRemote(acct.sourceId, first);
      return;
    }
    if (picks.length > 0) onPlayGroup(picks, startAt);
  };

  return (
    <section className="home">
      <PageHead
        title="每日推荐"
        desc={
          onlineMode
            ? "这一份来自你的账号——与网易云里的每日推荐是同一份，每天 06:00 换新。"
            : "每天 06:00，按你的红心与最近播放重新排 30 首——这里按倾听顺序排好。"
        }
        extra={
          <div className="next-up">
            <b>
              T-<Countdown />
            </b>
            DAILY {onlineMode ? online.length : picks.length} · {onlineMode ? "ACCOUNT" : `NO.${seed % 1000}`}
          </div>
        }
      />

      <section className="home-hero">
        <div className="home-prog">
          <div className="frame">
            <span className="today">今日 {onlineMode ? online.length : picks.length} 首</span>
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner br" />
            <span className="corner bl" />
            <div className="art" style={heroCover ? { backgroundImage: `url("${heroCover}")` } : undefined} />
          </div>
          <div className="cap">
            <span>
              OPENING · {onlineMode ? (online[0]?.title ?? "空") : opening ? opening.title : "空"}
            </span>
            <span>{onlineMode ? (online[0]?.artist ?? "—") : opening ? opening.artist : "—"}</span>
          </div>
        </div>

        <div className="home-bill">
          <div className="bill-thead">
            <span>序号 / 曲目 / 艺人</span>
            <span>时长</span>
          </div>
          <div className="bill-rows">
            {onlineMode
              ? online.map((track, i) => (
                  <button
                    type="button"
                    key={`${track.sourceId}-${i}`}
                    className="prow"
                    onClick={() => acct && onPlayRemote(acct.sourceId, track)}
                    title={`${track.title} — ${track.artist}`}
                  >
                    <span className="no">{String(i + 1).padStart(2, "0")}</span>
                    <span className="t">
                      {track.title}
                      <small>{track.artist}</small>
                    </span>
                    <time>{fmtDuration(track.durationMs)}</time>
                  </button>
                ))
              : picks.map((track, i) => (
                  <button
                    type="button"
                    key={track.id}
                    className="prow"
                    onClick={() => playAll(i)}
                    title={`${track.title} — ${track.artist}`}
                  >
                    <span className="no">{String(i + 1).padStart(2, "0")}</span>
                    <span className="t">
                      {track.title}
                      <small>{track.artist}</small>
                    </span>
                    <time>{fmtDuration(track.durationMs)}</time>
                  </button>
                ))}
            {!onlineMode && picks.length === 0 ? (
              <p className="lib-empty">曲库还是空的，先去「本地」扫一个文件夹。</p>
            ) : null}
          </div>
          <div className="bill-end">
            <span>END OF DAILY {onlineMode ? online.length : picks.length}</span>
            <span>{acctNote ?? (onlineMode ? "来自你的账号" : "生成于 06:00 · 换一批请点右侧")}</span>
          </div>
        </div>

        <div className="home-side">
          <button
            type="button"
            className="btn primary go"
            onClick={() => playAll(0)}
            disabled={onlineMode ? online.length === 0 : picks.length === 0}
          >
            <i className="tb-ic ic-play">
              <i />
            </i>
            播放今日
          </button>
          <button type="button" className="btn swap" onClick={() => bumpSalt()} disabled={onlineMode}>
            换一批
          </button>
          <p className="note">
            <b>这是什么：</b>
            {onlineMode
              ? "网易云按你账号的口味算的今日推荐，本地不参与排序。点任一首直接在线播放。"
              : "你的每日推荐。来源是红心、最近播放顺序和曲库本身——没有猜你喜欢那套黑箱，同一天永远是同一份，明天 06:00 自动换新。"}
          </p>
          <span className="folio">{String(new Date().getDate()).padStart(2, "0")}</span>
        </div>
      </section>

      <section className="home-deck">
        <div>
          <h3>
            最近添加<span>RECENT · {adds.length}</span>
          </h3>
          <div className="strip">
            {adds.map((track) => (
              <Tile key={track.id} track={track} cover={cover} onClick={() => onPlayGroup(adds, adds.indexOf(track))} />
            ))}
            {adds.length === 0 ? <p className="deck-empty">还没有新歌</p> : null}
          </div>
        </div>

        <div>
          <h3>
            最近播放<span>
              <button type="button" className="link" onClick={() => onGo("recent")}>
                全部 →
              </button>
            </span>
          </h3>
          <div className="strip">
            {played.map((track) => (
              <Tile key={track.id} track={track} cover={cover} onClick={() => onPlayGroup(played, played.indexOf(track))} />
            ))}
            {played.length === 0 ? <p className="deck-empty">还没听过歌</p> : null}
          </div>
        </div>

        <div>
          <h3>
            本地电台<span>FM · LOCAL</span>
          </h3>
          {radio ? (
            <button type="button" className="rad" onClick={() => onPlayGroup(radio.tracks, 0)}>
              <span className="fm">
                FM 91.2 · {radio.artist} 专场
                <span className="waves">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
              <b>{radio.tracks[0]?.title ?? "—"}</b>
              <span>{radio.tracks.length} 首连播，按这位艺人的曲库串起来</span>
            </button>
          ) : (
            <p className="deck-empty">曲库里还没有哪位艺人够 3 首</p>
          )}
        </div>
      </section>
    </section>
  );
}
