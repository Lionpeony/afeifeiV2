import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { AppState } from "../../contracts/index.js";
import { dispatch, getState } from "../kernel/index.js";
import type { Services } from "./services.js";
import { errorText } from "../capability/errors.js";
import { fmt, phaseLabel, type PlaybackPhase } from "./playback-phase.js";
import { PLAY_MODE_LABEL, PLAY_MODE_SHORT, nextPlayMode } from "./play-mode.js";
import type { PageId } from "./pages.js";
import type { PlayerRemote } from "./hooks/use-media-session.js";

/** 睡眠定时档位（A-23）。30 分钟是主档，验收就按它。 */
const SLEEP_OPTIONS = [15, 30, 60];

/** 倍速档位（抄 lx 的 0.5–2 限幅，取常用档位做按钮）。 */
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * 底栏控制台，按调音台分区语法排布：监听区（曲目 + 红心）→ 走带区（transport + seek）
 * → 播出区（模式/音量/睡眠/倍速）→ 面板区（队列/音效/词/迷你）。组间用分隔线，
 * 带弹层的按钮统一加 pop 角标，让"点了会弹东西"看得出来。
 *
 * 三个弹层开关（音量 / 睡眠 / 倍速）是本组件的私有 UI 态，互斥关系只在按钮间成立；
 * `queueOpen` / `fxOpen` 的面板渲染在 footer 之外（队列面板、音效面板），开关留在 App 传入。
 *
 * `timeEl/totalEl/barEl/tipEl` 这四个 ref 由 App 的 `syncPosition` 每帧写 DOM
 * （进度条不触发 React 渲染），ref 所有权在 App，这里只负责挂到节点上。
 */
