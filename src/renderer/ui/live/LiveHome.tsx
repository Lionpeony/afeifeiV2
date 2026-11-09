import { useEffect, useRef, useState } from "react";
import type { RemoteTrack } from "../../../contracts/capability.js";
import { fmtDuration } from "../views/library/rows.js";
import { useAccountBundle, type AccountBundle } from "../account-data.js";
import { RefreshButton } from "../RefreshButton.js";
import { NightCoverArt } from "./NightCoverArt.js";
import { detectCoverTrim, sampleCoverTint, type CoverTrim } from "../views/stage/tint-client.js";
import { splitLatinRuns } from "./typography.js";
import { onTick } from "../compositor.js";
import { onAirProgram, type OnAirProgram } from "./on-air.js";

export { onAirProgram };
export type { OnAirProgram };

/**
 * 首页 = 「正在播放」+「接下来播放」的现代桌面播放器布局：
 * 左侧是悬浮大封面 + 主打信息（不夜台暗色舞台），右侧是圆角封面卡网格与真频谱。
 * hero 跟随全局播放（onAirProgram 投影）：在播的歌来自每日推荐就按每日推荐展示，
 * 来自榜单/歌单/搜索/FM 就整页切 ON AIR、节目单 = 当前队列；空闲回落今日第 1 档。
 * 所有叙事字段来自真实数据；不编造播出时间。
 */

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 仅本次运行第一次进入首页时放一次入场；切页回来不重播。 */
let homeVisited = false;

