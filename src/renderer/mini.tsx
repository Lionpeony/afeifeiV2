import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

/**
 * 迷你窗（M5）：只读投影 + 发意图。这里**没有任何状态** ——
 * 状态由主窗 store 推过来（节流 500ms），按钮只发 action 字符串，
 * 真正的 dispatch 在主窗。两窗进度差最多一个推送间隔，且同源同值。
 */
interface MiniState {
  status: string;
  title: string;
  t: number;
  dur: number;
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
  useEffect(() => {
    window.miniApi.onState((json) => {
      try {
        setSt(JSON.parse(json) as MiniState);
      } catch {
        /* 坏包直接丢，下一帧会再来 */
      }
    });
  }, []);

  const playing = st.status === "playing";
  const pct = st.dur > 0 ? Math.min(100, (st.t / st.dur) * 100) : 0;

  return (
    <div className="mini">
      <div className="mini-info">
        <p className="mini-title" title={st.title}>
          {st.title}
        </p>
        <p className="mini-time">
          {fmt(st.t)} / {fmt(st.dur)}
        </p>
        <div className="mini-bar">
          <div className="mini-bar-fill" style={{ width: `${pct}%` }} />
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
