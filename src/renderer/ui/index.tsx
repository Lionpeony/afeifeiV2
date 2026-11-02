import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "../../contracts/index.js";
import { getFiltered, searchTracks } from "../domain/library/state.js";
import { EQ_BANDS, EQ_DEFAULT, PREAMP_DEFAULT } from "../capability/audio/eq.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { bootstrap } from "./bootstrap.js";
import type { Services } from "./services.js";
import type { Track } from "../domain/library/schema.js";
import { onFrame } from "./compositor.js";
import { EqCurve } from "./EqCurve.js";
import { StageView } from "./views/stage/index.js";
import { startMiniBridge } from "./mini-bridge.js";
import { startLyricBridge } from "./lyric-bridge.js";
import { registerCommand } from "./input/commands.js";
import { installKeyboard } from "./input/keyboard.js";
import { CommandPalette } from "./input/CommandPalette.js";
import { LibraryView } from "./views/library/index.js";
import { OnlineView, type SourceOption } from "./views/online/index.js";
import { PlaylistsView } from "./views/playlists/index.js";
import { DownloadsView } from "./views/downloads/index.js";

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
  const [tab, setTab] = useState<"local" | "online" | "playlists" | "stage" | "downloads">("local");
  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
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
      // 已播比例喂给 CSS 渐变（细线 seek 的墨色填充），不触发渲染
      const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
      barEl.current.style.setProperty("--fill", `${pct.toFixed(2)}%`);
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
      startMiniBridge(s);
      startLyricBridge();

      // 更新提示（M8）：一条线，不弹窗不打断播放
      s.onUpdateAvailable((v) => setNotice({ text: `发现新版本 v${v.version}，点击前往下载页`, url: v.url }));
      // 上次异常退出：提示一次，之后不再烦
      void s.lastCrash().then((c) => {
        if (c) {
          setNotice({ text: `上次异常退出（${c.kind}），详情见 ${c.file}` });
          void s.markCrashSeen(c.file);
        }
      });
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

  // 分组视图（M10-1）：队列 = 该专辑/歌手的曲目，比跳进全库筛选更符合直觉
  const onPlayGroup = (tracks: Track[], startAt: number): void => {
    if (tracks.length === 0) return;
    dispatch({ type: "queue/set", items: tracks.map((r) => r.path), startAt });
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

  const onImportSource = async (): Promise<void> => {
    const svc = services.current;
    if (!svc) return;
    try {
      const picked = await svc.importSource();
      if (!picked) return;
      const installed = await svc.installSource(picked.name, picked.code);
      setSources(svc.sources());
      setScanNote(`已导入音源：${installed.name}`);
      setTab("online");
    } catch (err) {
      setScanNote(err instanceof Error ? err.message : String(err));
    }
  };

  /* ---- 键盘纪律（M6）：唯一 keydown 在 input/keyboard.ts，这里只装配命令 ---- */
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const offs = [
      registerCommand({
        id: "play-toggle",
        label: "播放 / 暂停",
        hint: "Space",
        run: () => dispatch({ type: "player/toggle" }),
      }),
      registerCommand({
        id: "queue-prev",
        label: "上一首",
        run: () => dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 }),
      }),
      registerCommand({ id: "queue-next", label: "下一首", run: () => dispatch({ type: "queue/next" }) }),
      registerCommand({
        id: "tab-local",
        label: "转到：本地曲库",
        hint: "Ctrl+F 聚焦搜索",
        run: () => setTab("local"),
      }),
      registerCommand({ id: "tab-online", label: "转到：在线搜索", run: () => setTab("online") }),
      registerCommand({ id: "tab-stage", label: "转到：播放页", run: () => setTab("stage") }),
      registerCommand({
        id: "focus-search",
        label: "聚焦搜索框",
        hint: "Ctrl+F",
        run: () => {
          setTab("local");
          setTimeout(() => document.querySelector<HTMLInputElement>(".search")?.focus(), 0);
        },
      }),
      registerCommand({ id: "scan", label: "扫描目录", run: () => void onScan() }),
      registerCommand({ id: "import-source", label: "导入音源", run: () => void onImportSource() }),
      registerCommand({ id: "open-mini", label: "打开迷你窗", run: () => void services.current?.openMini() }),
      registerCommand({ id: "open-lyric", label: "打开桌面歌词", run: () => void services.current?.openLyric() }),
      registerCommand({
        id: "backup-export",
        label: "备份数据（导出到目录）",
        run: () =>
          void services.current?.exportBackup().then((dest) => {
            if (dest) setScanNote(`已备份到 ${dest}`);
          }),
      }),
      registerCommand({
        id: "backup-import",
        label: "恢复备份（重启后生效）",
        run: () =>
          void services.current?.importBackup().then((r) => {
            if (r?.restored) setScanNote("备份已恢复，重启应用后生效");
          }),
      }),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      installKeyboard({
        togglePalette: () => setPaletteOpen((v) => !v),
        togglePlay: () => dispatch({ type: "player/toggle" }),
        focusSearch: () => {
          setTab("local");
          setTimeout(() => document.querySelector<HTMLInputElement>(".search")?.focus(), 0);
        },
      }),
    [],
  );

  return (
    <main className="shell">
      <header className="top">
        <h1>afeifei</h1>
        <span className="status" data-status={status}>
          {status}
          {error ? ` · ${error}` : ""}
        </span>
        {notice ? (
          notice.url ? (
            <button
              type="button"
              className="notice"
              title={notice.text}
              onClick={() => {
                const url = notice.url;
                if (url) void services.current?.openExternal(url);
                setNotice(null);
              }}
            >
              {notice.text}
            </button>
          ) : (
            <span className="notice">{notice.text}</span>
          )
        ) : null}
      </header>

      <div className="body">
        <nav className="rail">
          {(
            [
              ["local", "本地"],
              ["online", "在线"],
              ["playlists", "歌单"],
              ["stage", "播放页"],
              ["downloads", "下载"],
            ] as const
          ).map(([id, label]) => (
            <button type="button" key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <div className="rail-tail">
            <button type="button" onClick={() => void onImportSource()}>
              导入源
            </button>
            <button type="button" onClick={() => void services.current?.openMini()}>
              迷你窗
            </button>
            <button type="button" onClick={() => void services.current?.openLyric()} title="桌面歌词（穿透态点此解锁）">
              桌面歌词
            </button>
          </div>
        </nav>

        <section className="main">
          {tab === "stage" ? (
        <StageView
          state={state}
          cover={(trackId) => services.current?.cover(trackId, trackId) ?? Promise.resolve(null)}
          lyric={(sourceId, songId) => {
            const svc = services.current;
            if (!svc) return Promise.reject(new Error("还没准备好，请稍后再试"));
            return svc.lyric(sourceId, songId);
          }}
          spectrum={(bins) => services.current?.spectrum(bins) ?? null}
          exportTheme={() => services.current?.exportTheme() ?? Promise.resolve(false)}
          importTheme={() =>
            services.current?.importTheme() ?? Promise.reject(new Error("还没准备好"))
          }
        />
      ) : tab === "local" ? (
        <LibraryView
          onPlay={onPlay}
          onPlayGroup={onPlayGroup}
          onScan={() => void onScan()}
          scanning={scanning}
          scanNote={scanNote}
          cover={(id, path) => services.current?.cover(id, path) ?? Promise.resolve(null)}
        />
      ) : tab === "downloads" ? (
        services.current ? (
          <DownloadsView
            services={services.current}
            onRemove={(id) => services.current?.removeDownload(id) ?? Promise.resolve()}
          />
        ) : (
          <p className="lib-empty">还没准备好，请稍候。</p>
        )
      ) : tab === "playlists" ? (
        <PlaylistsView
          sources={sources.filter((s) => s.canPlaylists)}
          listPlaylists={(sourceId) => {
            const svc = services.current;
            if (!svc) return Promise.resolve([]);
            return svc.listPlaylists(sourceId);
          }}
          playlistTracks={(sourceId, playlistId, page) => {
            const svc = services.current;
            if (!svc) return Promise.resolve({ items: [] });
            return svc.playlistTracks(sourceId, playlistId, page);
          }}
          onPlay={async (sourceId, track) => {
            // 与在线页同一条链路：拿地址失败由歌单页显示人话
            const svc = services.current;
            if (!svc) return;
            const url = await svc.resolveOnlineUrl(sourceId, track.sourceId, "320k");
            dispatch({
              type: "player/play",
              trackId: url,
              trackTitle: `${track.title} — ${track.artist}`,
              remote: { sourceId, songId: track.sourceId, coverUrl: track.coverUrl },
            });
          }}
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
            // 在线曲目的 trackId 是直链，标题必须单独带，否则播放条显示的是一串签名；
            // remote 带音源内标识，播放页的歌词/封面从这取
            dispatch({
              type: "player/play",
              trackId: url,
              trackTitle: `${track.title} — ${track.artist}`,
              remote: { sourceId, songId: track.sourceId, coverUrl: track.coverUrl },
            });
          }}
          loginStatus={(sourceId) =>
            services.current?.loginStatus(sourceId) ?? Promise.resolve({ loggedIn: false, nick: null })
          }
          startLogin={(sourceId, channel) => {
            const svc = services.current;
            if (!svc) return Promise.reject(new Error("还没准备好，请稍后再试"));
            return svc.startLogin(sourceId, channel);
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
          logout={(sourceId) => {
            const svc = services.current;
            return svc ? svc.logout(sourceId) : Promise.resolve();
          }}
          onDownload={(sourceId, track) => {
            const svc = services.current;
            if (!svc) return Promise.resolve("还没准备好，请稍后再试");
            return svc.downloadTrack(sourceId, track);
          }}
        />
          )}
        </section>
      </div>

      <footer className="player">
        <div className="console">
          {/* 左：正在播放。整块可点跳播放页（旧仓 console 行为），hover 左缘朱砂标尺 */}
          <button type="button" className="np" onClick={() => setTab("stage")} title="打开播放页">
            <p className="np-title">{state.player.trackTitle ?? baseName(trackId)}</p>
          </button>

          <div className="transport">
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
          </div>

          <div className="tools">

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
        </div>

        {/* 进度：3px 发丝轨 + 墨色已播 + 2px 朱砂播放头（docs/09 B1）。原生 range 保住键盘/拖拽语义 */}
        <div className="seekrow">
          <input
            ref={barEl}
            className={`seek${playing ? " playing" : ""}`}
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
                  config: { preampDb: PREAMP_DEFAULT, eq: EQ_DEFAULT, crossfadeSec: 0 },
                })
              }
            >
              重置
            </button>
          </div>
          <EqCurve gains={state.audio.eq} sampleRate={services.current?.engine.sampleRate() ?? 48000} />
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
          <label className="fx-row">
            <span>交叉淡化</span>
            <select
              value={state.audio.crossfadeSec}
              onChange={(e) => dispatch({ type: "audio/setCrossfade", sec: Number(e.target.value) })}
            >
              <option value={0}>关</option>
              <option value={3}>3 秒</option>
              <option value={6}>6 秒</option>
            </select>
            <span className="fx-val" />
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

      {paletteOpen ? (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          // 「Ctrl+K 搜索 → 播放」验收：命中本地歌直接进队列播放（拼音索引复用，见 library/state）
          searchSongs={(q) =>
            searchTracks(q).map((t) => ({
              id: `song:${t.id}`,
              label: `${t.title} — ${t.artist}`,
              hint: "本地",
              run: () => dispatch({ type: "queue/set", items: [t.path], startAt: 0 }),
            }))
          }
        />
      ) : null}
    </main>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<App />);
