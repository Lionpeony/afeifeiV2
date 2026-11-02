import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "../../contracts/index.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { bootstrap, type Services } from "./bootstrap.js";
import { onFrame } from "./compositor.js";

const pad = (n: number): string => String(n).padStart(2, "0");

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

function baseName(p: string | null): string {
  if (!p) return "未选择";
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function App() {
  const [state, setState] = useState<AppState>(getState());
  const services = useRef<Services | null>(null);
  const timeEl = useRef<HTMLSpanElement>(null);
  const barEl = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  useEffect(() => subscribe(() => setState(getState())), []);

  useEffect(() => {
    let alive = true;
    void bootstrap().then((s) => {
      if (alive) services.current = s;
    });
    return () => {
      alive = false;
    };
  }, []);

  // 每帧只写两个 DOM 节点，不触发 React 渲染 —— 进度条不该让整棵树重画
  useEffect(
    () =>
      onFrame(() => {
        const svc = services.current;
        if (!svc) return;
        const position = svc.positionMs();
        const duration = svc.engine.durationMs();
        if (timeEl.current) timeEl.current.textContent = `${fmt(position)} / ${fmt(duration)}`;
        if (barEl.current && !dragging.current) {
          barEl.current.max = String(Math.max(1, Math.round(duration)));
          barEl.current.value = String(Math.round(Math.min(position, duration || position)));
        }
      }),
    [],
  );

  const { status, trackId, volume, error } = state.player;
  const playing = status === "playing";

  const onPick = async (): Promise<void> => {
    const svc = services.current;
    if (!svc) return;
    const files = await svc.pick();
    if (files.length > 0) dispatch({ type: "queue/set", items: files, startAt: 0 });
  };

  return (
    <main className="shell">
      <header className="top">
        <h1>afeifei</h1>
        <span className="status" data-status={status}>
          {status}
          {error ? ` · ${error}` : ""}
        </span>
      </header>

      <p className="track">{baseName(trackId)}</p>

      <div className="bar">
        <input
          ref={barEl}
          type="range"
          min="0"
          max="1"
          step="1"
          defaultValue="0"
          onPointerDown={() => {
            dragging.current = true;
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onChange={(e) => dispatch({ type: "player/seek", positionMs: Number(e.target.value) })}
        />
        <span ref={timeEl} className="time">
          0:00 / 0:00
        </span>
      </div>

      <div className="buttons">
        <button type="button" onClick={() => void onPick()}>
          选文件
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 })
          }
        >
          上一首
        </button>
        <button type="button" className="primary" onClick={() => dispatch({ type: "player/toggle" })}>
          {playing ? "暂停" : "播放"}
        </button>
        <button type="button" onClick={() => dispatch({ type: "queue/next" })}>
          下一首
        </button>
      </div>

      <label className="volume">
        音量
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(e) => dispatch({ type: "player/setVolume", volume: Number(e.target.value) / 100 })}
        />
      </label>
    </main>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<App />);
