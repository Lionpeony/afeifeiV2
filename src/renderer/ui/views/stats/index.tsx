import { useEffect, useState } from "react";
import { getSessions, subscribe as subscribeLog } from "../../../domain/listening/log.js";
import { fmtListening, summarize, type ListeningStats } from "../../../projection/stats.js";
import { PageHead } from "../../PageHead.js";

/**
 * 听歌报告（B-12）。
 *
 * 数据来自 `domain/listening/log` 的会话账本——**不是** `domain/history` 那 300 条
 * 去重时间线（它没有时长，拿来算时长就是编数据）。所以页面必须把口径说清：
 * 「从启用这一功能之后开始记」，不能让用户以为能看到全部历史。
 *
 * 没有图表库：7 天柱 / 24 小时柱 / 排行条都是纯 CSS，颜色只取 tokens.css 的变量。
 */
export function StatsView() {
  const [stats, setStats] = useState<ListeningStats>(() => summarize(getSessions()));
  useEffect(() => subscribeLog(() => setStats(summarize(getSessions()))), []);

  const maxDay = Math.max(1, ...stats.byDay.map((d) => d.ms));
  const maxHour = Math.max(1, ...stats.byHour);
  const maxArtist = Math.max(1, ...stats.topArtists.map((r) => r.ms));
  const maxTrack = Math.max(1, ...stats.topTracks.map((r) => r.ms));
  const cards: [string, number][] = [
    ["今天", stats.todayMs],
    ["近 7 天", stats.weekMs],
    ["本月", stats.monthMs],
    ["累计", stats.totalMs],
  ];

  return (
    <section className="library stats-page">
      <PageHead title="听歌报告" meta="LISTENING" />

      {stats.plays === 0 ? (
        <div className="stats-empty" role="status">
          <b>还没有听歌记录。</b>
          <span>放一首歌，连续播放超过 1 秒就开始记；暂停、切歌、退出播放都会结算这一段。</span>
          <span>口径：只统计「真的在播」的时间，从启用这个功能之后开始记，早先的「最近播放」是去重时间线、补不回时长。</span>
        </div>
      ) : (
        <>
          <div className="stats-cards">
            {cards.map(([label, ms]) => (
              <div className="stats-card" key={label}>
                <span>{label}</span>
                <b>{fmtListening(ms)}</b>
              </div>
            ))}
          </div>
          <p className="stats-note">
            共 {stats.plays} 段播放 · 最多保留最近 2000 段 · 时间在暂停时停表
          </p>

          <section className="stats-block">
            <h3>近 7 天</h3>
            <div className="stats-bars" aria-label="最近 7 天每天听歌时长">
              {stats.byDay.map((day) => (
                <div className="stats-bar-col" key={day.key} title={`${day.label} · ${fmtListening(day.ms)}`}>
                  <div className="stats-bar-track">
                    <div className="stats-bar" style={{ height: `${(day.ms / maxDay) * 100}%` }} />
                  </div>
                  <span>{day.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="stats-block">
            <h3>什么时候听</h3>
            <div className="stats-hours" aria-label="按小时统计的听歌时长">
              {stats.byHour.map((ms, hour) => (
                <div key={hour} className="stats-hour" title={`${hour} 时 · ${fmtListening(ms)}`}>
                  <div className="stats-hour-bar" style={{ height: `${(ms / maxHour) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="stats-hour-axis">
              <span>0:00</span>
              <span>6:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>23:00</span>
            </div>
          </section>

          <div className="stats-ranks">
            <section className="stats-block">
              <h3>听得最多的歌手</h3>
              {stats.topArtists.map((row) => (
                <div className="stats-rank" key={row.name}>
                  <span className="stats-rank-name">{row.name}</span>
                  <span className="stats-rank-track">
                    <span style={{ width: `${(row.ms / maxArtist) * 100}%` }} />
                  </span>
                  <span className="stats-rank-ms">{fmtListening(row.ms)}</span>
                </div>
              ))}
            </section>
            <section className="stats-block">
              <h3>听得最多的曲目</h3>
              {stats.topTracks.map((row) => (
                <div className="stats-rank" key={row.name + row.artist}>
                  <span className="stats-rank-name" title={`${row.name} — ${row.artist}`}>
                    {row.name}
                  </span>
                  <span className="stats-rank-track">
                    <span style={{ width: `${(row.ms / maxTrack) * 100}%` }} />
                  </span>
                  <span className="stats-rank-ms">{fmtListening(row.ms)}</span>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
