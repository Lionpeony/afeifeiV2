import { useState } from "react";
import type { RemoteTrack } from "../../../contracts/capability.js";
import { fmtDuration } from "../views/library/rows.js";
import { useAccountBundle, type AccountBundle } from "../account-data.js";
import { RefreshButton } from "../RefreshButton.js";
import { NightCoverArt } from "./NightCoverArt.js";
import { issueOf, nightOfYear } from "./night.js";
import { splitLatinRuns } from "./typography.js";

/**
 * 首页 = 当前账号的每日推荐，按「深夜广播 · 唱片舞台」组织：
 * 左侧是整高封套 + 压在封套上的主打信息，右侧是每日推荐与横向播出带。
 * 所有叙事字段来自真实数据或日期派生；不编造播出时间。
 */

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 仅本次运行第一次进入首页时放一次入场；切页回来不重播。 */
let homeVisited = false;

const VU = [
  22, 38, 54, 31, 63, 45, 72, 36, 58, 27, 49, 66, 33, 57, 41, 70, 46, 29, 61, 44,
  76, 39, 55, 24, 67, 48, 34, 59, 42, 73, 37, 52, 26, 64, 47, 69, 35, 56, 43, 71,
];

function MixedTitle({ text }: { text: string }) {
  return (
    <>
      {splitLatinRuns(text).map((run, i) => (
        <span key={i} className={run.latin ? "cs-latin" : "cs-cjk"}>
          {run.text}
        </span>
      ))}
    </>
  );
}

