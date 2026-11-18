import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

/**
 * 迷你窗（M5 / P0-27）：只读投影 + 发意图。这里没有任何状态 ——
 * 状态由主窗 store 推过来（节流 500ms），按钮只发 action 字符串，
 * 真正的 dispatch 在主窗。两窗进度差最多一个推送间隔，且同源同值。
 *
 * 2026-11-18 重做：横向便签。圆形贴纸封面 + 曲名/歌手/词 + 细进度；
 * 鼠标移上来文字淡出、走带翻出（QQ 音乐节奏），样式是 AFEIFEI 自己的。
 *
 * 封面只在**变了**的时候随包带过来，所以收到没带 cover 的包要沿用上一张。
 * 点击封面 = 回主窗（`focus` 由主进程直接处理，不往渲染层转）。
 */
interface MiniState {
  status: string;
  title: string;
  artist?: string;
  source?: string;
  index?: number;
  count?: number;
  t: number;
  dur: number;
  lyric?: string;
  tr?: string;
  lit?: number;
  liked?: boolean;
  cover?: string | null;
  theme?: string;
  motion?: string;
}

const fmt = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const SOURCE_SHORT: Record<string, string> = { netease: "网易云", qq: "QQ音乐" };

declare global {
  interface Window {
    miniApi: {
      onState(cb: (json: string) => void): void;
      action(a: string): void;
      close(): void;
      ready(): void;
      onHello(cb: () => void): void;
    };
  }
}

function Mini() {
  const [st, setSt] = useState<MiniState>({ status: "idle", title: "还没选歌", t: 0, dur: 0 });
  const [drag, setDrag] = useState(false);
  const [dragT, setDragT] = useState(0);

  useEffect(() => {
    window.miniApi.ready();
    window.miniApi.onState((json) => {
      try {
        const patch = JSON.parse(json) as Partial<MiniState>;
        setSt((prev) => ({ ...prev, ...patch }));
        if (patch.theme) document.documentElement.dataset.theme = patch.theme;
        if (patch.motion) document.documentElement.dataset.motion = patch.motion;
      } catch {
        /* 坏包直接丢，下一帧会再来 */
      }
    });
  }, []);

  const playing = st.status === "playing";
  const failed = st.status === "error";
  const shown = drag ? dragT : st.t;
  const pct = st.dur > 0 ? Math.min(100, (shown / st.dur) * 100) : 0;
  const noTrack = !st.artist && st.dur <= 0;
  const initial = noTrack ? "A" : (st.title || "A").trim().slice(0, 1).toUpperCase();
  const artistText = st.artist || (noTrack ? "后台在等下一场" : "未知歌手");
  const lyricLine = failed ? "这首歌暂时播不了" : st.lyric || (noTrack ? "把第一首丢进队列就会亮起来" : "后台听歌，别被发现。");
  const lit = Math.max(0, Math.min(lyricLine.length, st.lyric ? (st.lit ?? 0) : 0));
  const setlist = st.count && st.count > 0 ? `${String(Math.max(1, st.index ?? 1)).padStart(2, "0")}/${String(st.count).padStart(2, "0")}` : "";

  return (
    <div className={"mini" + (playing ? " is-playing" : "") + (failed ? " is-failed" : "") + (noTrack ? " is-empty" : "")}>
      <div className="mini__card">
        <span className={"mini__onair" + (playing ? " is-on" : "")} aria-hidden="true">
          <i />
          {failed ? "SIGNAL LOST" : playing ? `ON AIR${setlist ? " · " + setlist : ""}` : "STANDBY"}
        </span>

        <button
          type="button"
          className="mini__art"
          onClick={() => window.miniApi.action("focus")}
          title="回到完整播放器"
          aria-label="封面，点击回到完整播放器"
        >
          <span className="mini__art-ring" aria-hidden="true" />
          {st.cover ? (
            <img key={st.cover} className="mini__img" src={st.cover} alt="" draggable={false} referrerPolicy="no-referrer" />
          ) : (
            <b className="mini__initial">{initial}</b>
          )}
        </button>

        <div className="mini__body">
          <p className="mini__title truncate" title={st.title}>{st.title}</p>
          <p className="mini__sub truncate" title={st.artist ?? ""}>
            <span>{artistText}</span>
            {st.source ? <span className="mini__src">{SOURCE_SHORT[st.source] ?? st.source}</span> : null}
          </p>
          <p key={lyricLine} className="mini__lyric truncate" title={lyricLine}>
            {st.lyric ? (
              <>
                <span className="mini__lyric-on">{lyricLine.slice(0, lit)}</span>
                <span className="mini__lyric-off">{lyricLine.slice(lit)}</span>
              </>
            ) : (
              lyricLine
            )}
          </p>
        </div>

        <div className="mini__progress">
          <span className="mini__time">{fmt(shown)}</span>
          <div className="mini__track">
            <i style={{ width: `${pct}%` }} aria-hidden="true" />
            <span className="mini__knob" style={{ left: `${pct}%` }} aria-hidden="true" />
            <input
              className="mini__range"
              type="range"
              min={0}
              max={Math.max(1, Math.round(st.dur))}
              value={Math.round(Math.min(shown, st.dur || shown))}
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                setDragT(v);
                if (!drag) window.miniApi.action(`seek:${v}`);
              }}
              onPointerDown={() => {
                setDragT(st.t);
                setDrag(true);
              }}
              onPointerUp={(e) => {
                setDrag(false);
                window.miniApi.action(`seek:${Number(e.currentTarget.value)}`);
              }}
              onBlur={() => setDrag(false)}
              aria-label="播放进度"
            />
          </div>
          <span className="mini__time is-dim">{fmt(st.dur)}</span>
        </div>

        <div className="mini__topact">
          <button type="button" className="mini__icon mini__close" onClick={() => window.miniApi.close()} title="关闭迷你窗" aria-label="关闭迷你窗">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>

        <div className="mini__controls">
          <button
            type="button"
            className={"mini__icon mini__like" + (st.liked ? " is-on" : "")}
            onClick={() => window.miniApi.action("like")}
            title={st.liked ? "取消红心" : "加红心"}
            aria-label={st.liked ? "取消红心" : "加红心"}
            aria-pressed={Boolean(st.liked)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 13.2S2.6 9.9 2.6 6.2A3 3 0 0 1 8 4.3a3 3 0 0 1 5.4 1.9c0 3.7-5.4 7-5.4 7z"
                fill={st.liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className="mini__icon mini__skip" onClick={() => window.miniApi.action("prev")} title="上一首" aria-label="上一首">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 3.4h1.8v9.2H4zM12.6 3.4v9.2L6.6 8z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="mini__play"
            onClick={() => window.miniApi.action("toggle")}
            title={playing ? "暂停" : "播放"}
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.8 3.4h2.1v9.2H4.8zM9.1 3.4h2.1v9.2H9.1z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5.7 3.2 12.6 8l-6.9 4.8z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button type="button" className="mini__icon mini__skip" onClick={() => window.miniApi.action("next")} title="下一首" aria-label="下一首">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10.2 3.4H12v9.2h-1.8zM3.4 3.4v9.2L9.4 8z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<Mini />);
