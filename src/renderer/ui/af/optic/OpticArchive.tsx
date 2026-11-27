import { useEffect, useMemo, useState } from "react";
import { getTracks, subscribe as subLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subLikes } from "../../../domain/likes/index.js";
import { useAf } from "../context.js";
import { TrackArt } from "../art.js";
import { IconPlay } from "../icons.js";
import { OpticEmptyScreen } from "./OpticEmptyScreen.js";
import { OpticSpringSeg } from "./OpticSpringSeg.js";
import { OpticStatDisplay } from "./OpticStatDisplay.js";

const pad = (n: number): string => String(n).padStart(2, "0");
const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};
const dayStart = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * 深黑点阵声学仪表盘（docs/34 v3.0 §5 #4，仅 palette="default" 渲染）。
 * 顶部 3 块深黑点阵数显仪 + 24 小时听歌热力点阵柱图 + L1 阴刻归档曲目表。
 */
export function OpticArchive() {
  const af = useAf();
  const [, setRev] = useState(0);
  useEffect(() => subLibrary(() => setRev((r) => r + 1)), []);
  useEffect(() => subLikes(() => setRev((r) => r + 1)), []);
  const [openKey, setOpenKey] = useState<number | null>(null);

  const likedTracks = getTracks().filter((t) => getLikes().has(t.id));

  const { groups, totalMin, peakHour, hourBins, maxBin } = useMemo(() => {
    const out: { key: number; day: string; mon: string; title: string; ids: string[] }[] = [];
    const bins = new Array<number>(24).fill(0);
    let secSum = 0;
    for (const h of af.history) {
      const d = new Date(h.at);
      bins[d.getHours()] = (bins[d.getHours()] ?? 0) + 1;
      secSum += af.resolveTrack(h.id).dur || 0;
      const key = dayStart(h.at);
      const g = out.find((x) => x.key === key);
      if (g) g.ids.push(h.id);
      else {
        out.push({
          key,
          day: pad(d.getDate()),
          mon: MON[d.getMonth()] ?? "NOV",
          title: `${d.getMonth() + 1} 月 ${d.getDate()} 日记录`,
          ids: [h.id],
        });
      }
    }
    let peak = -1;
    let maxB = 0;
    for (let i = 0; i < 24; i += 1) {
      if (bins[i]! > maxB) {
        maxB = bins[i]!;
        peak = i;
      }
    }
    return {
      groups: out,
      totalMin: Math.round(secSum / 60),
      peakHour: peak >= 0 ? `${pad(peak)}:00` : "--:--",
      hourBins: bins,
      maxBin: Math.max(1, maxB),
    };
  }, [af.history, af]);

  const tonight = groups[0]?.key === dayStart(Date.now()) ? groups[0].ids : [];
  const filter = (af.archiveFilter === "liked" || af.archiveFilter === "tonight" ? af.archiveFilter : "all") as
    | "all"
    | "liked"
    | "tonight";
  const flatIds = filter === "liked" ? likedTracks.map((t) => t.id) : tonight;

  return (
    <div className="page optic-archive" data-screen-label="演出档案">
      <header className="optic-page-head">
        <div>
          <span className="optic-kicker">OPTIC ARCHIVE · ACOUSTIC TELEMETRY</span>
          <h2 className="optic-page-title">声学档案仪</h2>
        </div>
        <OpticSpringSeg
          ariaLabel="档案筛选"
          value={filter}
          options={[
            { id: "all", label: "全部档案", badge: groups.length },
            { id: "liked", label: "已收藏", badge: likedTracks.length },
            { id: "tonight", label: "今日", badge: tonight.length },
          ]}
          onChange={(v) => af.setArchiveFilter(v)}
        />
      </header>

      {/* Row 1 · 3 块深黑点阵 LED 数显仪 */}
      <section className="optic-archive__stats" aria-label="听歌数显仪表">
        <OpticStatDisplay value={totalMin} unit="MIN" label="TOTAL LISTENING" sub="累计播放估算时长" active={totalMin > 0} />
        <OpticStatDisplay value={af.history.length} unit="PLAYS" label="PLAYBACK COUNT" sub={`共记录 ${groups.length} 天`} active={af.history.length > 0} />
        <OpticStatDisplay value={peakHour} label="PEAK HOUR" sub="最常听歌活跃时段" active={peakHour !== "--:--"} />
      </section>

      {/* Row 2 · 24 小时点阵热力柱图 */}
      <section className="optic-archive__heat" aria-label="24 小时听歌热力图">
        <div className="optic-panel-head">
          <span className="optic-kicker">24H LISTENING MATRIX</span>
          <span className="optic-kicker num">00:00 — 23:00</span>
        </div>
        <div className="optic-heat__screen">
          {hourBins.map((count, hr) => {
            const lit = count > 0 ? Math.max(1, Math.round((count / maxBin) * 6)) : 0;
            return (
              <div key={hr} className="optic-heat__col" title={`${pad(hr)}:00 · ${count} 次播放`}>
                <div className="optic-heat__dots">
                  {[6, 5, 4, 3, 2, 1].map((row) => (
                    <i
                      key={row}
                      className={
                        "optic-vu__dot" +
                        (row <= lit ? " is-lit" : "") +
                        (row >= 5 && row <= lit ? " is-peak" : "")
                      }
                    />
                  ))}
                </div>
                <span className="optic-heat__hr num">{hr % 3 === 0 ? pad(hr) : ""}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Row 3 · L1 阴刻归档记录区 */}
      {filter !== "all" ? (
        flatIds.length === 0 ? (
          <OpticEmptyScreen
            code={filter === "liked" ? "NO LIKES" : "NO SESSION TODAY"}
            title={filter === "liked" ? "还没有收藏曲目" : "今天还没有播放记录"}
            sub="播放或收藏喜欢的曲目后，声学档案会自动归档在这里。"
            ctaLabel="去发现页"
            onCta={() => af.setPage("online")}
          />
        ) : (
          <section className="optic-box">
            <div className="optic-panel-head">
              <h2>{filter === "liked" ? "收藏曲目" : "今日播放"}</h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => af.playIds(flatIds)}>
                <IconPlay size={13} />全部播放
              </button>
            </div>
            <div className="optic-well-list">
              {flatIds.map((id, i) => {
                const t = af.resolveTrack(id);
                return (
                  <button key={id + i} type="button" className="optic-row" onClick={() => af.playIds(flatIds, i)}>
                    <span className="optic-row__no num">{pad(i + 1)}</span>
                    <span className="optic-row__art" aria-hidden="true">
                      {t.cover ? <img src={t.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <TrackArt id={id} size={32} radius={6} />}
                    </span>
                    <span className="optic-row__meta">
                      <b className="truncate">{t.title}</b>
                      <span className="truncate">{t.artist}</span>
                    </span>
                    <span className="optic-row__dur num">{fmt(t.dur)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )
      ) : groups.length === 0 ? (
        <OpticEmptyScreen
          code="ARCHIVE EMPTY"
          title="还没有声学档案"
          sub="播放任意一首曲目，系统会自动按日期生成听歌时间线与热力矩阵。"
          ctaLabel="前往发现页"
          onCta={() => af.setPage("online")}
        />
      ) : (
        <section className="optic-archive__days">
          {groups.map((g) => {
            const open = openKey === g.key;
            const mins = Math.round(g.ids.reduce((s, id) => s + af.resolveTrack(id).dur, 0) / 60);
            return (
              <div key={g.key} className="optic-box">
                <div className="optic-archive__dayhead">
                  <button type="button" className="optic-archive__daybtn" onClick={() => setOpenKey(open ? null : g.key)}>
                    <span className="optic-archive__date num">
                      <b>{g.day}</b>
                      <span>{g.mon}</span>
                    </span>
                    <span className="optic-archive__daymeta">
                      <b>{g.title}</b>
                      <span className="num">{g.ids.length} 首 · {mins} 分钟</span>
                    </span>
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => af.playIds(g.ids)}>
                    <IconPlay size={13} />播放
                  </button>
                </div>
                {open ? (
                  <div className="optic-well-list">
                    {g.ids.map((id, i) => {
                      const t = af.resolveTrack(id);
                      return (
                        <button key={id + i} type="button" className="optic-row" onClick={() => af.playIds(g.ids, i)}>
                          <span className="optic-row__no num">{pad(i + 1)}</span>
                          <span className="optic-row__art" aria-hidden="true">
                            {t.cover ? <img src={t.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <TrackArt id={id} size={32} radius={6} />}
                          </span>
                          <span className="optic-row__meta">
                            <b className="truncate">{t.title}</b>
                            <span className="truncate">{t.artist}</span>
                          </span>
                          <span className="optic-row__dur num">{fmt(t.dur)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