export function LiveHome({
  account,
  accountName,
  onPlayRemote,
  onAccount,
  nowPlaying,
  playing,
  onToggle,
}: {
  account(): Promise<AccountBundle>;
  accountName: string;
  onPlayRemote(sourceId: string, track: RemoteTrack): void;
  onAccount(): void;
  /** 正在播放的在线曲目（音源 + 歌 id）。命中本期播出单时左栏跟着切 */
  nowPlaying: { sourceId: string; songId: string } | null;
  playing: boolean;
  /** 左栏正在播的那一档：播放 / 暂停切换 */
  onToggle(): void;
}) {
  const state = useAccountBundle(account, "daily");
  const [showAll, setShowAll] = useState(false);
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const night = nightOfYear(today);
  const issue = issueOf(today);
  const total = state.songs.length;
  /*
   * 左栏显示哪一档：**正在播放的那首**优先（且必须属于本期播出单），否则回落到第 1 档。
   * 单一事实源——播放器状态是唯一的「当前」，这里不另存一份 selected，
   * 免得底栏切歌、上一首/下一首之后左栏和底栏各说各话。
   */
  const liveIndex =
    nowPlaying && nowPlaying.sourceId === state.sourceId
      ? state.songs.findIndex((t) => t.sourceId === nowPlaying.songId)
      : -1;
  const live = liveIndex >= 0;
  const leadIndex = live ? liveIndex : 0;
  const lead = state.songs[leadIndex];
  const tapes = state.songs.slice(1, 7);
  const play = (track: RemoteTrack): void => onPlayRemote(state.sourceId, track);

  const firstVisit = !homeVisited;
  homeVisited = true;

  const slateCode = `${MONTH[today.getMonth()]} ${pad2(day)} / ${today.getFullYear()} · ${DAY[today.getDay()]}`;
  const slateDate = `${month} 月 ${day} 日 星期${WEEK[today.getDay()]}`;

  return (
    <section className={`live-home daily-home cs-home${firstVisit ? " cs-enter" : ""}`}>
      {!lead ? (
        <div className="cs-state-wrap">
          {state.loading ? <p className="daily-state">正在接通今晚的节目单…</p> : null}
          {!state.loading && state.error ? <p className="daily-state">{state.error}</p> : null}
          {!state.loading && !state.error && state.hint ? (
            <div className="daily-gate">
              <p>{state.hint}</p>
              <button type="button" className="cs-play" onClick={onAccount}>
                去登录 / 切换账号
              </button>
            </div>
          ) : null}
          {!state.loading && !state.error && !state.hint ? (
            <div className="cs-empty">
              <NightCoverArt className="cs-empty-art" />
              <div>
                <h2>今晚还没有节目单</h2>
                <p>推荐源没有给出今天的曲目。晚点再刷新一次。</p>
                <RefreshButton onClick={state.reload} busy={state.loading} />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {/* 左：整高唱片舞台。stage 按 lead.sourceId 重挂 —— 换档时封套与文案各播一次入场
              （见 cover-stage.css）。key 放在 section 上而不是子元素上：img 单独换 key 实测不重挂。 */}
          <section className="cs-stage daily-card" key={lead.sourceId} aria-labelledby="leadTitle">
            {lead.coverUrl ? (
              <img
                className="cs-cover"
                src={lead.coverUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : (
              <NightCoverArt className="cs-cover" />
            )}
            <span className="cs-frame" aria-hidden="true" />

            <aside className="cs-slate" aria-label="日期与期号">
              <span className="cs-slate-code">{slateCode}</span>
              <strong className="cs-slate-date">{slateDate}</strong>
              <span className="cs-slate-sub">
                {issue} · 第 {night} 夜
              </span>
            </aside>

            <div className="cs-copy">
              <p className="cs-kicker">
                {live ? "正在播出 · ON AIR" : "今晚主打 · TONIGHT'S LEAD"}
                <span className="cs-idx">
                  NO.{pad2(leadIndex + 1)} / {total}
                </span>
              </p>
              <button type="button" className="cs-title daily-title" id="leadTitle" onClick={() => play(lead)}>
                <MixedTitle text={lead.title} />
              </button>
              <p className="cs-artist">
                <b>{lead.artist}</b>
                <span className="cs-dur">{fmtDuration(lead.durationMs)}</span>
                <span className="cs-ord">
                  第 {leadIndex + 1} 首 / 共 {total} 首
                </span>
              </p>
              <p className="cs-note">
                {live
                  ? lead.album
                    ? `收录于《${lead.album}》。`
                    : `今晚第 ${leadIndex + 1} 档正在播出。`
                  : "今晚从这一首开始。先把它放完，再决定往哪儿走。"}
              </p>
              <div className="cs-actions">
                <button
                  type="button"
                  className={`cs-play${live && playing ? " is-pause" : ""}`}
                  onClick={() => (live ? onToggle() : play(lead))}
                >
                  <i aria-hidden="true" />
                  {live ? (playing ? "暂停" : "继续") : "播放主打"}
                </button>
              </div>
            </div>
          </section>

          {/* 右：每日推荐 + 横向播出带 + 信号 */}
          <section className="cs-feed" aria-label="今日推荐">
            <header className="cs-feed-head">
              <div>
                <p className="cs-feed-kicker">每日推荐 · DAILY FEED</p>
                <p className="cs-feed-meta">
                  {accountName || "当前音源"} · 每天 <b>06:00</b> 换新 · 共 <b>{total}</b> 首
                </p>
              </div>
              <RefreshButton onClick={state.reload} busy={state.loading} title="刷新推荐" />
            </header>

            <div className="cs-strip-head">
              <h2>{showAll ? "完整播出单" : "播出带"}</h2>
              <span className="cs-strip-sub">{showAll ? "ALL TRACKS · 按播出顺序" : "ON DECK · 按顺序"}</span>
              <button
                type="button"
                className="cs-more"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "收起播出单" : `完整播出单 · 共 ${total} 首`}
              </button>
            </div>

            {showAll ? (
              <ol className="cs-all" aria-label="完整播出单，按播出顺序">
                {state.songs.slice(1).map((track, i) => (
                  <li key={track.sourceId}>
                    <button
                      type="button"
                      className={`cs-all-row${live && leadIndex === i + 1 ? " is-live" : ""}`}
                      aria-current={live && leadIndex === i + 1 ? "true" : undefined}
                      onClick={() => play(track)}
                    >
                      <span className="cs-all-no">{pad2(i + 2)}</span>
                      <span className="cs-all-title daily-title">{track.title}</span>
                      <span className="cs-all-artist">{track.artist}</span>
                      <span className="cs-all-dur">{fmtDuration(track.durationMs)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="cs-tapes" aria-label="待播曲目，按播出顺序">
              {tapes.map((track, i) => (
                <li key={track.sourceId}>
                  <button
                    type="button"
                    className={`cs-tape${live && leadIndex === i + 1 ? " is-live" : ""}`}
                    aria-current={live && leadIndex === i + 1 ? "true" : undefined}
                    onClick={() => play(track)}
                    aria-label={`播放 ${pad2(i + 2)} ${track.title}，${track.artist}，${fmtDuration(track.durationMs)}`}
                  >
                    <span className="cs-tape-no">{pad2(i + 2)}</span>
                    <span className="cs-tape-rule" aria-hidden="true" />
                    <span className="cs-tape-title daily-title">{track.title}</span>
                    <span className="cs-tape-artist">{track.artist}</span>
                    <span className="cs-tape-window" aria-hidden="true">
                      <i />
                      <i />
                    </span>
                    <span className="cs-tape-meter" aria-hidden="true" />
                    <span className="cs-tape-foot">
                      <span className="cs-tape-dur">{fmtDuration(track.durationMs)}</span>
                      <i className="cs-tape-play" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            )}

            <div className="cs-signal" aria-hidden="true">
              <div className="cs-sig-head">
                <span>信号 · SIGNAL</span>
                <span>88.1 MHz</span>
              </div>
              <div className="cs-vu">
                {VU.map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="cs-sig-foot">
                <span className="cs-standby">
                  <i />
                  NIGHT SIGNAL
                </span>
                <span>L / R</span>
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
