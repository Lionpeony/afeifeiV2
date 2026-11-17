import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { AppState } from "../../contracts/index.js";
import { dispatch, getState } from "../kernel/index.js";
import type { Services } from "./services.js";
import { errorText } from "../capability/errors.js";
import { fmt, phaseLabel, type PlaybackPhase } from "./playback-phase.js";
import { PLAY_MODE_LABEL } from "./play-mode.js";
import type { PlayMode } from "../../contracts/index.js";
import { toast } from "./toast.js";
import type { PageId } from "./pages.js";
import { pushPanel } from "./input/panels.js";
import type { PlayerRemote } from "./hooks/use-media-session.js";
import { useAf } from "./af/context.js";
import { sourceTone } from "./af/data.js";
import {
  IconHeart,
  IconHeartFill,
  IconMin,
  IconMore,
  IconNext,
  IconNote,
  IconPick,
  IconPrev,
  IconQueue,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
  IconVolume,
} from "./af/icons.js";
import { PlayGlyph } from "./af/ui.js";

const SLEEP_OPTIONS = [15, 30, 60];
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function PlayModeIcon({ mode }: { mode: PlayMode }) {
  if (mode === "shuffle") return <IconShuffle size={16} />;
  if (mode === "repeat-one") return <IconRepeatOne size={16} />;
  return <IconRepeat size={16} />;
}

