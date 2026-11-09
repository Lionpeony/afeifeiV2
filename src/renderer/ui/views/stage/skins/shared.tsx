import { useEffect, useRef } from "react";
import { dispatch, getState } from "../../../../kernel/index.js";
import { onTick } from "../../../compositor.js";
import { fmt } from "../types.js";

/**
 * 三套皮肤的公共件（2026-11-10）。
 *
 * 走带仍守 P0-03：拖动中只画预览、松手才 seek；已播时间由 60Hz 心跳直接写 DOM，
 * 不把每帧拉进 React（原 StageMainLayout 就吃过这个亏）。
 * 三套皮肤只改外观（.sk-tape 的 CSS），语义只有这一份 —— 换肤不该换掉交互契约。
 */

export interface TapeApi {
  /** 已播读数（写 textContent） */
  timeRef: React.RefObject<HTMLSpanElement | null>;
  /** 总时长读数 */
  totalRef: React.RefObject<HTMLSpanElement | null>;
  /** 进度宿主：60Hz 只改它身上的 --p（0..1） */
  hostRef: React.RefObject<HTMLSpanElement | null>;
  rangeRef: React.RefObject<HTMLInputElement | null>;
  /** 引擎时长优先，缺了回落队列元数据（在线流 duration 恒 0） */
  duration(): number;
}

export function useTape(durationMs: () => number, metaDuration: number): TapeApi {
  const timeRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  const duration = (): number => {
    const fromEngine = durationMs();
    return fromEngine > 0 ? fromEngine : metaDuration;
  };

  useEffect(() => onTick((time) => {
    const total = duration();
    const pct = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
    if (hostRef.current && !dragging.current) hostRef.current.style.setProperty("--p", pct.toFixed(4));
    if (timeRef.current && !dragging.current) {
      const text = fmt(time);
      if (timeRef.current.textContent !== text) timeRef.current.textContent = text;
    }
    const totalText = total > 0 ? fmt(total) : "--:--";
    if (totalRef.current && totalRef.current.textContent !== totalText) totalRef.current.textContent = totalText;
    if (rangeRef.current && !dragging.current) {
      const max = String(Math.max(1, Math.round(total)));
      if (rangeRef.current.max !== max) rangeRef.current.max = max;
      rangeRef.current.value = String(Math.round(Math.min(time, total || time)));
    }
  }), [durationMs, metaDuration]);

  return { timeRef, totalRef, hostRef, rangeRef, duration };
}

/** 走带。外观由各皮肤覆写，结构固定（读数是同一套 DOM）。 */
export function Tape({ api }: { api: TapeApi }) {
  const drag = api.rangeRef;
  const commit = (value: string): void => {
    dispatch({ type: "player/seek", positionMs: Number(value) });
  };
  return (
    <div className="sk-tape">
      <span className="sk-t mono" ref={api.timeRef}>0:00</span>
      <span className="sk-rail" ref={api.hostRef}>
        <i className="sk-rail-bg" aria-hidden="true" />
        <i className="sk-rail-fill" aria-hidden="true" />
        <i className="sk-rail-dot" aria-hidden="true" />
        <input
          ref={drag}
          className="sk-range"
          type="range"
          min="0"
          max="1"
          step="1"
          defaultValue="0"
          aria-label="播放进度"
          onPointerDown={() => { setDrag(drag, true); }}
          onPointerUp={(event) => { setDrag(drag, false); commit(event.currentTarget.value); }}
          // 指针在窗外交代时收不到 pointerup：丢捕获也要收尾（否则走带永远停在"拖动中"）
          onLostPointerCapture={(event) => {
            if (!isDrag(drag)) return;
            setDrag(drag, false);
            commit(event.currentTarget.value);
          }}
          onPointerCancel={() => { setDrag(drag, false); }}
          onChange={(event) => {
            const el = event.currentTarget;
            if (!isDrag(drag)) { commit(el.value); return; }
            const total = Number(el.max) || 0;
            const pct = total > 0 ? Math.min(1, Number(el.value) / total) : 0;
            api.hostRef.current?.style.setProperty("--p", pct.toFixed(4));
            if (api.timeRef.current) api.timeRef.current.textContent = fmt(Number(el.value));
          }}
        />
      </span>
      <span className="sk-t end mono" ref={api.totalRef}>--:--</span>
    </div>
  );
}

