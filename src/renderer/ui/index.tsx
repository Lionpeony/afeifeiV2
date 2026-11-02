import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "../../contracts/index.js";
import { getFiltered } from "../domain/library/state.js";
import { EQ_BANDS, EQ_DEFAULT, PREAMP_DEFAULT } from "../capability/audio/eq.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { bootstrap, type Services } from "./bootstrap.js";
import { onFrame } from "./compositor.js";
import { LibraryView } from "./views/library/index.js";
import { OnlineView, type SourceOption } from "./views/online/index.js";

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
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [tab, setTab] = useState<"local" | "online">("local");
  const [fxOpen, setFxOpen] = useState(false);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const services = useRef<Services | null>(null);
  const timeEl = useRef<HTMLSpanElement>(null);
  const barEl = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  // 位置只写这两个 DOM 节点，不触发 React 渲染 —— 进度条不该让整棵树重画。
  // 状态一变（恢复 / seek / 切歌）就立即同步一次，不能只等 rAF：
  // 窗口被遮挡或后台节流时 rAF 可能几百毫秒才一帧（冒烟实测 600ms 仅 1 帧）。
  const syncPosition = (): void => {
    const svc = services.current;
    if (!svc) return;
    const position = svc.positionMs();
    const duration = svc.engine.durationMs();
    if (timeEl.current) timeEl.current.textContent = `${fmt(position)} / ${fmt(duration)}`;
    if (barEl.current && !dragging.current) {
      barEl.current.max = String(Math.max(1, Math.round(duration)));
      barEl.current.value = String(Math.round(Math.min(position, duration || position)));
    }
  };

  useEffect(() => {
    const offFrame = onFrame(syncPosition);
    const offStore = subscribe(() => {
      setState(getState());
      syncPosition();
    });
    return () => {
      offFrame();
      offStore();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void bootstrap().then((s) => {
      if (!alive) return;
      services.current = s;
      setSources(s.sources());
      syncPosition();
    });
    return () => {
      alive = false;
    };
  }, []);

  const { status, trackId, volume, error } = state.player;
  const playing = status === "playing";

  const onPlay = (index: number): void => {
    const rows = getFiltered();
    if (rows.length === 0) return;
    // 队列 = 当前筛选结果，从点击那首开始 —— 搜完直接播不会把整个库冲掉
    dispatch({ type: "queue/set", items: rows.map((r) => r.path), startAt: index });
  };

  const onScan = async (): Promise<void> => {
    const svc = services.current;
    if (!svc) return;
    setScanning(true);
    setScanNote("正在扫描…");
    try {
      const stats = await svc.scan((done, total) => setScanNote(`解析标签 ${done}/${total}`));
      if (!stats) {
        setScanNote("");
        return;
      }
      setScanNote(
        `共 ${stats.total} 首 · 新增 ${stats.added} · 变化 ${stats.changed} · 未变 ${stats.unchanged}` +
          `${stats.failed ? ` · 失败 ${stats.failed}` : ""} · 耗时 ${stats.ms}ms`,
      );
    } catch (err) {
      setScanNote(`扫描失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <main className="shell">
      <header className="top">
        <h1>afeifei</h1>
        <div className="lib-tabs">
          <button type="button" className={tab === "local" ? "on" : ""} onClick={() => setTab("local")}>
            本地
          </button>
          <button type="button" className={tab === "online" ? "on" : ""} onClick={() => setTab("online")}>
            在线
          </button>
        </div>
        <span className="status" data-status={status}>
          {status}
          {error ? ` · ${error}` : ""}
        </span>
      </header>

      {tab === "local" ? (
        <LibraryView
          onPlay={onPlay}
          onScan={() => void onScan()}
          scanning={scanning}
          scanNote={scanNote}
          cover={(id, path) => services.current?.cover(id, path) ?? Promise.resolve(null)}
        />
      ) : (
        <OnlineView
          sources={sources}
          onSearch={(sourceId, keyword) => {
            const svc = services.current;
            if (!svc) return Promise.resolve({ items: [] });
            return svc.searchOnline(sourceId, keyword);
          }}
          onPlay={async (sourceId, track) => {
            const svc = services.current;
            if (!svc) return;
            // 拿地址失败（未登录 / 无版权）会抛错，由 OnlineView 显示人话
            const url = await svc.resolveOnlineUrl(sourceId, track.sourceId, "320k");
            // 在线曲目的 trackId 是直链，标题必须单独带，否则播放条显示的是一串签名
            dispatch({ type: "player/play", trackId: url, trackTitle: `${track.title} — ${track.artist}` });
          }}
          loginStatus={() => services.current?.loginStatus() ?? Promise.resolve({ loggedIn: false, nick: null })}
          startLogin={() => {
            const svc = services.current;
            if (!svc) return Promise.reject(new Error("还没准备好，请稍后再试"));
            return svc.startLogin();
          }}
          pollLogin={(key) => {
            const svc = services.current;
            if (!svc) return Promise.resolve({ code: 0, loggedIn: false, message: "还没准备好" });
            return svc.pollLogin(key);
          }}
          sendCaptcha={(phone) => {
            const svc = services.current;
            if (!svc) return Promise.resolve({ ok: false, message: "还没准备好" });
            return svc.sendCaptcha(phone);
          }}
          loginByCaptcha={(phone, captcha) => {
            const svc = services.current;
            if (!svc) return Promise.resolve({ ok: false, message: "还没准备好" });
            return svc.loginByCaptcha(phone, captcha);
          }}
        />
      )}

      <footer className="player">
        <p className="track">{state.player.trackTitle ?? baseName(trackId)}</p>

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

          <button type="button" aria-expanded={fxOpen} onClick={() => setFxOpen(!fxOpen)}>
            音效
          </button>

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
        </div>
      </footer>

      {fxOpen && (
        <div className="fx-panel" role="dialog" aria-label="音效设置">
          <div className="fx-head">
            <span>音效</span>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "audio/restore",
                  config: { preampDb: PREAMP_DEFAULT, eq: EQ_DEFAULT },
                })
              }
            >
              重置
            </button>
          </div>
          <label className="fx-row">
            <span>前置</span>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={Math.round(state.audio.preampDb)}
              onChange={(e) => dispatch({ type: "audio/setPreamp", db: Number(e.target.value) })}
            />
            <span className="fx-val">{Math.round(state.audio.preampDb)} dB</span>
          </label>
          {state.audio.eq.map((db, i) => {
            const hz = EQ_BANDS[i];
            return (
              <label className="fx-row" key={hz}>
                <span>{hz >= 1000 ? `${hz / 1000}k` : hz}</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={Math.round(db)}
                  onChange={(e) => {
                    const gains = [...state.audio.eq];
                    gains[i] = Number(e.target.value);
                    dispatch({ type: "audio/setEq", gains });
                  }}
                />
                <span className="fx-val">{Math.round(db)} dB</span>
              </label>
            );
          })}
        </div>
      )}
    </main>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<App />);
