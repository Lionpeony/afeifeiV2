import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { AppState } from "../../contracts/index.js";
import { dispatch, getState } from "../kernel/index.js";
import type { Services } from "./services.js";
import { errorText } from "../capability/errors.js";
import { fmt, phaseLabel, type PlaybackPhase } from "./playback-phase.js";
import { PLAY_MODE_LABEL, nextPlayMode } from "./play-mode.js";
import type { PlayMode } from "../../contracts/index.js";
import { NavIcon, type IconName } from "./icons.js";
import { toast } from "./toast.js";
import type { PageId } from "./pages.js";
import type { PlayerRemote } from "./hooks/use-media-session.js";

/** 睡眠定时档位（A-23）。30 分钟是主档，验收就按它。 */
const SLEEP_OPTIONS = [15, 30, 60];

/** 播放模式 → 图标：四种模式一眼可辨（文字收进 hover title 与 aria-label）。 */
const PLAY_MODE_ICON: Record<PlayMode, IconName> = {
  order: "order",
  "repeat-all": "repeat",
  "repeat-one": "repeat-one",
  shuffle: "shuffle",
};

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
  /** 在线曲目当前音源名（「网易云」）：副行报「信号来自哪」，比「在线音源」有信息量 */
  sourceName: string | null;
  title: string | null;
  /** 歌手单独一行：曲名与歌手不再用「—」挤在一行（2026-11-12 用户要「像 QQ 音乐那样」） */
  artist: string | null;
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
  toggleCurrentLike: () => void;
  /* ref 所有权在 App：syncPosition 每帧写这四个节点 + 睡眠倒计时 + 主键进度环 */
  timeEl: RefObject<HTMLSpanElement | null>;
  totalEl: RefObject<HTMLSpanElement | null>;
  barEl: RefObject<HTMLInputElement | null>;
  tipEl: RefObject<HTMLSpanElement | null>;
  sleepEl: RefObject<HTMLSpanElement | null>;
  /** 主键进度环的弧（circle）：syncPosition 每帧直写 stroke-dashoffset，不触发渲染 */
  ringEl: RefObject<SVGCircleElement | null>;
  dragging: RefObject<boolean>;
  services: RefObject<Services | null>;
}): React.JSX.Element {
  const {
    npCover,
    phase,
    likedNow,
    sourceName,
    title,
    artist,
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
    toggleCurrentLike,
    timeEl,
    totalEl,
    barEl,
    tipEl,
    sleepEl,
    ringEl,
    dragging,
    services,
  } = props;
  const [volOpen, setVolOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  /* 封面加载失败的地址：失败过一次就退到盘纹占位，别留一块白框。
     用「地址」而不是布尔值，换歌后新地址自然重试，不用手动清。 */
  const [coverFailed, setCoverFailed] = useState<string | null>(null);
  const showCover = npCover !== null && npCover !== coverFailed;

  return (
    <footer className="console" data-playing={playing}>
      {/* 监听区：正在播放 + 红心。整块可点跳播放页；红心是对"这一首"的表态，跟曲目走 */}
      <div className="np-zone">
        <button type="button" className="np" onClick={() => setPage("stage")} title="打开播放页">
          {/* 封面必须是 <img referrerPolicy="no-referrer">：原来的 CSS background-image
              拿不到 referrer 策略，网易云图床一律 403，底色又是近白 —— 白底上等于没有封面
              （2026-11-12 用户截图实锤：底栏左侧一片空白只剩两行字）。
              onError 退到 .blank 的黑胶盘纹，任何情况下都不留白框。 */}
          <span className="np-art-wrap">
            {showCover ? (
              <img
                className="np-art"
                src={npCover}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(npCover)}
              />
            ) : (
              <span className="np-art blank" aria-hidden="true" />
            )}
          </span>
          <span className="np-tx">
            <b>{title}</b>
            {/* 直播壳没有顶栏：错误徽标挂在控制台副行，否则播放错误看不见 */}
            {error ? (
              <span className="status" data-status={status} title={error}>
                {errorText(error)}
              </span>
            ) : (
              /* 副行 = 歌手 + 状态。歌手原来和曲名用「—」挤在同一行，
                 切到别的页只剩一行字，认不出是谁的歌（2026-11-12 用户：只看到歌名）。
                 在播的在线曲目仍报具体源名（「网易云」），「在线音源」每首一样等于没说。 */
              <span className="np-sub">
                {artist ? (
                  <>
                    {artist}
                    <i className="np-sep" aria-hidden="true">
                      ·
                    </i>
                  </>
                ) : null}
                {phase === "playing" && remote ? sourceName ?? "正在播放" : phaseLabel(phase, false)}
              </span>
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
          <NavIcon name="liked" />
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
          {/* 主键进度环：弧长 = 播放进度（App syncPosition 每帧直写 dashoffset），
              播放中整环缓速旋转（磁带盘语言），暂停停在当前角度。svg 在前、
              button position:relative 在后，层级自然正确，不需要 z-index。 */}
          <span className="tb-wrap">
            <svg className="tb-ring" viewBox="0 0 50 50" aria-hidden="true">
              <circle className="tb-ring-track" cx="25" cy="25" r="23" />
              <circle
                ref={ringEl}
                className="tb-ring-arc"
                cx="25"
                cy="25"
                r="23"
                transform="rotate(-90 25 25)"
              />
            </svg>
            <button
              type="button"
              className={`tb main${playing ? "" : " is-paused"}`}
              aria-label={playing ? "暂停" : "播放"}
              onClick={() => dispatch({ type: "player/toggle" })}
            >
              {/* 图标用 SVG 而不是 CSS border 三角：border 三角是硬边、视觉重心偏左
                  （要手调偏移才正），在 44px 球里读作"贴纸"。暂停态走白瓷球
                  （.is-paused），只有播放中才是实心青球——两种状态一眼可分。 */}
              <svg className="tb-main-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {playing ? (
                  <>
                    <rect x="7.5" y="5.5" width="3.4" height="13" rx="1.7" fill="currentColor" />
                    <rect x="13.1" y="5.5" width="3.4" height="13" rx="1.7" fill="currentColor" />
                  </>
                ) : (
                  <path
                    d="M8.6 5.9a1 1 0 0 1 1.53-.85l8.2 4.9a1.12 1.12 0 0 1 0 1.92l-8.2 4.9a1 1 0 0 1-1.53-.85V5.9Z"
                    fill="currentColor"
                  />
                )}
              </svg>
            </button>
          </span>
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
                toast(stuck.queue.stream ? "正在续下一批…" : "队列里没有下一首", "info");
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
        {/* 播出区：控制"怎么播"。图标钮 + hover 文字（title/aria-label）——文字胶囊换图标后排更轻 */}
        <button
          type="button"
          title={`播放模式：${PLAY_MODE_LABEL[queueMode]}`}
          aria-label={`播放模式：${PLAY_MODE_LABEL[queueMode]}`}
          onClick={() => dispatch({ type: "queue/mode", mode: nextPlayMode(queueMode) })}
        >
          <NavIcon name={PLAY_MODE_ICON[queueMode]} />
        </button>
        <button
          type="button"
          className={`pop${volOpen || muted ? " on" : ""}`}
          aria-expanded={volOpen}
          aria-label={muted ? "已静音" : "音量"}
          onClick={() => {
            setVolOpen(!volOpen);
            setSleepOpen(false);
          }}
          title={muted ? "已静音" : "音量"}
        >
          <NavIcon name={muted ? "mute" : "volume"} />
        </button>
        <button
          type="button"
          className={`pop${sleepOpen || sleepEndsAt || sleepPending ? " on" : ""}`}
          aria-expanded={sleepOpen}
          aria-label="睡眠定时"
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
          <NavIcon name="sleep" />
          {sleepEndsAt ? <span ref={sleepEl} className="sleep-left" /> : null}
          {sleepPending ? <span className="sleep-left">等这首完</span> : null}
        </button>
        <button
          type="button"
          className="pop"
          aria-label={`播放速度：${playbackRate.toFixed(2)}x`}
          onClick={() => {
            setRateOpen(!rateOpen);
            setVolOpen(false);
            setSleepOpen(false);
          }}
          title={`播放速度：${playbackRate.toFixed(2)}x`}
        >
          <NavIcon name="rate" />
        </button>
        {/* 面板区：控制"打开什么"——队列/音效开侧面板（有 on 态），词/迷你开新窗口 */}
        <span className="sep" aria-hidden="true" />
        <button
          type="button"
          className={queueOpen ? "on" : ""}
          aria-expanded={queueOpen}
          aria-label="播放队列"
          onClick={() => setQueueOpen((v) => !v)}
          title="播放队列（P0-10）"
        >
          <NavIcon name="queue" />
        </button>
        <button
          type="button"
          className={fxOpen ? "on" : ""}
          aria-expanded={fxOpen}
          aria-label="音效"
          onClick={() => setFxOpen(!fxOpen)}
          title="音效"
        >
          <NavIcon name="eq" />
        </button>
        <button
          type="button"
          aria-label="桌面歌词"
          onClick={() => void services.current?.openLyric()}
          title="桌面歌词"
        >
          <NavIcon name="lyrics" />
        </button>
        <button
          type="button"
          aria-label="迷你窗"
          onClick={() => void services.current?.openMini()}
          title="迷你窗"
        >
          <NavIcon name="mini" />
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
        <div className={`sleep-pop vol-pop${sleepEndsAt || sleepPending ? " armed" : ""}`} role="dialog" aria-label="睡眠定时">
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
