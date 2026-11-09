import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

/**
 * 迷你窗（M5 / P0-27）：只读投影 + 发意图。这里**没有任何状态** ——
 * 状态由主窗 store 推过来（节流 500ms），按钮只发 action 字符串，
 * 真正的 dispatch 在主窗。两窗进度差最多一个推送间隔，且同源同值。
 *
 * 封面只在**变了**的时候随包带过来，所以收到没带 cover 的包要沿用上一张。
 * 双击封面 = 回主窗（`focus` 由主进程直接处理，不往渲染层转）。
 * 挂载完成要喊一声 `ready()`：桥会立刻补推一次，暂停下开窗不再挂"未在播放"。
 */
interface MiniState {
  status: string;
  title: string;
  t: number;
  dur: number;
  /** 当前歌词行 + 译文（P0-27，与桌面歌词同一份投影） */
  lyric?: string;
  tr?: string;
  /** 封面：本地缩略图 dataURL 或在线地址；没封面是 null */
  cover?: string | null;
  /** 主窗当前主题（2026-11-10）：迷你窗是独立 renderer，读不到主窗的 data-theme */
  theme?: string;
}

const fmt = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

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
  const [st, setSt] = useState<MiniState>({ status: "idle", title: "未在播放", t: 0, dur: 0 });
  const [drag, setDrag] = useState(false);
  const [dragT, setDragT] = useState(0);

  useEffect(() => {
    window.miniApi.ready();
    window.miniApi.onState((json) => {
      try {
        const patch = JSON.parse(json) as Partial<MiniState>;
        // 没带 cover 的包沿用上一张（桥只在变化时才带）
        setSt((prev) => ({ ...prev, ...patch }));
        if (patch.theme) document.documentElement.dataset.theme = patch.theme;
      } catch {
        /* 坏包直接丢，下一帧会再来 */
      }
    });
  }, []);

  const playing = st.status === "playing";
  const shown = drag ? dragT : st.t;
  const pct = st.dur > 0 ? Math.min(100, (shown / st.dur) * 100) : 0;

  return (
    <div className={`mini${playing ? " is-playing" : ""}`}>
      <i className="mini-signal" aria-hidden="true" />

      <div className="mini-left">
        <div
          className={`mini-art${st.cover ? "" : " blank"}`}
          style={st.cover ? { backgroundImage: `url("${st.cover}")` } : undefined}
          onDoubleClick={() => window.miniApi.action("focus")}
          title="双击回到主窗"
        >
          <i className="mini-groove" aria-hidden="true" />
        </div>
      </div>

      <div className="mini-info">
        <p className="mini-title" title={st.title}>
          {st.title}
        </p>
        <p className={`mini-lyric${st.lyric ? "" : " quiet"}`} title={st.lyric ?? ""}>
          {st.lyric || "…"}
          {st.lyric && st.tr ? <span className="mini-tr">{st.tr}</span> : null}
        </p>
        <div className="mini-row">
          <span className="mini-time">{fmt(shown)}</span>
          <input
            className="mini-seek"
            type="range"
            min={0}
            max={Math.max(1, Math.round(st.dur))}
            value={Math.round(Math.min(shown, st.dur || shown))}
            style={{ ["--fill" as string]: `${pct}%` }}
            /* 拖动中只更新本地预览（input），松手（change）才发意图 ——
               此前 onChange 每次 input 都发 seek:，快速拖动会向主窗洪泛 dispatch */
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              setDragT(v);
              if (drag) return; // 拖动中：只画预览
              window.miniApi.action(`seek:${v}`); // 键盘/点击直接落到位置
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
            aria-label="跳转"
          />
          <span className="mini-time">{fmt(st.dur)}</span>
        </div>
      </div>

      <div className="mini-btns">
        <button type="button" onClick={() => window.miniApi.action("prev")} title="上一首" aria-label="上一首">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 3h2v10H4zM13 3v10L6.5 8z" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="mini-toggle"
          onClick={() => window.miniApi.action("toggle")}
          title={playing ? "暂停" : "播放"}
          aria-label={playing ? "暂停" : "播放"}
        >
          {playing ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 3l8 5-8 5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button type="button" onClick={() => window.miniApi.action("next")} title="下一首" aria-label="下一首">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3h2v10h-2zM3 3l6.5 5L3 13z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="mini-x" onClick={() => window.miniApi.close()} title="关闭迷你窗" aria-label="关闭迷你窗">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<Mini />);