/** 信号条柱数：与控制台/舞台同源（engine.spectrum 聚合桶），写死就是假仪器。 */
const VU_BARS = 40;

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
  onAir,
  spectrum,
}: {
  account(): Promise<AccountBundle>;
  accountName: string;
  /** 带上整份播出单：点哪首就从哪首开始，队列 = 这份列表。origin = 节目来源标签。 */
  onPlayRemote(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): void;
  onAccount(): void;
  /** 正在播放的在线曲目（音源 + 歌 id）。命中本期播出单时左栏跟着切 */
  nowPlaying: { sourceId: string; songId: string } | null;
  playing: boolean;
  /** 全局正在播的远程节目（onAirProgram 投影）。null = 没在播远程歌 */
  onAir: OnAirProgram | null;
  /** 真实频谱采样（engine.spectrum）。null = 音频图未建，信号条贴底待机。 */
  spectrum(bins: number): number[] | null;
}) {
  const state = useAccountBundle(account, "daily");
  const [showAll, setShowAll] = useState(false);
  const [failedCovers, setFailedCovers] = useState<ReadonlySet<string>>(new Set());
  const [tint, setTint] = useState<string | null>(null);
  const [trims, setTrims] = useState<Record<string, CoverTrim>>({});
  const vuRefs = useRef<Array<HTMLSpanElement | null>>([]);

  /** 白边图的反制：按检测到的最大白边比例放大（中心对称，白边被挤出圆角容器外）。
      正常封面 trim=null 不动；上限 1.17（15% 白边全量反制）。 */
  const trimScale = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    const t = trims[url];
    if (!t) return undefined;
    const peak = Math.max(t.top, t.right, t.bottom, t.left);
    return peak > 0 ? `scale(${(1 + Math.min(0.15, peak) * 1.15).toFixed(3)})` : undefined;
  };
  /** 图片加载成功后检测一次白边（onload 时机天然就绪，canvas 采样 ~2ms）。 */
  const detectTrim = (url: string | undefined): void => {
    if (!url || trims[url] !== undefined) return;
    detectCoverTrim(url, (t) => {
      if (t) setTrims((s) => ({ ...s, [url]: t }));
      else setTrims((s) => ({ ...s, [url]: { top: 0, right: 0, bottom: 0, left: 0 } }));
    });
  };

  /*
   * 信号条：每帧从引擎取真频谱写 scaleY（composite-only，不走 React 渲染）。
   * 没在播时 analyser 数据衰减为 0，条子自然贴底——空态就是仪器的待机态，不造假波形。
   */
  useEffect(() => onTick(() => {
    const values = spectrum(VU_BARS);
    for (let i = 0; i < vuRefs.current.length; i++) {
      const el = vuRefs.current[i];
      if (el) el.style.transform = `scaleY(${(values?.[i] ?? 0.02).toFixed(3)})`;
    }
  }), [spectrum]);

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
  // 播出带 = 真正的「接下来」：从正在播那一档的下一首起，切歌自动推进。
  // 尾曲之后**环回**节目单开头（列表循环语义，2026-11-08 用户定：播完不该是"没了"）——
  // upcoming 是环列的全部其余曲目（不含 lead），编号按环列位置算（尾曲之后是 01）。
  // 单首歌单（total<=1）没有"接下来"，upcoming 为空走到头话术。
  const upcoming: RemoteTrack[] = [];
  for (let k = 1; k < total; k++) upcoming.push(program[(leadIndex + k) % total]);
  const tapes = upcoming.slice(0, 5);
  /** 环列第 k 项的节目单编号（1 起）：lead 29/30 之后是 01。 */
  const noOf = (k: number) => pad2(((leadIndex + k) % total) + 1);
  // 点播出带里的任意一档：队列 = 整份节目单，从这一首开始（连播靠它）。
  // origin 跟着节目走：每日推荐重建时标「每日推荐」；ON AIR 原样保住队列自己的来源。
  const play = (track: RemoteTrack): void => {
    if (onAirMode) onPlayRemote(onAir.meta.sourceId, track, onAir.list, onAir.origin ?? undefined);
    else onPlayRemote(state.sourceId, track, state.songs, "每日推荐");
  };

  const firstVisit = !homeVisited;
  homeVisited = true;

  /* hero 取色（复用播放页 M9-2 管线）：封面主色 → --cs-tint。
     唯一写入点在文档根（tokens.css @property 注册 + html 过渡）：
     页面氛围底（cs-home）、舞台色晕（cs-stage）、底部控制台的色晕
     三处消费同一份封面色，随歌呼吸——离开首页时回落 transparent。
     失败静默回落 transparent（纯壳底），取色不影响任何东西。 */
  useEffect(() => {
    const url = lead?.coverUrl;
    if (!url) return;
    let active = true;
    sampleCoverTint(url, (t) => {
      if (active) setTint(t);
    });
    return () => {
      active = false;
    };
  }, [lead?.coverUrl]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--cs-tint", tint ?? "transparent");
    return () => {
      root.style.setProperty("--cs-tint", "transparent");
    };
  }, [tint]);

  return (
    <section
      className={`live-home cs-home${firstVisit ? " cs-enter" : ""}`}
    >
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
          {/* 左：「正在播放」大图卡。stage 按 lead.sourceId 重挂 —— 换档时封面与文案各播一次入场
              （见 cover-stage.css）。key 放在 section 上而不是子元素上：img 单独换 key 实测不重挂。 */}
          <section
            className="cs-stage"
            key={lead.sourceId}
            aria-labelledby="leadTitle"
          >
            {lead.coverUrl ? (
              <img
                className="cs-cover"
                src={lead.coverUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => detectTrim(lead.coverUrl)}
                style={{ transform: trimScale(lead.coverUrl) }}
              />
            ) : (
              <NightCoverArt className="cs-cover" />
            )}

            <div className="cs-copy">
              <p className="cs-kicker">
                {live ? (playing ? "正在播出" : "暂停中") : "今晚主打"}
                <span className="cs-idx">
                  {pad2(leadIndex + 1)} / {total}
                </span>
              </p>
              <button type="button" className="cs-title daily-title" id="leadTitle" onClick={() => play(lead)}>
                <MixedTitle text={lead.title} />
              </button>
              <p className="cs-artist">
                <b>{lead.artist}</b>
                <span className="cs-dur">{fmtDuration(lead.durationMs)}</span>
              </p>
              <p className="cs-note">
                {onAirMode
                  ? `来自 ${onAir.origin || onAir.sourceName} 的节目单${
                      playing ? "正在播出。今晚去哪儿走，由它决定。" : "停在半路，随时接着走。"
                    }`
                  : live
                    ? lead.album
                      ? `收录于《${lead.album}》。`
                      : `今晚第 ${leadIndex + 1} 档正在播出。`
                    : "今晚从这一首开始。先把它放完，再决定往哪儿走。"}
              </p>
            </div>
          </section>

          {/* 右：每日推荐 + 横向播出带 + 信号 */}
          <section className="cs-feed" aria-label="今日推荐">
            <header className="cs-feed-head">
              <div>
                <p className="cs-feed-kicker">{onAirMode ? "正在播出" : "每日推荐"}</p>
                <p className="cs-feed-meta">
                  {onAirMode ? (
                    <>
                      {onAir.origin || onAir.sourceName} · 来自当前队列 · 共 <b>{total}</b> 首
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
              <h2>
                {upcoming.length === 0 ? "今晚的节目单到头了" : showAll ? "完整播出单" : "接下来播放"}
              </h2>
              <span className="cs-strip-sub">
                {upcoming.length === 0
                  ? `播过了 ${total} 首，今晚到此`
                  : showAll
                    ? `剩 ${upcoming.length} 首 · 按播出顺序`
                    : "按顺序播放"}
              </span>
              {upcoming.length > 0 ? (
                <button
                  type="button"
                  className="cs-more"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "收起播出单" : "完整播出单"}
                </button>
              ) : null}
            </div>

            {upcoming.length === 0 ? (
              <p className="cs-end">接下来没有歌了。回完整播放器换一首，或者刷新一份新的推荐。</p>
            ) : showAll ? (
              <ol className="cs-all" aria-label="接下来的播出单，按播出顺序（循环回节目单开头）">
                {upcoming.map((track, i) => (
                  <li key={track.sourceId}>
                    <button
                      type="button"
                      className="cs-all-row"
                      onClick={() => play(track)}
                    >
                      <span className="cs-all-no">{noOf(i + 1)}</span>
                      {/* 缩略图：与播出带格子同一封面链路；失败切迷你黑胶垫底 */}
                      {track.coverUrl && !failedCovers.has(track.coverUrl) ? (
                        <img
                          className="cs-all-art"
                          src={track.coverUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={() => setFailedCovers((s) => new Set(s).add(track.coverUrl as string))}
                        />
                      ) : (
                        <span className="cs-all-art cs-all-art-blank" aria-hidden="true" />
                      )}
                      <span className="cs-all-tx">
                        <span className="cs-all-title">{track.title}</span>
                        <span className="cs-all-artist">{track.artist}</span>
                      </span>
                      <span className="cs-all-dur">{fmtDuration(track.durationMs)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="cs-tapes" aria-label="待播曲目，按播出顺序（循环回节目单开头）">
              {tapes.map((track, i) => (
                <li key={track.sourceId}>
                  <button
                    type="button"
                    className="cs-tape"
                    onClick={() => play(track)}
                    aria-label={`播放 ${noOf(i + 1)} ${track.title}，${track.artist}，${fmtDuration(track.durationMs)}`}
                  >
                    {/* 专辑封面：方形整幅在卡顶（现代专辑卡），img 直接做 flex item。
                        无封面或加载失败换黑胶垫底，按 coverUrl 记失败。 */}
                    {track.coverUrl && !failedCovers.has(track.coverUrl) ? (
                      <img
                        className="cs-tape-art"
                        src={track.coverUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedCovers((s) => new Set(s).add(track.coverUrl as string))}
                        onLoad={() => detectTrim(track.coverUrl)}
                        style={{ transform: trimScale(track.coverUrl) }}
                      />
                    ) : (
                      <span className="cs-tape-art cs-tape-vinyl" aria-hidden="true" />
                    )}
                    <span className="cs-tape-no">{noOf(i + 1)}</span>
                    <span className="cs-tape-title daily-title">{track.title}</span>
                    <span className="cs-tape-artist">{track.artist}</span>
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
              <div className="cs-vu">
                {Array.from({ length: VU_BARS }, (_, i) => (
                  <i
                    key={i}
                    ref={(el) => {
                      vuRefs.current[i] = el;
                    }}
                  />
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
