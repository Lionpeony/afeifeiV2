import { useEffect, useRef, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subscribeLikes } from "../../../domain/likes/index.js";
import { getHistory, subscribe as subscribeHistory } from "../../../domain/history/index.js";
import { dailyPicks, dailySeed, reasonOf, shuffledBy } from "../../../domain/recommend/index.js";
import { PageHead } from "../../PageHead.js";
import { fmtDuration } from "../library/rows.js";

export interface RoamViewProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  cover(id: string, path: string): Promise<string | null>;
}

interface Draw {
  track: Track;
  why: string;
  kept: boolean;
}

/**
 * 漫游（ref pages-v11/07-roam）：抽签式听歌。
 *
 * 稿子右侧是唱词——漫游卡片还没开播，这时候拿不到歌词（歌词跟播放走），
 * 所以右边改成"本轮记录"：抽到过谁、收下没、这轮偏了哪些艺人。真实且有用。
 */
export function RoamView({ onPlayGroup, cover }: RoamViewProps) {
  const [, setRev] = useState(0);
  const [salt, setSalt] = useState(0);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const coverFn = useRef(cover);
  coverFn.current = cover;

  const bump = (): void => setRev((r) => r + 1);
  useEffect(() => subscribeLibrary(bump), []);
  useEffect(() => subscribeLikes(bump), []);
  useEffect(() => subscribeHistory(bump), []);

  const tracks = getTracks();
  const liked = getLikes();
  const recent = getHistory().map((e) => e.trackId);
  const seed = dailySeed() + salt;

  // 一副牌：每日推荐优先，切牌时按新种子重洗；抽完一轮再洗
  const deck = dailyPicks({ tracks, liked, recent, seed, count: 30 });
  const current = draws[draws.length - 1];

  const draw = (): void => {
    const pool = deck.length > 0 ? deck : shuffledBy(tracks, seed);
    if (pool.length === 0) return;
    // 尽量不重复抽同一首：先挑还没出现过的，抽干了才允许重样
    const seen = new Set(draws.map((d) => d.track.id));
    const fresh = pool.filter((t) => !seen.has(t.id));
    const list = fresh.length > 0 ? fresh : pool;
    const track = list[Math.floor(Math.random() * list.length)];
    setDraws((prev) => [...prev, { track, why: reasonOf(track, tracks, liked, recent), kept: false }]);
  };

  useEffect(() => {
    let alive = true;
    if (!current) {
      setCoverUrl(null);
      return;
    }
    void coverFn
      .current(current.track.id, current.track.path)
      .then((u) => {
        if (alive) setCoverUrl(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [current?.track.id, current?.track.path]);

  const keep = (): void => {
    if (!current) return;
    setDraws((prev) => prev.map((d, i) => (i === prev.length - 1 ? { ...d, kept: true } : d)));
    onPlayGroup([current.track, ...deck.filter((t) => t.id !== current.track.id)], 0);
  };

  const keptCount = draws.filter((d) => d.kept).length;
  const keptArtists = [...new Set(draws.filter((d) => d.kept).map((d) => d.track.artist))];

  return (
    <section className="roam">
      <PageHead
        title="漫游"
        desc="让机器挑，你只负责点头或摇头。抽的是什么，卡片上写清为什么是它。"
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
          <span className="dial-cap">ROAM · 抽一首，点「收下」进队列</span>
        </div>

        <div className="picked">
          {current ? (
            <>
              <span className="kick">本轮第 {draws.length} 抽 · {fmtDuration(current.track.durationMs)}</span>
              <h2>{current.track.title}</h2>
              <p className="who">
                {current.track.artist}
                <em>{current.track.album || "未知专辑"}</em>
              </p>
              <p className="why">
                <b>为什么是它</b>
                {current.why}
              </p>
              <div className="acts">
                <button type="button" className="btn primary" onClick={keep}>
                  收下 · 开始听
                </button>
                <button type="button" className="btn" onClick={draw}>
                  换一首
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setSalt((s) => s + 1);
                    setDraws([]);
                  }}
                >
                  重洗这副牌
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="kick">ROAM · 待发车</span>
              <h2>还没抽第一张</h2>
              <p className="who">
                曲库 {tracks.length} 首<em>今日推荐优先，抽过的这一轮不重样</em>
              </p>
              <p className="why">
                <b>怎么抽</b>今天的推荐单洗成一副牌，一张一张翻；翻完一轮才重洗。红心曲目在牌堆里更靠前。
              </p>
              <div className="acts">
                <button type="button" className="btn primary" onClick={draw} disabled={tracks.length === 0}>
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
                <div className={d.kept ? "dr kept" : "dr"} key={`${d.track.id}-${draws.length - i}`}>
                  <span className="t">{d.track.title}</span>
                  <span className="a">{d.track.artist}</span>
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
