import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

/**
 * 迷你窗（M5 / P0-27）：只读投影 + 发意图。这里**没有任何状态** ——
 * 状态由主窗 store 推过来（节流 500ms），按钮只发 action 字符串，
 * 真正的 dispatch 在主窗。两窗进度差最多一个推送间隔，且同源同值。
 *
 * 封面只在**变了**的时候随包带过来，所以收到没带 cover 的包要沿用上一张。
 * 双击封面 = 回主窗（`focus` 由主进程直接处理，不往渲染层转）。
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
    };
  }
}

function Mini() {
  const [st, setSt] = useState<MiniState>({ status: "idle", title: "未在播放", t: 0, dur: 0 });
  const [drag, setDrag] = useState(false);
  const [dragT, setDragT] = useState(0);

  useEffect(() => {
    window.miniApi.onState((json) => {
      try {
        const patch = JSON.parse(json) as Partial<MiniState>;
        // 没带 cover 的包沿用上一张（桥只在变化时才带）
        setSt((prev) => ({ ...prev, ...patch }));
      } catch {
        /* 坏包直接丢，下一帧会再来 */
      }
    });
  }, []);

  const playing = st.status === "playing";
  const shown = drag ? dragT : st.t;
  const pct = st.dur > 0 ? Math.min(100, (shown / st.dur) * 100) : 0;

  return (
    <div className="mini">
      <div
        className={`mini-art${st.cover ? "" : " blank"}`}
        style={st.cover ? { backgroundImage: `url("${st.cover}")` } : undefined}
        onDoubleClick={() => window.miniApi.action("focus")}
        title="双击回到主窗"
      />

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
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              setDragT(v);
              window.miniApi.action(`seek:${v}`);
            }}
            onPointerDown={() => {
              setDragT(st.t);
              setDrag(true);
            }}
            onPointerUp={() => setDrag(false)}
            onBlur={() => setDrag(false)}
            aria-label="跳转"
          />
          <span className="mini-time">{fmt(st.dur)}</span>
        </div>
      </div>

      <div className="mini-btns">
        <button type="button" onClick={() => window.miniApi.action("prev")} title="上一首">
          ⏮
        </button>
        <button
          type="button"
          className="mini-toggle"
          onClick={() => window.miniApi.action("toggle")}
          title={playing ? "暂停" : "播放"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button type="button" onClick={() => window.miniApi.action("next")} title="下一首">
          ⏭
        </button>
        <button type="button" onClick={() => window.miniApi.close()} title="关闭迷你窗">
          ✕
        </button>
      </div>
    </div>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<Mini />);
