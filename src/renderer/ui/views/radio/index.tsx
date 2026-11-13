import { useEffect, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subscribeLikes } from "../../../domain/likes/index.js";
import { getHistory, subscribe as subscribeHistory } from "../../../domain/history/index.js";
import { dailyPicks, dailySeed, reasonOf, recentAdds, shuffledBy } from "../../../domain/recommend/index.js";
import { PageHead } from "../../PageHead.js";

export interface RadioViewProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  now: { title: string; artist: string } | null;
}

interface Station {
  key: string;
  /** 角标（原假频率 88.1 已删）：艺人墙给曲目数，规则组给序号 */
  tag: string;
  name: string;
  note: string;
  tracks: Track[];
}

/**
 * 电台（ref pages-v11/04-radio）。
 *
 * 在线源四家的 canGetRadio 全是 false，没有真电台流可接，所以这里不摆假主播、
 * 假 UP 主：艺人墙 = 曲库里够 3 首的艺人（每位一组，按首数排），
 * 「我的组合」= 五条由本机数据算出来的规则组。点了就按顺序连播。
 */
export function RadioView({ onPlayGroup, now, embedded = false }: RadioViewProps & { embedded?: boolean }) {
  const [, setRev] = useState(0);
  const bump = (): void => setRev((r) => r + 1);
  /* 私人 FM 的换流种子：FM 是一条流不是一批数据，换流不持久（换一批那种才要记住） */
  const [fmSalt, setFmSalt] = useState(0);

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
      tag: `${list.length} 首`,
      name: artist,
      note: `${list.length} 首 · 这位艺人的全部曲目，按专辑顺序`,
      tracks: [...list].sort((x, y) => x.album.localeCompare(y.album, "zh-Hans-CN")),
    }));

  const slow = tracks.filter((t) => t.durationMs >= 300000);
  const paths: Station[] = [
    {
      key: "liked",
      tag: "01",
      name: "红心",
      note: `你盖过章的 ${[...liked].length} 首`,
      tracks: tracks.filter((t) => liked.has(t.id)),
    },
    {
      key: "daily",
      tag: "02",
      name: "今日推荐",
      note: "红心、常听、新入库混排的 30 首",
      tracks: dailyPicks({ tracks, liked, recent, seed }),
    },
    {
      key: "fresh",
      tag: "03",
      name: "新入库",
      note: "最近落进曲库的 20 首",
      tracks: recentAdds(tracks, 20),
    },
    {
      key: "long",
      tag: "04",
      name: "长曲",
      note: `5 分钟以上的 ${slow.length} 首`,
      tracks: slow,
    },
    {
      key: "shuffle",
      tag: "05",
      name: "全库乱序",
      note: "曲库整副洗一遍",
      tracks: shuffledBy(tracks, seed ^ 0x5bf03635),
    },
  ].filter((s) => s.tracks.length > 0);

  const playStation = (station: Station): void => onPlayGroup(station.tracks, 0);

  /*
   * 私人 FM（A-14 最后一块）：算法流直接进播放器。
   * 和「今日推荐」组的区别不在算法（同一个 dailyPicks），在**交互形态**：
   * 组是"点一下播一整个列表"，FM 是"告诉你要来什么、为什么，一键开始、随时换流"。
   * 每首前面那句 reasonOf 就是 B-04 的"为什么"——推荐不说理由就不算推荐。
   */
  const fmTracks = dailyPicks({ tracks, liked, recent, seed: dailySeed() + fmSalt });
  const fmReasons = fmTracks.slice(0, 3).map((t) => ({
    track: t,
    why: reasonOf(t, tracks, liked, recent),
  }));
  const startFm = (): void => onPlayGroup(fmTracks, 0);

  const body = (
    <>
      {/* 私人 FM：横向开机条。左=接下来三首和理由，右=操作。不挤侧栏，也不占艺人墙 */}
      <div className="fmbar">
        <div className="fm-why">
          <h3>
            私人 FM<span>AUTO · 每天换流</span>
          </h3>
          <div className="rows">
            {fmReasons.map(({ track, why }, i) => (
              <div className="fmrow" key={track.id}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <b>{track.title}</b>
                <span className="why">{why || track.artist}</span>
              </div>
            ))}
            {fmReasons.length === 0 ? <p className="lib-empty">曲库还是空的，FM 没法开机。</p> : null}
          </div>
        </div>
        <div className="fm-ops">
          <button type="button" className="btn" onClick={startFm} disabled={fmTracks.length === 0}>
            开始收听（{fmTracks.length} 首）
          </button>
          <button type="button" className="btn ghost" onClick={() => setFmSalt((s) => s + 1)}>
            换一批
          </button>
        </div>
      </div>

      <div className="radio-body">
        <div className="rwall">
          {wall.map((station) => (
            <button type="button" key={station.key} className="rs" onClick={() => playStation(station)}>
              <span className="freq">{station.tag}</span>
              <b>{station.name}</b>
              <span className="note">{station.note}</span>
            </button>
          ))}
          {wall.length === 0 ? (
            <p className="lib-empty">还没有哪位艺人凑够 3 首。曲库再长一点，这里就有的挑。</p>
          ) : null}
        </div>

        <aside className="rfreq">
          <h3>
            我的组合<span>RULES</span>
          </h3>
          <div className="list">
            {paths.map((station) => (
              <button type="button" key={station.key} className="rp" onClick={() => playStation(station)}>
                <span className="f">{station.tag}</span>
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
          播放中
        </span>
        <b>{now ? now.title : "当前没有播放"}</b>
        <span>{now ? now.artist : "从上面挑一组开始听"}</span>
        <span className="sp" />
        <span className="hint">点一组即按顺序连播 · 队列与控制台同步</span>
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <section className="radio">
      <PageHead
        title="电台"
        desc="没有主播、没有广告，只有按规则串起来的本地曲库——艺人分组随点随播。"
        meta={`STATIONS · ${wall.length}`}
      />
      {body}
    </section>
  );
}
