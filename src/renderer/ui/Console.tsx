import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

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
import { pushPanel } from "./input/panels.js";
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
 * → 播出区（模式/音量）→ 面板区（队列/迷你/更多）。组间用分隔线，
 * 带弹层的按钮统一加 pop 角标，让"点了会弹东西"看得出来。
 *
 * 两个弹层开关（音量 / 更多）是本组件的私有 UI 态，互斥关系只在按钮间成立；
 * `queueOpen` / `fxOpen` 的面板渲染在 footer 之外（队列面板、音效面板），开关留在 App 传入。
 * 「更多」弹层收拢低频入口（睡眠定时 / 播放速度 / 音效 / 桌面歌词）：
 * 睡眠与倍速**内联**在弹层里（不套第二层弹层），音效只收入口（面板还是侧板）。
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
  /** 当前页（2026-11-12「同屏让位」）：播放页已渲染当前曲大封面，底栏封面位让位只留文字 */
  page: PageId;
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
    page,
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
  const [moreOpen, setMoreOpen] = useState(false);
  /* 封面加载失败的地址：失败过一次就退到盘纹占位，别留一块白框。
     用「地址」而不是布尔值，换歌后新地址自然重试，不用手动清。 */
  const [coverFailed, setCoverFailed] = useState<string | null>(null);
  const showCover = npCover !== null && npCover !== coverFailed;
  /* 「同屏让位」（2026-11-12 评审，泛化不枚举业务页）：当前屏已有当前曲大封面
     （播放页）时，底栏封面位折叠只留文字；其余列表页保留封面。
     空态也按页面规则藏（确定性），不做"有图才藏"。 */
  const artShown = page !== "stage";
  const footerRef = useRef<HTMLElement | null>(null);

  /* 「更多」弹层：Esc 走面板栈（最上层语义统一交给 keyboard.ts），
     点外关用 pointerdown —— pointerdown 先于 click，忽略 footer 内部的点，
     否则按「更多」按钮本身会"关了又开"，弹层永远合不上。 */
  useEffect(() => {
    if (!moreOpen) return;
    const off = pushPanel("console-more", "panel", () => setMoreOpen(false));
    const onDoc = (e: PointerEvent): void => {
      if (!footerRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => {
      off();
      document.removeEventListener("pointerdown", onDoc);
    };
  }, [moreOpen]);

  /* 「更多」按钮的 hover title 全保留被收拢入口的状态说明（睡眠三种态 + 倍速现值） */
  const moreTitle = sleepPending
    ? "更多 · 睡眠定时：这首播完就停"
    : sleepEndsAt
      ? sleepWaitEnd
        ? "更多 · 睡眠定时：播完当前曲再停"
        : "更多 · 睡眠定时：到点暂停，不退出"
      : `更多 · 播放速度 ${playbackRate.toFixed(2)}x`;

  return (
    <footer className="console" data-playing={playing} data-page={page} ref={footerRef}>
      {/* 监听区：正在播放 + 红心。整块可点跳播放页；红心是对"这一首"的表态，跟曲目走 */}
      <div className="np-zone">
        <button type="button" className="np" onClick={() => setPage("stage")} title="打开播放页">
          {/* 封面必须是 <img referrerPolicy="no-referrer">：原来的 CSS background-image
              拿不到 referrer 策略，网易云图床一律 403，底色又是近白 —— 白底上等于没有封面
              （2026-11-12 用户截图实锤：底栏左侧一片空白只剩两行字）。
              onError 退到 .blank 的黑胶盘纹，任何情况下都不留白框。
              播放页大封面同屏（2026-11-12「同屏让位」）：封面位折叠（np-fold），
              DOM 保留 —— img 一直是同一个节点，折进去只是几何让位。 */}
          <span className={`np-art-wrap${artShown ? "" : " np-fold"}`}>
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
            setMoreOpen(false);
          }}
          title={muted ? "已静音" : "音量"}
        >
          <NavIcon name={muted ? "mute" : "volume"} />
        </button>
        {/* 组间发丝线：5 键按语义分两组——「怎么播」（模式、音量）/「打开什么」（队列、迷你、更多）。
            8→5（2026-11-12 评审）：睡眠/倍速/音效/歌词都是低频操作，收进「更多」弹层，
            常驻位只留每天都会点的东西。 */}
        <span className="sep" aria-hidden="true" />
        {/* 面板区：控制"打开什么"——队列开侧面板（有 on 态），迷你开新窗口 */}
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
          aria-label="迷你窗"
          onClick={() => void services.current?.openMini()}
          title="迷你窗"
        >
          <NavIcon name="mini" />
        </button>
        {/* 更多⋯：睡眠定时 / 播放速度 / 音效 / 桌面歌词的收拢入口。
            睡眠激活时挂 sleep-left 倒计时小签（syncPosition 每帧直写，不进 React）——
            入口收进弹层后，激活态不能再靠按钮 .on 表达，小签就是唯一的状态可见性。 */}
        <button
          type="button"
          className={`pop${moreOpen ? " on" : ""}`}
          aria-expanded={moreOpen}
          aria-label="更多"
          onClick={() => {
            setMoreOpen(!moreOpen);
            setVolOpen(false);
          }}
          title={moreTitle}
        >
          <NavIcon name="more" />
          {sleepEndsAt ? <span ref={sleepEl} className="sleep-left" /> : null}
          {sleepPending ? <span className="sleep-left">等这首完</span> : null}
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
      {/* 「更多」弹层：两组（播放 / 窗口）。睡眠与倍速内联成段（弹层不套弹层）；
          音效只收入口（侧板面板照旧）；歌词开独立窗。Esc / 点外关见上方 effect。 */}
      <div
        className={`vol-pop more-pop${sleepEndsAt || sleepPending ? " armed" : ""}`}
        role="dialog"
        aria-label="更多"
        hidden={!moreOpen}
      >
        <p className="more-cap">播放</p>
        {/* 睡眠定时（原独立弹层内联）：状态行带呼吸点，档位签同原语言 */}
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
                setMoreOpen(false);
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
              setMoreOpen(false);
            }}
          >
            取消
          </button>
        </div>
        {/* 播放速度（原独立弹层内联）：≠1.00 时组标行尾标现值，收着的弹层也看得见 */}
        <p className="more-cap more-cap-rate">
          播放速度{playbackRate !== 1 ? ` · ${playbackRate.toFixed(2)}x` : ""}
        </p>
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
        {/* 音效：侧板面板照旧，这里只挪入口。开着时行文案给退出路径（按钮撤了总得有地方关）。 */}
        <button
          type="button"
          className="more-row"
          aria-label={fxOpen ? "收起音效面板" : "打开音效面板"}
          onClick={() => {
            setFxOpen(!fxOpen);
            setMoreOpen(false);
          }}
          title="音效（EQ / 前置 / 交叉淡化）"
        >
          {fxOpen ? "收起音效面板" : "打开音效面板 →"}
        </button>
        <p className="more-cap">窗口</p>
        {/* 桌面歌词：歌词窗由主进程持有（渲染层看不到别的窗），无"已开"信号可读——只做打开 */}
        <button
          type="button"
          className="more-row"
          aria-label="桌面歌词"
          onClick={() => {
            void services.current?.openLyric();
            setMoreOpen(false);
          }}
          title="桌面歌词"
        >
          桌面歌词
        </button>
      </div>
    </footer>
  );
}
