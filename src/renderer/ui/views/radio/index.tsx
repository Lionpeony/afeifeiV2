import { useEffect, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subscribeLikes } from "../../../domain/likes/index.js";
import { getHistory, subscribe as subscribeHistory } from "../../../domain/history/index.js";
import { dailyPicks, dailySeed, recentAdds, shuffledBy } from "../../../domain/recommend/index.js";
import { PageHead } from "../../PageHead.js";

export interface RadioViewProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  now: { title: string; artist: string } | null;
}

interface Station {
  key: string;
  freq: string;
  name: string;
  note: string;
  tracks: Track[];
}

const freqOf = (i: number): string => (88 + i * 1.7).toFixed(1);

/**
 * 电台（ref pages-v11/04-radio）。
 *
 * 在线源四家的 canGetRadio 全是 false，没有真电台流可接，所以这里不摆假主播、
 * 假 UP 主：频段墙 = 曲库里够 3 首的艺人（每位一个台，按首数排），
 * 「我的频路」= 五条由本机数据算出来的规则台。点了就按顺序串播。
 */
export function RadioView({ onPlayGroup, now }: RadioViewProps) {
  const [, setRev] = useState(0);
  const bump = (): void => setRev((r) => r + 1);

  useEffect(() => subscribeLibrary(bump), []);
  useEffect(() => subscribeLikes(bump), []);
  useEffect(() => subscribeHistory(bump), []);

  const tracks = getTracks();
  const liked = getLikes();
  const recent = getHistory().map((e) => e.trackId);
  const seed = dailySeed();

  const byArtist = new Map<string, Track[]>();
  for (const t of tracks) {
    const list = byArtist.get(t.artist);
    if (list) list.push(t);
    else byArtist.set(t.artist, [t]);
  }
  const wall: Station[] = [...byArtist.entries()]
    .filter(([, list]) => list.length >= 3)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .slice(0, 12)
    .map(([artist, list], i) => ({
      key: `a-${artist}`,
      freq: freqOf(i),
      name: `${artist} 电台`,
      note: `${list.length} 首 · 这位艺人的全部曲目，按专辑顺序`,
      tracks: [...list].sort((x, y) => x.album.localeCompare(y.album, "zh-Hans-CN")),
    }));

  const slow = tracks.filter((t) => t.durationMs >= 300000);
  const paths: Station[] = [
    {
      key: "liked",
      freq: "FM 01",
      name: "红心台",
      note: `你盖过章的 ${[...liked].length} 首`,
      tracks: tracks.filter((t) => liked.has(t.id)),
    },
    {
      key: "daily",
      freq: "FM 02",
      name: "今日推荐台",
      note: "和首页同一份 30 首",
      tracks: dailyPicks({ tracks, liked, recent, seed }),
    },
    {
      key: "fresh",
      freq: "FM 03",
      name: "新入台",
      note: "最近落进曲库的 20 首",
      tracks: recentAdds(tracks, 20),
    },
    {
      key: "long",
      freq: "FM 04",
      name: "长曲台",
      note: `5 分钟以上的 ${slow.length} 首`,
      tracks: slow,
    },
    {
      key: "shuffle",
      freq: "FM 05",
      name: "全库乱序台",
      note: "曲库整副洗一遍",
      tracks: shuffledBy(tracks, seed ^ 0x5bf03635),
    },
  ].filter((s) => s.tracks.length > 0);

  const playStation = (station: Station): void => onPlayGroup(station.tracks, 0);

  return (
    <section className="radio">
      <PageHead
        title="电台"
        desc="没有主播、没有广告，只有按规则串起来的本地曲库——十二个频段，随点随播。"
        meta={`STATIONS · ${wall.length}`}
      />

      <div className="radio-body">
        <div className="rwall">
          {wall.map((station) => (
            <button type="button" key={station.key} className="rs" onClick={() => playStation(station)}>
              <span className="freq">{station.freq} MHz</span>
              <b>{station.name}</b>
              <span className="note">{station.note}</span>
            </button>
          ))}
          {wall.length === 0 ? (
            <p className="lib-empty">还没有哪位艺人凑够 3 首。曲库再大一点，频段就自己长出来。</p>
          ) : null}
        </div>

        <aside className="rfreq">
          <h3>
            我的频路<span>FIXED</span>
          </h3>
          <div className="list">
            {paths.map((station) => (
              <button type="button" key={station.key} className="rp" onClick={() => playStation(station)}>
                <span className="f">{station.freq}</span>
                <b>{station.name}</b>
                <span className="n">{station.note}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div className="rnow">
        <span className="on">
          <i />
          ON AIR
        </span>
        <b>{now ? now.title : "当前没有播放"}</b>
        <span>{now ? now.artist : "从上面挑一个频段"}</span>
        <span className="sp" />
        <span className="hint">点击频段即整台串播 · 队列与控制台同步</span>
      </div>
    </section>
  );
}