export function Console(props: {
  npCover: string | null;
  phase: PlaybackPhase;
  likedNow: boolean;
  sourceName: string | null;
  title: string | null;
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
  page: PageId;
  queueOpen: boolean;
  fxOpen: boolean;
  setQueueOpen: Dispatch<SetStateAction<boolean>>;
  setFxOpen: Dispatch<SetStateAction<boolean>>;
  setPage: (page: PageId) => void;
  toggleCurrentLike: () => void;
  timeEl: RefObject<HTMLSpanElement | null>;
  totalEl: RefObject<HTMLSpanElement | null>;
  barEl: RefObject<HTMLInputElement | null>;
  tipEl: RefObject<HTMLSpanElement | null>;
  sleepEl: RefObject<HTMLSpanElement | null>;
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
    dragging,
    services,
  } = props;
  const af = useAf();
  const [moreOpen, setMoreOpen] = useState(false);
  const [coverFailed, setCoverFailed] = useState<string | null>(null);
  const showCover = npCover !== null && npCover !== coverFailed;
  const footerRef = useRef<HTMLElement | null>(null);
  const lit = Math.round(volume * 5);

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

  const moreTitle = sleepPending
    ? "更多 · 睡眠定时：这首播完就停"
    : sleepEndsAt
      ? sleepWaitEnd
        ? "更多 · 睡眠定时：播完当前曲再停"
        : "更多 · 睡眠定时：到点暂停，不退出"
      : `更多 · 播放速度 ${playbackRate.toFixed(2)}x`;

  const repeatLabel = queueMode === "repeat-one" ? "单曲循环" : queueMode === "order" ? "顺序播放" : "列表循环";
  const cycleRepeat = (): void => {
    const next: PlayMode = queueMode === "repeat-one" ? "order" : queueMode === "order" ? "repeat-all" : "repeat-one";
    dispatch({ type: "queue/mode", mode: next });
  };

  return (
    <footer className="bar console" data-playing={playing} data-page={page} ref={footerRef}>
      <div className="bar__left">
        <button type="button" className="bar__cover-btn" onClick={() => setPage("stage")} title="展开播放页">
          {showCover ? (
            <img
              className="bar__cover"
              src={npCover}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(npCover)}
            />
          ) : (
            <span className="bar__cover blank" aria-hidden="true" />
          )}
          {playing && <span className="bar__cover-glow" />}
        </button>
        <div className="bar__meta">
          <span className="bar__title truncate" title={title ?? ""}>{title ?? "还没选歌"}</span>
          <span className="bar__artist truncate">
            {error ? (
              <span className="status" data-status={status} title={error}>{errorText(error)}</span>
            ) : (
              <>
                {artist || phaseLabel(phase, false)}
                {remote && sourceName ? <span className="bar__src" style={{ color: sourceTone(af.source) }}>{sourceName}</span> : null}
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          className={"bar__heart np-like" + (likedNow ? " is-on on" : "")}
          aria-label={likedNow ? "取消红心" : "加红心"}
          aria-pressed={likedNow}
          disabled={!trackId}
          title={remote ? "账号红心（同步到音源）" : "本机红心"}
          onClick={toggleCurrentLike}
        >
          {likedNow ? <IconHeartFill size={16} /> : <IconHeart size={16} />}
        </button>
      </div>

      <div className="bar__center">
        <div className="bar__ctrls">
          <button
            type="button"
            className={"bar__icon" + (queueMode === "shuffle" ? " is-on" : "")}
            aria-label="随机播放"
            onClick={() => dispatch({ type: "queue/mode", mode: queueMode === "shuffle" ? "repeat-all" : "shuffle" })}
          >
            <IconShuffle size={16} />
          </button>
          <button
            type="button"
            className="bar__icon"
            aria-label="上一首"
            onClick={() => dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 })}
          >
            <IconPrev size={17} />
          </button>
          <button
            type="button"
            className={"bar__play" + (playing ? " is-playing" : "")}
            aria-label={playing ? "暂停" : "播放"}
            onClick={() => dispatch({ type: "player/toggle" })}
          >
            <PlayGlyph playing={playing} size={20} />
          </button>
          <button
            type="button"
            className="bar__icon"
            aria-label="下一首"
            onClick={() => {
              const before = getState().player.trackId;
              dispatch({ type: "queue/next" });
              if (getState().player.trackId === before) {
                const stuck = getState();
                toast(stuck.queue.stream ? "正在续下一批…" : "队列里没有下一首", "info");
              }
            }}
          >
            <IconNext size={17} />
          </button>
          <button
            type="button"
            className={"bar__icon" + (queueMode === "order" ? "" : " is-on")}
            aria-label={`播放模式：${PLAY_MODE_LABEL[queueMode]}`}
            title={repeatLabel}
            onClick={cycleRepeat}
          >
            <PlayModeIcon mode={queueMode} />
          </button>
        </div>

        <div className="bar__seek">
          <span ref={timeEl} className="bar__time">0:00</span>
          <div className="bar__seek-track">
            <input
              ref={barEl}
              className={"bar__range" + (playing ? " playing" : "")}
              type="range"
              min="0"
              max="1"
              step="1"
              defaultValue="0"
              aria-label="播放进度"
              onPointerDown={() => {
                dragging.current = true;
              }}
              onPointerUp={(e) => {
                dragging.current = false;
                dispatch({ type: "player/seek", positionMs: Number(e.currentTarget.value) });
              }}
              onLostPointerCapture={(e) => {
                if (!dragging.current) return;
                dragging.current = false;
                dispatch({ type: "player/seek", positionMs: Number(e.currentTarget.value) });
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
              onPointerMove={(e) => {
                const tip = tipEl.current;
                if (!tip) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                const duration = services.current?.engine.durationMs() ?? 0;
                tip.textContent = fmt(pct * duration);
                tip.style.left = `${pct * 100}%`;
              }}
              onChange={(e) => {
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
            <span ref={tipEl} className="bar__seek-tip" aria-hidden="true" />
          </div>
          <span ref={totalEl} className="bar__time bar__time--dim">0:00</span>
        </div>
      </div>

      <div className="bar__right">
        <button
          type="button"
          className={"bar__icon" + (muted ? " is-on" : "")}
          aria-label={muted ? "取消静音" : "静音"}
          title={muted ? "取消静音" : "静音"}
          onClick={() => dispatch({ type: "player/setMuted", muted: !muted })}
        >
          <IconVolume size={16} />
        </button>
        <div className="vol" title={"音量 " + Math.round(volume * 100) + "%"}>
          {[0, 1, 2, 3, 4].map((i) => (
            <button
              key={i}
              className={"vol__pick" + (i < lit ? " is-lit" : "")}
              onClick={() => dispatch({ type: "player/setVolume", volume: (i + 1) / 5 })}
              aria-label={"音量 " + (i + 1) * 20 + "%"}
            >
              <IconPick size={11} />
            </button>
          ))}
        </div>
        <span className="bar__sep" />
        <button
          type="button"
          className={"bar__icon" + (af.lyricsBar ? " is-on" : "")}
          onClick={() => af.setLyricsBar(!af.lyricsBar)}
          title="桌面歌词"
          aria-pressed={af.lyricsBar}
        >
          <IconNote size={17} />
        </button>
        <button type="button" className="bar__icon" onClick={() => af.setMiniMode(true)} title="迷你模式">
          <IconMin size={17} />
        </button>
        <button
          type="button"
          className={"bar__icon" + (queueOpen ? " is-on" : "")}
          aria-expanded={queueOpen}
          aria-label="播放队列"
          onClick={() => setQueueOpen((v) => !v)}
          title="播放队列"
        >
          <IconQueue size={17} />
        </button>
        <button
          type="button"
          className={"bar__icon pop" + (moreOpen ? " is-on" : "")}
          aria-expanded={moreOpen}
          aria-label="更多"
          onClick={() => setMoreOpen(!moreOpen)}
          title={moreTitle}
        >
          <IconMore size={17} />
          {sleepEndsAt ? <span ref={sleepEl} className="sleep-left" /> : null}
          {sleepPending ? <span className="sleep-left">等这首完</span> : null}
        </button>
      </div>

      <div className={"vol-pop more-pop" + (sleepEndsAt || sleepPending ? " armed" : "")} role="dialog" aria-label="更多" hidden={!moreOpen}>
        <p className="more-cap">播放</p>
        <p className="sleep-now">
          {sleepPending ? "已到点 · 这首播完就停" : sleepEndsAt ? (sleepWaitEnd ? "定时中 · 播完当前曲停" : "定时中 · 到点自动暂停") : "到点只暂停，不退出"}
        </p>
        <label className="sleep-wait">
          <input type="checkbox" checked={sleepWaitEnd} onChange={(e) => dispatch({ type: "sleep/setWaitEnd", waitEnd: e.target.checked })} />
          <span>播完当前曲再停</span>
        </label>
        <div className="sleep-opts">
          {SLEEP_OPTIONS.map((m) => (
            <button key={m} type="button" onClick={() => { dispatch({ type: "sleep/set", endsAt: Date.now() + m * 60000 }); setMoreOpen(false); }}>
              {m} 分钟
            </button>
          ))}
          <button type="button" disabled={!sleepEndsAt} onClick={() => { dispatch({ type: "sleep/clear" }); setMoreOpen(false); }}>
            取消
          </button>
        </div>
        <p className="more-cap more-cap-rate">播放速度{playbackRate !== 1 ? ` · ${playbackRate.toFixed(2)}x` : ""}</p>
        <div className="rate-opts">
          {RATE_OPTIONS.map((r) => (
            <button key={r} type="button" className={playbackRate === r ? "on" : ""} onClick={() => dispatch({ type: "player/setPlaybackRate", rate: r })}>
              {r.toFixed(2)}x
            </button>
          ))}
        </div>
        <label className="rate-pitch">
          <input type="checkbox" checked={preservesPitch} onChange={(e) => dispatch({ type: "player/setPreservesPitch", on: e.target.checked })} />
          音调补偿（变速不变调）
        </label>
        <button type="button" className="more-row" onClick={() => { af.setStudio({ tab: "eq" }); setMoreOpen(false); }} title="排练室均衡器（E）">
          打开排练室均衡器 →
        </button>
        <p className="more-cap">台侧</p>
        <button type="button" className="more-row" onClick={() => { af.setStudio({ tab: "sleep" }); setMoreOpen(false); }} title="排练室 · 定时 / 音质 / EQ">
          排练室 · 定时 / 音质 / EQ
        </button>
        <button type="button" className="more-row" onClick={() => { af.setDock(!af.dock); af.setDockPin(true); setMoreOpen(false); }} title="媒体键悬浮控制（K）">
          {af.dock ? "收起媒体键悬浮控制" : "媒体键悬浮控制（K）"}
        </button>
        <p className="more-cap">窗口</p>
        <button type="button" className="more-row" onClick={() => { void services.current?.openLyric(); setMoreOpen(false); }} title="桌面歌词">
          桌面歌词
        </button>
      </div>
    </footer>
  );
}
