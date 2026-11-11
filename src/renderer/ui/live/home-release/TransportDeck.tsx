import { useEffect, useRef, useState } from "react";

import { dispatch } from "../../../kernel/index.js";
import { onTick } from "../../compositor.js";
import { fmt } from "../../playback-phase.js";
import { PLAY_MODE_LABEL, PLAY_MODE_SHORT, nextPlayMode } from "../../play-mode.js";
import type { PlayMode } from "../../../../contracts/index.js";

/**
 * 唱机操作台（docs/29 §6.5 / SPEC-VISUAL §2.5）：双层 88px，顶发丝线，面板 60% 透。
 * 上层：当前时间（左，拍板#2：只显当前时间）+ 唱针线 + 总时长（只在轨尾一处）。
 * 下层：曲名区（整块可点 = 跳播放页，polite live region 唯一）| 走带键 | 模式文字钮。
 * 位置每帧由合成器 t 直写 DOM（不触发渲染）；模式钮按拍板/D 决策：循环/歌词/迷你/音量，
 * 队列/音效的开关是 App 组件局部态，期一接线约束下不渲染（见回报 D2）。
 */
export function TransportDeck({
  title,
  srcLine,
  playing,
  durationMs,
  mode,
  volume,
  muted,
  onOpenStage,
  onPrev,
  onLyric,
  onMini,
}: {
  /** 当前曲名；空串 = 待机（deck 直接渲染待机值，不骨架化） */
  title: string;
  /** 来源行：{今日推荐|来源} · {01}/{total} */
  srcLine: string;
  playing: boolean;
  durationMs: number;
  mode: PlayMode;
  volume: number;
  muted: boolean;
  onOpenStage(): void;
  /** 上一首：atPositionMs 用实时位置（3 秒规则），由 LiveHome 的 onTick 参照提供 */
  onPrev(): void;
  onLyric(): void;
  onMini(): void;
}) {
  const timeEl = useRef<HTMLSpanElement>(null);
  const fillEl = useRef<HTMLSpanElement>(null);
  const needleEl = useRef<HTMLSpanElement>(null);
  const [volOpen, setVolOpen] = useState(false);

  // 每帧一次：同一份 clock.t 直写时间与唱针线宽度（composite-only，不走 React）
  useEffect(
    () =>
      onTick((t) => {
        if (timeEl.current) timeEl.current.textContent = fmt(t);
        const pct = durationMs > 0 ? Math.min(1, Math.max(0, t / durationMs)) : 0;
        if (fillEl.current) fillEl.current.style.width = `${(pct * 100).toFixed(2)}%`;
        if (needleEl.current) needleEl.current.style.left = `${(pct * 100).toFixed(2)}%`;
      }),
    [durationMs],
  );

  const step = 0.05;
  const volPct = Math.round(volume * 100);

  return (
    <section className="home-deck" aria-label="唱机操作台">
      <div className="deck-top">
        <span ref={timeEl} className="deck-time">
          0:00
        </span>
        <span className="deck-line" aria-hidden="true">
          <span ref={fillEl} className="deck-fill" />
          <span ref={needleEl} className="deck-needle" />
        </span>
        <span className="deck-total">{durationMs > 0 ? fmt(durationMs) : "--:--"}</span>
      </div>
      <div className="deck-bottom">
        <button
          type="button"
          className="deck-np"
          onClick={onOpenStage}
          title="打开播放页"
          role="status"
          aria-live="polite"
          disabled={!title}
        >
          <b className="deck-title">{title || "待机中"}</b>
          {srcLine ? <span className="deck-src">{srcLine}</span> : null}
        </button>
        <div className="deck-transport">
          <button
            type="button"
            className="deck-key"
            aria-label="上一首"
            onClick={onPrev}
          >
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 2h1.8v10H3zM12 2v10L5.6 7z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="deck-key main"
            aria-label={playing ? `暂停 ${title}` : `播放 ${title}`}
            onClick={() => dispatch({ type: "player/toggle" })}
          >
            {playing ? (
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 2h2.8v10H3zM8.2 2H11v10H8.2z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M4 2l8 5-8 5z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="deck-key"
            aria-label="下一首"
            onClick={() => dispatch({ type: "queue/next" })}
          >
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M9.2 2H11v10H9.2zM2 2l6.4 5L2 12z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <div className="deck-modes">
          <button
            type="button"
            className={`deck-mode${mode !== "order" ? " on" : ""}`}
            title={`播放模式：${PLAY_MODE_LABEL[mode]}`}
            aria-label={`播放模式：${PLAY_MODE_LABEL[mode]}`}
            onClick={() => dispatch({ type: "queue/mode", mode: nextPlayMode(mode) })}
          >
            {PLAY_MODE_SHORT[mode]}
          </button>
          <button type="button" className="deck-mode" aria-label="桌面歌词" onClick={onLyric}>
            歌词
          </button>
          <button type="button" className="deck-mode" aria-label="迷你窗" onClick={onMini}>
            迷你
          </button>
          <span
            className={`deck-vol${volOpen ? " open" : ""}`}
            onMouseEnter={() => setVolOpen(true)}
            onMouseLeave={() => setVolOpen(false)}
          >
            <button
              type="button"
              className={`deck-mode${muted ? " on" : ""}`}
              aria-expanded={volOpen}
              aria-label={muted ? "已静音" : "音量"}
              onFocus={() => setVolOpen(true)}
              onBlur={() => setVolOpen(false)}
            >
              音量
            </button>
            <span className="deck-vol-pop" hidden={!volOpen}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={volPct}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={volPct}
                aria-valuetext={`${volPct}%`}
                aria-label="音量"
                onChange={(e) => {
                  const v = Number(e.currentTarget.value) / 100;
                  dispatch({ type: "player/setVolume", volume: v });
                  if (muted && v > 0) dispatch({ type: "player/setMuted", muted: false });
                }}
              />
              <i>{volPct}</i>
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