export function Console(props: {
  /* 只读播放态 */
  npCover: string | null;
  phase: PlaybackPhase;
  likedNow: boolean;
  title: string | null;
  trackId: string | null;
  error: AppState["player"]["error"];
  status: string;
  remote: PlayerRemote;
  playing: boolean;
  volume: number;
  muted: boolean;
  queueMode: AppState["queue"]["mode"];
  playbackRate: number;
  preservesPitch: boolean;
  sleepEndsAt: number | null;
  sleepWaitEnd: boolean;
  sleepPending: boolean;
  /* 跨 footer 边界的开关与动作 */
  queueOpen: boolean;
  fxOpen: boolean;
  setQueueOpen: Dispatch<SetStateAction<boolean>>;
  setFxOpen: Dispatch<SetStateAction<boolean>>;
  setPage: (page: PageId) => void;
  setNotice: (n: { text: string; url?: string } | null) => void;
  toggleCurrentLike: () => void;
  /* ref 所有权在 App：syncPosition 每帧写这四个节点 + 睡眠倒计时 */
  timeEl: RefObject<HTMLSpanElement | null>;
  totalEl: RefObject<HTMLSpanElement | null>;
  barEl: RefObject<HTMLInputElement | null>;
  tipEl: RefObject<HTMLSpanElement | null>;
  sleepEl: RefObject<HTMLSpanElement | null>;
  dragging: RefObject<boolean>;
  services: RefObject<Services | null>;
}): React.JSX.Element {
  const {
    npCover,
    phase,
    likedNow,
    title,
    trackId,
    error,
    status,
    remote,
    playing,
    volume,
    muted,
    queueMode,
    playbackRate,
    preservesPitch,
    sleepEndsAt,
    sleepWaitEnd,
    sleepPending,
    queueOpen,
    fxOpen,
    setQueueOpen,
    setFxOpen,
    setPage,
    setNotice,
    toggleCurrentLike,
    timeEl,
    totalEl,
    barEl,
    tipEl,
    sleepEl,
    dragging,
    services,
  } = props;
  const [volOpen, setVolOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);

  return (
    <footer className="console">
      {/* 监听区：正在播放 + 红心。整块可点跳播放页；红心是对"这一首"的表态，跟曲目走 */}
      <div className="np-zone">
        <button type="button" className="np" onClick={() => setPage("stage")} title="打开播放页">
          <span
            className={`np-art${npCover ? "" : " blank"}${phase === "loading" || phase === "buffering" ? " busy" : ""}`}
            style={npCover ? { backgroundImage: `url("${npCover}")` } : undefined}
          />
          <span className="np-tx">
            <b>{title}</b>
            {/* 直播壳没有顶栏：错误徽标挂在控制台副行，否则播放错误看不见 */}
            {error ? (
              <span className="status" data-status={status} title={error}>
                {errorText(error)}
              </span>
            ) : (
              <span>{phaseLabel(phase, !!remote)}</span>
            )}
          </span>
        </button>
        <button
          type="button"
          className={likedNow ? "np-like on" : "np-like"}
          aria-label={likedNow ? "取消红心" : "加红心"}
          aria-pressed={likedNow}
          disabled={!trackId}
          title={remote ? "账号红心（同步到网易云）" : "本机红心"}
          onClick={toggleCurrentLike}
        >
          ♥
        </button>
      </div>

      <div className="mid">
        <div className="transport">
          <button
            type="button"
            className="tb"
            aria-label="上一首"
            onClick={() =>
              dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 })
            }
          >
            <i className="tb-ic ic-prev">
              <i />
              <i />
            </i>
          </button>
          <button type="button" className="tb main" aria-label={playing ? "暂停" : "播放"} onClick={() => dispatch({ type: "player/toggle" })}>
            <i className={`tb-ic ${playing ? "ic-pause" : "ic-play"}`}>
              <i />
              {playing ? <i /> : null}
            </i>
          </button>
          <button
            type="button"
            className="tb"
            aria-label="下一首"
            onClick={() => {
              const before = getState().player.trackId;
              dispatch({ type: "queue/next" });
              // 没换歌 = 队列里没得切（在线单曲不进队列）。说一句，别让按钮像坏了
              if (getState().player.trackId === before) {
                const stuck = getState();
                setNotice({ text: stuck.queue.stream ? "正在续下一批…" : "队列里没有下一首" });
              }
            }}
          >
            <i className="tb-ic ic-next">
              <i />
              <i />
            </i>
          </button>
        </div>

        {/* 进度：原生 range 保住键盘/拖拽语义，视觉由 app.css 画成发丝轨 + 朱砂头 */}
        <div className="seek">
          <span ref={timeEl} className="tm">
            0:00
          </span>
          <input
            ref={barEl}
            className={`bar${playing ? " playing" : ""}`}
            type="range"
            min="0"
            max="1"
            step="1"
            defaultValue="0"
            aria-label="播放进度"
            onPointerDown={() => {
              dragging.current = true;
            }}
            // 松手才提交（P0-03）：拖动中只画预览，不发 seek ——
            // 每动一格就 seek 一次会把音频打成"碎碎的发声片段"（旧行为）
            onPointerUp={(e) => {
              dragging.current = false;
              dispatch({ type: "player/seek", positionMs: Number(e.currentTarget.value) });
            }}
            // 指针在窗外交代时 pointerup 可能收不到：丢捕获也要收尾，
            // 否则 dragging 卡住 → 进度条永远停在原地（P0-03 的兜底）
            onLostPointerCapture={(e) => {
              if (!dragging.current) return;
              dragging.current = false;
              dispatch({ type: "player/seek", positionMs: Number(e.currentTarget.value) });
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            onPointerMove={(e) => {
              // 悬停时间泡：直接写 DOM（每帧级事件不走 React），松手即隐
              const tip = tipEl.current;
              if (!tip) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              const duration = services.current?.engine.durationMs() ?? 0;
              tip.textContent = fmt(pct * duration);
              tip.style.left = `${pct * 100}%`;
            }}
            onChange={(e) => {
              // 拖动中：只画预览（墨色填充 + 时间），不触发 seek
              if (!dragging.current) {
                dispatch({ type: "player/seek", positionMs: Number(e.target.value) });
                return;
              }
              const v = Number(e.target.value);
              const duration = services.current?.engine.durationMs() ?? 0;
              if (timeEl.current) timeEl.current.textContent = fmt(v);
              const pct = duration > 0 ? Math.min(100, (v / duration) * 100) : 0;
              e.currentTarget.style.setProperty("--fill", `${pct.toFixed(2)}%`);
            }}
          />
          <span ref={tipEl} className="seek-tip" aria-hidden="true" />
          <span ref={totalEl} className="tm">
            0:00
          </span>
        </div>
      </div>

      <div className="tools">
        {/* 播出区：控制"怎么播" */}
        <button
          type="button"
          title={`播放模式：${PLAY_MODE_LABEL[queueMode]}`}
          aria-label={`播放模式：${PLAY_MODE_LABEL[queueMode]}`}
          onClick={() => dispatch({ type: "queue/mode", mode: nextPlayMode(queueMode) })}
        >
          {PLAY_MODE_SHORT[queueMode]}
        </button>
        <button
          type="button"
          className={`pop${volOpen || muted ? " on" : ""}`}
          aria-expanded={volOpen}
          onClick={() => {
            setVolOpen(!volOpen);
            setSleepOpen(false);
          }}
          title={muted ? "已静音" : "音量"}
        >
          {muted ? "静音" : "音量"}
        </button>
        <button
          type="button"
          className={`pop${sleepOpen || sleepEndsAt || sleepPending ? " on" : ""}`}
          aria-expanded={sleepOpen}
          onClick={() => {
            setSleepOpen(!sleepOpen);
            setVolOpen(false);
          }}
          title={
            sleepPending
              ? "到点了：这首播完就停"
              : sleepWaitEnd
                ? "睡眠定时：播完当前曲再停"
                : "睡眠定时：到点暂停，不退出"
          }
        >
          睡眠
          {sleepEndsAt ? <span ref={sleepEl} className="sleep-left" /> : null}
          {sleepPending ? <span className="sleep-left">等这首完</span> : null}
        </button>
        <button
          type="button"
          className="pop"
          onClick={() => {
            setRateOpen(!rateOpen);
            setVolOpen(false);
            setSleepOpen(false);
          }}
          title={`播放速度：${playbackRate.toFixed(2)}x`}
        >
          {playbackRate.toFixed(2)}x
        </button>
        {/* 面板区：控制"打开什么"——队列/音效开侧面板（有 on 态），词/迷你开新窗口 */}
        <span className="sep" aria-hidden="true" />
        <button
          type="button"
          className={queueOpen ? "on" : ""}
          aria-expanded={queueOpen}
          onClick={() => setQueueOpen((v) => !v)}
          title="播放队列（P0-10）"
        >
          队列
        </button>
        <button type="button" className={fxOpen ? "on" : ""} aria-expanded={fxOpen} onClick={() => setFxOpen(!fxOpen)}>
          音效
        </button>
        <button type="button" onClick={() => void services.current?.openLyric()} title="桌面歌词">
          词
        </button>
        <button type="button" onClick={() => void services.current?.openMini()} title="迷你窗">
          迷你
        </button>
      </div>
      {/* 音量条常驻 DOM、只切 visibility：滑杆语义与键盘可达性不因开合而丢 */}
      <div className="vol-pop volume" hidden={!volOpen}>
        <button
          type="button"
          className={`mute${muted ? " on" : ""}`}
          aria-pressed={muted}
          title={muted ? "取消静音" : "静音"}
          onClick={() => dispatch({ type: "player/setMuted", muted: !muted })}
        >
          {muted ? "静音中" : "静音"}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.02"
          value={volume}
          aria-label="音量"
          onChange={(e) => dispatch({ type: "player/setVolume", volume: Number(e.target.value) })}
        />
        <span className="vol-val">{Math.round(volume * 100)}</span>
      </div>
      <div className="vol-pop rate-pop" role="dialog" aria-label="播放速度" hidden={!rateOpen}>
        <p className="rate-title">播放速度</p>
        <div className="rate-opts">
          {RATE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={playbackRate === r ? "on" : ""}
              onClick={() => dispatch({ type: "player/setPlaybackRate", rate: r })}
            >
              {r.toFixed(2)}x
            </button>
          ))}
        </div>
        <label className="rate-pitch">
          <input
            type="checkbox"
            checked={preservesPitch}
            onChange={(e) => dispatch({ type: "player/setPreservesPitch", on: e.target.checked })}
          />
          音调补偿（变速不变调）
        </label>
      </div>

      {sleepOpen && (
        <div className="vol-pop sleep-pop" role="dialog" aria-label="睡眠定时">
          <p className="sleep-now">
            {sleepPending
              ? "已到点 · 这首播完就停"
              : sleepEndsAt
                ? sleepWaitEnd
                  ? "定时中 · 播完当前曲停"
                  : "定时中 · 到点自动暂停"
                : "到点只暂停，不退出"}
          </p>
          <label className="sleep-wait">
            <input
              type="checkbox"
              checked={sleepWaitEnd}
              onChange={(e) => dispatch({ type: "sleep/setWaitEnd", waitEnd: e.target.checked })}
            />
            <span>播完当前曲再停</span>
          </label>
          <div className="sleep-opts">
            {SLEEP_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  dispatch({ type: "sleep/set", endsAt: Date.now() + m * 60000 });
                  setSleepOpen(false);
                }}
              >
                {m} 分钟
              </button>
            ))}
            <button
              type="button"
              disabled={!sleepEndsAt}
              onClick={() => {
                dispatch({ type: "sleep/clear" });
                setSleepOpen(false);
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
      <span className="stamp">入场券 · ADMIT ONE</span>
    </footer>
  );
}
