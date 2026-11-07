import { useState } from "react";
import type { RemoteTrack } from "../../../contracts/capability.js";
import { fmtDuration } from "../views/library/rows.js";
import { useAccountBundle, type AccountBundle } from "../account-data.js";
import { RefreshButton } from "../RefreshButton.js";
import { NightCoverArt } from "./NightCoverArt.js";
import { issueOf, nightOfYear } from "./night.js";
import { splitLatinRuns } from "./typography.js";
import { onAirProgram, type OnAirProgram } from "./on-air.js";

export { onAirProgram };
export type { OnAirProgram };

/**
 * 首页 = 「电台总控台」，按「深夜广播 · 唱片舞台」组织：
 * 左侧是整高封套 + 压在封套上的主打信息，右侧是本期节目单与横向播出带。
 * hero 跟随全局播放（onAirProgram 投影）：在播的歌来自每日推荐就按每日推荐展示，
 * 来自榜单/歌单/搜索/FM 就整页切 ON AIR、节目单 = 当前队列；空闲回落今日第 1 档。
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
  onAir,
}: {
  account(): Promise<AccountBundle>;
  accountName: string;
  /** 带上整份播出单：点哪首就从哪首开始，队列 = 这份列表 */
  onPlayRemote(sourceId: string, track: RemoteTrack, list?: RemoteTrack[]): void;
  onAccount(): void;
  /** 正在播放的在线曲目（音源 + 歌 id）。命中本期播出单时左栏跟着切 */
  nowPlaying: { sourceId: string; songId: string } | null;
  playing: boolean;
  /** 左栏正在播的那一档：播放 / 暂停切换 */
  onToggle(): void;
  /** 全局正在播的远程节目（onAirProgram 投影）。null = 没在播远程歌 */
  onAir: OnAirProgram | null;
}) {
  const state = useAccountBundle(account, "daily");
  const [showAll, setShowAll] = useState(false);
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const night = nightOfYear(today);
  const issue = issueOf(today);
  /*
   * hero 显示哪一档——两个模式，同一投影：
   *  - 每日推荐（默认）：正在播的歌属于今日推荐，或没在播（回落第 1 档）；
   *  - ON AIR：正在播的远程歌来自别处（榜单/歌单/搜索/FM），整页切过去，
   *    节目单 = 当前队列——在任何页选的歌，回首页都能看到它上台和整份节目单。
   * 单一事实源不变：播放状态由 store 唯一持有，这里只做投影，不另存 selected。
   */
  const liveIndex =
    nowPlaying && nowPlaying.sourceId === state.sourceId
      ? state.songs.findIndex((t) => t.sourceId === nowPlaying.songId)
      : -1;
  const onAirIdx = onAir ? onAir.list.findIndex((t) => t.sourceId === onAir.meta.songId) : -1;
  const onAirMode = onAir != null && liveIndex < 0 && onAirIdx >= 0;

  const live = onAirMode || liveIndex >= 0;
  const leadIndex = onAirMode ? onAirIdx : liveIndex >= 0 ? liveIndex : 0;
  const lead: RemoteTrack | undefined = onAirMode ? onAir.list[onAirIdx] : state.songs[leadIndex];
  // 本期节目单：ON AIR = 当前队列，每日推荐 = 账号推荐列表
  const program: RemoteTrack[] = onAirMode ? onAir.list : state.songs;
  const total = program.length;
  // 每日推荐的 01 号位就是 hero，播出带从 02 起；ON AIR 节目单从 01 排，hero 与行是同一份列表
  const tapeStart = onAirMode ? 0 : 1;
  const tapes = program.slice(tapeStart, tapeStart + 6);
  // 点播出带里的任意一档：队列 = 整份节目单，从这一首开始（连播靠它）
  const play = (track: RemoteTrack): void => {
    if (onAirMode) onPlayRemote(onAir.meta.sourceId, track, onAir.list);
    else onPlayRemote(state.sourceId, track, state.songs);
  };

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
                {onAirMode
                  ? `来自 ${onAir.sourceName} 的节目单正在播出。今晚去哪儿走，由它决定。`
                  : live
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
                <p className="cs-feed-kicker">{onAirMode ? "正在播出 · ON AIR" : "每日推荐 · DAILY FEED"}</p>
                <p className="cs-feed-meta">
                  {onAirMode ? (
                    <>
                      {onAir.sourceName} · 来自当前队列 · 共 <b>{total}</b> 首
                    </>
                  ) : (
                    <>
                      {accountName || "当前音源"} · 每天 <b>06:00</b> 换新 · 共 <b>{total}</b> 首
                    </>
                  )}
                </p>
              </div>
              {onAirMode ? null : <RefreshButton onClick={state.reload} busy={state.loading} title="刷新推荐" />}
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
                {program.slice(tapeStart).map((track, i) => (
                  <li key={track.sourceId}>
                    <button
                      type="button"
                      className={`cs-all-row${live && leadIndex === i + tapeStart ? " is-live" : ""}`}
                      aria-current={live && leadIndex === i + tapeStart ? "true" : undefined}
                      onClick={() => play(track)}
                    >
                      <span className="cs-all-no">{pad2(i + tapeStart + 1)}</span>
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
                    className={`cs-tape${live && leadIndex === i + tapeStart ? " is-live" : ""}`}
                    aria-current={live && leadIndex === i + tapeStart ? "true" : undefined}
                    onClick={() => play(track)}
                    aria-label={`播放 ${pad2(i + tapeStart + 1)} ${track.title}，${track.artist}，${fmtDuration(track.durationMs)}`}
                  >
                    <span className="cs-tape-no">{pad2(i + tapeStart + 1)}</span>
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
