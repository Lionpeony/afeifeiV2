import { useEffect, useRef, useState } from "react";
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
import { onTick } from "../../compositor.js";
import type { PageId } from "../../pages.js";
import { PageHead } from "../../PageHead.js";
import { fmtDuration } from "../library/rows.js";

export interface HomeViewProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  cover(id: string, path: string): Promise<string | null>;
  onGo(page: PageId): void;
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
 * 推荐不是"猜你喜欢"——没有推荐服务，信号只有红心、最近播放和曲库本身，
 * 算法在 domain/recommend（纯函数、当天可复现）。
 */
export function HomeView({ onPlayGroup, cover, onGo }: HomeViewProps) {
  const [salt, setSalt] = useState(0);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  // 曲库/红心/历史都是外部状态，任一变化就整体重算（三个信号本来就被同一份推荐吃掉）
  const [, setRev] = useState(0);
  const bump = (): void => setRev((r) => r + 1);
  const coverFn = useRef(cover);
  coverFn.current = cover;

  useEffect(() => subscribeLibrary(bump), []);
  useEffect(() => subscribeLikes(bump), []);
  useEffect(() => subscribeHistory(bump), []);

  const tracks = getTracks();
  const recent = getHistory().map((e) => e.trackId);
  const seed = dailySeed() + salt;
  const picks = dailyPicks({ tracks, liked: getLikes(), recent, seed });
  const opening = picks[0];
  const adds = recentAdds(tracks, 3);
  const played = recentPlayed(tracks, recent, 3);
  const radio = radioOf(tracks, seed);

  useEffect(() => {
    let alive = true;
    if (!opening) {
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
  }, [opening?.id, opening?.path]);

  const playAll = (startAt = 0): void => {
    if (picks.length > 0) onPlayGroup(picks, startAt);
  };

  return (
    <section className="home">
      <PageHead
        title="每日推荐"
        desc="每天 06:00，按你的红心与最近播放重新排 30 首——这里按倾听顺序排好。"
        extra={
          <div className="next-up">
            <b>
              T-<Countdown />
            </b>
            DAILY {picks.length} · NO.{seed % 1000}
          </div>
        }
      />

      <section className="home-hero">
        <div className="home-prog">
          <div className="frame">
            <span className="today">今日 {picks.length} 首</span>
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner br" />
            <span className="corner bl" />
            <div className="art" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined} />
          </div>
          <div className="cap">
            <span>{opening ? `OPENING · ${opening.title}` : "OPENING · 空"}</span>
            <span>{opening ? opening.artist : "—"}</span>
          </div>
        </div>

        <div className="home-bill">
          <div className="bill-thead">
            <span>序号 / 曲目 / 艺人</span>
            <span>时长</span>
          </div>
          <div className="bill-rows">
            {picks.map((track, i) => (
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
            {picks.length === 0 ? <p className="lib-empty">曲库还是空的，先去「本地」扫一个文件夹。</p> : null}
          </div>
          <div className="bill-end">
            <span>END OF DAILY {picks.length}</span>
            <span>生成于 06:00 · 换一批请点右侧</span>
          </div>
        </div>

        <div className="home-side">
          <button type="button" className="btn primary go" onClick={() => playAll(0)} disabled={picks.length === 0}>
            <i className="tb-ic ic-play">
              <i />
            </i>
            播放今日
          </button>
          <button type="button" className="btn swap" onClick={() => setSalt((s) => s + 1)}>
            换一批
          </button>
          <p className="note">
            <b>这是什么：</b>你的每日推荐。来源是红心、最近播放顺序和曲库本身——没有猜你喜欢那套黑箱，
            <b>同一天永远是同一份</b>，明天 06:00 自动换新。
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