/**
 * 拖动标记挂在 range 元素的 dataset 上而不是模块变量：
 * 三套皮肤可能同时挂载（切换动画期间），模块级单例会串味。
 */
function setDrag(el: React.RefObject<HTMLInputElement | null>, on: boolean): void {
  const node = el.current;
  if (!node) return;
  if (on) node.dataset.drag = "1";
  else delete node.dataset.drag;
}

function isDrag(el: React.RefObject<HTMLInputElement | null>): boolean {
  return el.current?.dataset.drag === "1";
}

/** 上一首 / 播放暂停 / 下一首。队列里没得切时与控制台同一句提示。 */
export function Transport({
  playing,
  positionMs,
  notify,
  compact = false,
}: {
  playing: boolean;
  positionMs(): number;
  notify(n: { text: string; url?: string } | null): void;
  compact?: boolean;
}) {
  return (
    <div className={`sk-transport${compact ? " compact" : ""}`}>
      <button type="button" aria-label="上一首" onClick={() => dispatch({ type: "queue/prev", atPositionMs: positionMs() })}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h2v12H4zM14 2v12L6 8z" /></svg>
      </button>
      <button type="button" className="sk-play" aria-label={playing ? "暂停" : "播放"} onClick={() => dispatch({ type: "player/toggle" })}>
        {playing
          ? <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="4" height="12" rx="1" /><rect x="9" y="2" width="4" height="12" rx="1" /></svg>
          : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" /></svg>}
      </button>
      <button type="button" aria-label="下一首" onClick={() => {
        const before = getState().player.trackId;
        dispatch({ type: "queue/next" });
        if (getState().player.trackId === before) {
          notify({ text: getState().queue.stream ? "正在续下一批…" : "队列里没有下一首" });
        }
      }}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 2h2v12h-2zM2 2l8 6-8 6z" /></svg>
      </button>
    </div>
  );
}

/** 封面。没有图时用同一个盒子的斜纹占位，不让版式因为缺封面跳一下。 */
export function Cover({ url, className = "" }: { url: string | null; className?: string }) {
  return (
    <span className={`sk-cover${url ? "" : " empty"}${className ? ` ${className}` : ""}`}>
      {url ? <img src={url} alt="" draggable={false} /> : <i aria-hidden="true">♪</i>}
    </span>
  );
}

/** 顶部导播条：三套皮肤共用一份信息（ON AIR / 队列 / 行号 / 编码），外观各自覆写。 */
export function SkinTop({
  live,
  queue,
  line,
  codec,
  shelfOpen,
  viewOpen,
  onShelf,
  onView,
}: {
  live: boolean;
  queue: string;
  line: string;
  codec: string;
  shelfOpen: boolean;
  viewOpen: boolean;
  onShelf(): void;
  onView(): void;
}) {
  return (
    <header className="sk-top">
      <span className={`sk-onair${live ? " live" : ""}`}><i aria-hidden="true" />{live ? "ON AIR" : "NOW PLAYING"}</span>
      <span className="sk-top-sep" aria-hidden="true" />
      <span className="sk-top-i mono">{queue}</span>
      <span className="sk-top-i mono">{line}</span>
      <span className="sk-top-i mono">{codec}</span>
      <span className="sk-top-grow" />
      <button type="button" className="sk-top-b" aria-expanded={shelfOpen} onClick={onShelf}>样式</button>
      <button type="button" className="sk-top-b" aria-expanded={viewOpen} onClick={onView}>视图</button>
    </header>
  );
}

/** 队列里接下来几首的显示名：在线曲目查 queue.remote，本地曲目查曲库表。 */
export function upNextRows(
  ids: string[],
  tracks: Map<string, { title: string; artist?: string }>,
  remote: Record<string, { title?: string; artist?: string }> | undefined,
): { id: string; title: string; artist: string }[] {
  return ids.map((id) => {
    const track = tracks.get(id);
    const meta = remote?.[id];
    return {
      id,
      title: track?.title ?? meta?.title ?? (id.startsWith("remote:") ? "在线曲目" : id.split(/[\\/]/).pop() ?? id),
      artist: track?.artist ?? meta?.artist ?? "",
    };
  });
}
