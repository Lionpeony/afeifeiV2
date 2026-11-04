import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "../../contracts/index.js";
import { getFiltered, searchTracks } from "../domain/library/state.js";
import { EQ_BANDS, EQ_DEFAULT, EQ_PRESETS, PREAMP_DEFAULT, sameGains } from "../capability/audio/eq.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { bootstrap } from "./bootstrap.js";
import type { Services } from "./services.js";
import type { Track } from "../domain/library/schema.js";
import { onFrame } from "./compositor.js";
import { EqCurve } from "./EqCurve.js";
import { Toaster } from "./Toaster.js";
import { StageView } from "./views/stage/index.js";
import { ChartsView } from "./views/charts/index.js";
import type { RemoteTrack } from "../../contracts/capability.js";
import { startMiniBridge } from "./mini-bridge.js";
import { startLyricBridge } from "./lyric-bridge.js";
import { clearLyric, loadLyric, setManualLyric, setUserOffset } from "./lyric-source.js";
import { lyricBindKey } from "../domain/lyrics/bindings.js";
import { toggleLike } from "../domain/likes/index.js";
import { SEEK_STEP_MS } from "./input/keymap.js";
import { browserNetEnv, createNetStatus } from "./net-status.js";
import { phaseLabel, phaseOf } from "./playback-phase.js";
import { FindLyric } from "./FindLyric.js";
import { registerCommand, runCommand } from "./input/commands.js";
import { commandIdFor } from "./input/media.js";
import { currentTheme, type Theme } from "./theme.js";
import { installKeyboard } from "./input/keyboard.js";
import { CommandPalette } from "./input/CommandPalette.js";
import { HomeView, type DailyBundle } from "./views/home/index.js";
import { LikedView } from "./views/liked/index.js";
import { RadioView } from "./views/radio/index.js";
import { RecentView } from "./views/recent/index.js";
import { RoamView } from "./views/roam/index.js";
import { SettingsView } from "./views/settings/index.js";
import { getTracks } from "../domain/library/state.js";
import { LibraryView } from "./views/library/index.js";
import { OnlineView, type SourceOption } from "./views/online/index.js";
import { DownloadsView } from "./views/downloads/index.js";
import { NavIcon } from "./icons.js";
import { NAV_FOOT, NAV_MAIN, NAV_MINE, PAGE_LABEL, type PageId } from "./pages.js";
import { createMediaSession, type MediaSessionController } from "./media-session.js";
import { PLAY_MODE_LABEL, PLAY_MODE_SHORT, nextPlayMode } from "./play-mode.js";
import { QueuePanel } from "./QueuePanel.js";
import { pushPanel } from "./input/panels.js";
import { errorText, isRetryable } from "../capability/errors.js";
import { createShortcuts, type ShortcutStatus, type ShortcutsController } from "./shortcuts.js";
import { DEFAULT_BINDINGS, type ShortcutBinding } from "../domain/shortcuts/index.js";

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

/** 顶栏日期：设计稿是「2026.11.01 · SUN」这种票根式戳记。 */
const today = (): string => {
  const d = new Date();
  const wd = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()];
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} · ${wd}`;
};

/** 睡眠定时档位（A-23）。30 分钟是主档，验收就按它。 */
const SLEEP_OPTIONS = [15, 30, 60];

/** 倍速档位（抄 lx 的 0.5–2 限幅，取常用档位做按钮）。 */
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function App() {
  const [state, setState] = useState<AppState>(getState());
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [page, setPage] = useState<PageId>("local");
  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
  const [fxOpen, setFxOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [volOpen, setVolOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [theme, setThemeState] = useState<Theme>("light");
  const [npCover, setNpCover] = useState<string | null>(null);
  const services = useRef<Services | null>(null);
  const timeEl = useRef<HTMLSpanElement>(null);
  const totalEl = useRef<HTMLSpanElement>(null);
  const barEl = useRef<HTMLInputElement>(null);
  const tipEl = useRef<HTMLSpanElement>(null);
  const sleepEl = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  // 位置只写这两个 DOM 节点，不触发 React 渲染 —— 进度条不该让整棵树重画。
  // 状态一变（恢复 / seek / 切歌）就立即同步一次，不能只等 rAF：
  // 窗口被遮挡或后台节流时 rAF 可能几百毫秒才一帧（冒烟实测 600ms 仅 1 帧）。
  const syncPosition = (): void => {
    const svc = services.current;
    if (!svc) return;
    const position = svc.positionMs();
    const duration = svc.engine.durationMs();
    // 拖动中不写已播时间：那时显示的应该是"要跳到哪儿"，不是"现在在哪"（P0-03）
    if (timeEl.current && !dragging.current) timeEl.current.textContent = fmt(position);
    if (totalEl.current) totalEl.current.textContent = fmt(duration);
    if (barEl.current && !dragging.current) {
      barEl.current.max = String(Math.max(1, Math.round(duration)));
      barEl.current.value = String(Math.round(Math.min(position, duration || position)));
      // 已播比例喂给 CSS 渐变（细线 seek 的墨色填充），不触发渲染
      const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
      barEl.current.style.setProperty("--fill", `${pct.toFixed(2)}%`);
    }
    // 睡眠定时剩余时间同样只写 DOM：1s 一个 setInterval 会违反「时间唯一」（I1），
    // 而 deadline 是绝对的，掉帧后补算也不会累积误差。
    if (sleepEl.current) {
      const endsAt = getState().sleep.endsAt;
      if (endsAt !== null) sleepEl.current.textContent = fmt(Math.max(0, endsAt - Date.now()));
    }
  };

  /* 明暗切换（docs/09 B4）：当前值以 DOM 上的 data-theme 为准，不靠闭包里的旧 state。 */
  const toggleTheme = (): void => {
    const svc = services.current;
    if (!svc) return;
    setThemeState(svc.setTheme(currentTheme() === "dark" ? "light" : "dark"));
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
      setThemeState(s.theme);
      syncPosition();
      startMiniBridge(s);
      startLyricBridge(s);

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

  const { status, trackId, volume, muted, error, trackTitle, remote } = state.player;
  const playing = status === "playing";
  // P0-26：解码中（status=loading）与缓冲中（playing + waiting）是两个词
  const phase = phaseOf(status, state.player.buffering);
  const sleepEndsAt = state.sleep.endsAt;
  const sleepWaitEnd = state.sleep.waitEnd;
  const sleepPending = state.sleep.pending;
  const queueMode = state.queue.mode;
  const playbackRate = state.player.playbackRate;
  const preservesPitch = state.player.preservesPitch;
  const [rateOpen, setRateOpen] = useState(false);
  /* 最新状态镜像：媒体会话的 handler 闭包里要读当前值，不能吃渲染那一刻的旧快照 */
  const stateRef = useRef(state);
  stateRef.current = state;
  const npCoverRef = useRef<string | null>(null);
  npCoverRef.current = npCover;

  /**
   * 睡眠定时（A-23）：只在截止时刻挂一个 setTimeout 触发 `sleep/expire`。
   * 不用 setInterval 刷界面（I1：时间唯一），剩余时间由合成器帧里的 syncPosition 写 DOM；
   * 也不在 reducer 里读 Date.now() —— kernel 只做状态转移，时间在 UI 侧。
   */
  useEffect(() => {
    if (sleepEndsAt === null) return;
    const id = setTimeout(() => dispatch({ type: "sleep/expire" }), Math.max(0, sleepEndsAt - Date.now()));
    return () => clearTimeout(id);
  }, [sleepEndsAt]);

  /* console 的 56px 封面：本地曲目走文件封面，在线曲目用音源给的封面地址。 */
  useEffect(() => {
    let alive = true;
    const svc = services.current;
    if (!svc || !trackId) {
      setNpCover(null);
      return;
    }
    void svc
      .cover(trackId, remote?.coverUrl ?? trackId)
      .then((url) => {
        if (alive) setNpCover(url);
      })
      .catch(() => {
        if (alive) setNpCover(null);
      });
    return () => {
      alive = false;
    };
  }, [trackId, remote?.coverUrl]);

  /*
   * 系统媒体会话（Windows SMTC / 系统媒体面板 + 媒体键）：抄 lx-music-desktop 的
   * useMediaSessionInfo.ts（结构语义 1:1，含静音保活与 9 个 action handler）。
   * 位置每秒同步一次；曲目 / 播放态 / 封面变化立刻同步。
   */
  const mediaSessionRef = useRef<MediaSessionController | null>(null);
  useEffect(() => {
    const ctrl = createMediaSession({
      read: () => {
        const st = stateRef.current;
        const id = st.player.trackId;
        if (!id) return null;
        const track = getTracks().find((t) => t.id === id);
        return {
          title: st.player.trackTitle ?? baseName(id),
          artist: track?.artist ?? "",
          album: track?.album ?? "",
          artwork: st.player.remote?.coverUrl ?? npCoverRef.current,
          playbackState: st.player.status === "playing" ? "playing" : "paused",
          positionMs: services.current?.positionMs() ?? 0,
          durationMs: services.current?.engine.durationMs() ?? 0,
        };
      },
      toggle: () => dispatch({ type: "player/toggle" }),
      next: () => dispatch({ type: "queue/next" }),
      prev: () => dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 }),
      seek: (positionMs) => dispatch({ type: "player/seek", positionMs }),
      seekBy: (deltaMs) =>
        dispatch({
          type: "player/seek",
          positionMs: Math.max(0, (services.current?.positionMs() ?? 0) + deltaMs),
        }),
    });
    mediaSessionRef.current = ctrl;
    // 上报能力：主进程据此决定媒体键归 Chromium 的 MediaSession（Windows SMTC）还是 globalShortcut 兜底
    window.api.setMediaSessionSupported(ctrl.supported);
    return () => {
      ctrl.dispose();
      mediaSessionRef.current = null;
    };
  }, []);

  /* 曲目 / 播放态 / 封面变化 → 立刻同步系统媒体会话 */
  useEffect(() => {
    mediaSessionRef.current?.update();
  }, [trackId, trackTitle, status, npCover, remote?.coverUrl]);

  /* 位置推进：每 500ms 同步一次 positionState（系统面板的进度条）。不跟帧走 —— 那是白烧。 */
  useEffect(() => {
    let last = 0;
    return onFrame((now) => {
      if (now - last < 500) return;
      last = now;
      mediaSessionRef.current?.update();
    });
  }, []);

  const onPlay = (index: number): void => {
    const rows = getFiltered();
    if (rows.length === 0) return;
    // 队列 = 当前筛选结果，从点击那首开始 —— 搜完直接播不会把整个库冲掉
    dispatch({ type: "queue/set", items: rows.map((r) => r.path), startAt: index });
    // queue/set 只落 loading，不会自己起播 —— 补一脚 play（已在播时幂等）
    dispatch({ type: "player/play" });
  };

  // 分组视图（M10-1）：队列 = 该专辑/歌手的曲目，比跳进全库筛选更符合直觉
  const onPlayGroup = (tracks: Track[], startAt: number): void => {
    if (tracks.length === 0) return;
    dispatch({ type: "queue/set", items: tracks.map((r) => r.path), startAt });
    // 同上：set 完起播，私人 FM / 电台 / 专辑「开始收听」都走这里
    dispatch({ type: "player/play" });
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
      setPage("online");
    } catch (err) {
      setScanNote(err instanceof Error ? err.message : String(err));
    }
  };

  /* ---- 队列面板进"面板栈"：Esc 关最上层交给 input/keyboard.ts 统一裁，不另挂 keydown ---- */
  useEffect(() => {
    if (!queueOpen) return;
    return pushPanel("queue", "panel", () => setQueueOpen(false));
  }, [queueOpen]);

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
        hint: "Shift+←",
        run: () => dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 }),
      }),
      registerCommand({
        id: "queue-next",
        label: "下一首",
        hint: "Shift+→",
        run: () => dispatch({ type: "queue/next" }),
      }),
      registerCommand({
        id: "volume-up",
        label: "音量 +",
        hint: "↑",
        run: () => dispatch({ type: "player/setVolume", volume: getState().player.volume + 0.05 }),
      }),
      registerCommand({
        id: "volume-down",
        label: "音量 −",
        hint: "↓",
        run: () => dispatch({ type: "player/setVolume", volume: getState().player.volume - 0.05 }),
      }),
      registerCommand({
        id: "queue-mode",
        label: "切换播放模式",
        run: () =>
          dispatch({ type: "queue/mode", mode: nextPlayMode(stateRef.current.queue.mode) }),
      }),
      registerCommand({
        id: "tab-home",
        label: "转到：首页",
        run: () => setPage("home"),
      }),
      registerCommand({
        id: "tab-local",
        label: "转到：本地曲库",
        hint: "Ctrl+F 聚焦搜索",
        run: () => setPage("local"),
      }),
      registerCommand({ id: "tab-online", label: "转到：在线搜索", run: () => setPage("online") }),
      registerCommand({ id: "tab-radio", label: "转到：电台", run: () => setPage("radio") }),
      registerCommand({ id: "tab-roam", label: "转到：漫游", run: () => setPage("roam") }),
      registerCommand({ id: "tab-liked", label: "转到：喜欢的音乐", run: () => setPage("liked") }),
      registerCommand({ id: "tab-recent", label: "转到：最近播放", run: () => setPage("recent") }),
      registerCommand({ id: "tab-settings", label: "转到：设置", run: () => setPage("settings") }),
      registerCommand({ id: "tab-stage", label: "转到：播放页", run: () => setPage("stage") }),
      registerCommand({
        id: "focus-search",
        label: "聚焦搜索框",
        hint: "Ctrl+F",
        run: () => {
          setPage("local");
          setTimeout(() => document.querySelector<HTMLInputElement>(".search")?.focus(), 0);
        },
      }),
      registerCommand({ id: "scan", label: "扫描目录", run: () => void onScan() }),
      registerCommand({ id: "theme-toggle", label: "切换日间 / 夜间", run: toggleTheme }),
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

  /* ---- 媒体键 / 托盘命令（A-24）：走命令注册表，不另写一套播放语义 ---- */
  useEffect(() => {
    window.api.onPlaybackCommand((cmd) => {
      const id = commandIdFor(cmd);
      if (id) runCommand(id);
    });
  }, []);

  /*
   * 全局快捷键（A-24 可配置那半）：读档 → 注册到主进程 → 按键回来执行动作。
   * 动作语义仍走命令注册表（播放语义只有一份）。
   */
  /**
   * seek（窗口内 `←/→` 与全局 `Ctrl+Alt+←/→` 共用一份）：两端都夹住整曲范围。
   * 两处各写一份的话，"往前到底"和"往后越界"迟早会不一致。
   */
  /* 离线态（P0-25）：事件驱动 + 300ms 去抖（切换 Wi-Fi 会瞬断瞬连，别闪屏） */
  useEffect(() => {
    const net = createNetStatus(browserNetEnv());
    const off = net.subscribe((s) => setOffline(s === "offline"));
    const stop = net.start();
    return () => {
      off();
      stop();
    };
  }, []);

  const seekByDelta = (deltaMs: number): void => {
    const svc = services.current;
    if (!svc) return;
    const dur = svc.engine.durationMs();
    const target = svc.positionMs() + deltaMs;
    const next = Math.max(0, dur > 0 ? Math.min(dur, target) : target);
    dispatch({ type: "player/seek", positionMs: next });
  };

  const shortcutsRef = useRef<ShortcutsController | null>(null);
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutStatus[]>([]);
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBinding[]>(
    DEFAULT_BINDINGS.map((b) => ({ ...b })),
  );
  useEffect(() => {
    const ctrl = createShortcuts(
      {
        readStore: (key) => window.api.readStore(key),
        writeStore: (key, json) => window.api.writeStore(key, json),
        setGlobalShortcuts: (bindings) => window.api.setGlobalShortcuts(bindings),
        onGlobalShortcut: (cb) => window.api.onGlobalShortcut(cb),
        onGlobalShortcutStatus: (cb) => window.api.onGlobalShortcutStatus(cb),
      },
      (action) => {
        // 能落到命令注册表的都走命令（播放语义只有一份）
        const id = commandIdFor(action);
        if (id) {
          runCommand(id);
          return;
        }
        if (action === "seek-forward") {
          seekByDelta(SEEK_STEP_MS);
          return;
        }
        if (action === "seek-back") {
          seekByDelta(-SEEK_STEP_MS);
          return;
        }
        if (action === "volume-up" || action === "volume-down") {
          const cur = getState().player;
          const delta = action === "volume-up" ? 0.05 : -0.05;
          dispatch({ type: "player/setVolume", volume: cur.volume + delta });
        }
      },
    );
    shortcutsRef.current = ctrl;
    const off = ctrl.onStatus(setShortcutStatus);
    void ctrl.init().then((b) => setShortcutBindings(b));
    return () => {
      off();
      shortcutsRef.current = null;
    };
  }, []);

  /**
   * 托盘（A-25）：把「在播什么 + 是否在播」推给主进程。
   * 用最后发送值去重 —— 音量/进度每次变化都会触发订阅，但托盘只关心这两项。
   */
  const traySent = useRef("");
  useEffect(() => {
    const title = trackId ? (trackTitle ?? baseName(trackId)) : null;
    const key = `${playing ? "1" : "0"}|${title ?? ""}`;
    if (key === traySent.current) return;
    traySent.current = key;
    window.api.pushTrayState({ playing, title });
  }, [playing, trackId, trackTitle]);

  /**
   * 歌词（A-02）：切歌时由外壳统一取，播放页只订阅。
   * 桌面歌词窗的判据是"与主窗同步"，不该以"用户点开过播放页"为前提——
   * 之前 doc 由 StageView 写入，没进播放页就一直是空的。
   */
  const lyricKey = remote ? `${remote.sourceId}:${remote.songId}` : `local:${trackId ?? ""}`;
  useEffect(() => {
    if (remote) {
      void loadLyric(remote.sourceId, remote.songId, (sourceId, songId) => {
        const svc = services.current;
        return svc ? svc.lyric(sourceId, songId) : Promise.reject(new Error("还没准备好，请稍后再试"));
      });
      return;
    }
    if (!trackId) {
      clearLyric("");
      return;
    }
    // 本地曲目（P0-20）：同名 .lrc → 内嵌标签 → LRCLIB，都没有就是「纯音乐」。
    // 取词与缓存都在 bootstrap 的 services 里，这里只挑曲目。
    const track = getTracks().find((t) => t.id === trackId);
    void loadLyric("local", trackId, () => {
      const svc = services.current;
      return svc ? svc.localLyric(track) : Promise.reject(new Error("还没准备好，请稍后再试"));
    });
  }, [lyricKey]);

  /**
   * 歌词校准（P0-18）：把这**这一首**的偏移推给 lyric-source。
   * 放在取词 effect 之后：切歌时 loadLyric 先发起（异步），这里同步把偏移换掉，
   * 等词回来时用的就是新偏移。改同一首的校准则立刻重排。
   */
  const lyricOffset = state.lyrics.offsets[trackId ?? ""] ?? 0;
  useEffect(() => {
    setUserOffset(lyricOffset);
  }, [lyricOffset, lyricKey]);

  /* 换词弹窗（P0-19）的初始查询：本地「歌名 歌手」，在线用标题（那里已经是「歌名 — 歌手」）。 */
  const findTrack = findOpen && !remote && trackId ? getTracks().find((t) => t.id === trackId) : undefined;
  const findQuery = remote
    ? (trackTitle ?? "")
    : findTrack
      ? `${findTrack.title} ${findTrack.artist}`
      : trackId
        ? baseName(trackId)
        : "";

  /**
   * 键位表（P0-22）：键 → 语义在 `input/keymap.ts`（纯函数、一条键一条用例），
   * 这里只把语义接到 dispatch 上。焦点纪律由 `installKeyboard` 前置拦掉。
   * 依赖 `[page]`：0–9 只在播放页生效，换页必须换一份闭包。
   */
  useEffect(
    () =>
      installKeyboard({
        togglePalette: () => setPaletteOpen((v) => !v),
        togglePlay: () => dispatch({ type: "player/toggle" }),
        focusSearch: () => {
          setPage("local");
          setTimeout(() => document.querySelector<HTMLInputElement>(".search")?.focus(), 0);
        },
        page: () => page,
        seekBy: seekByDelta,
        seekPercent: (percent) => {
          const svc = services.current;
          if (!svc) return;
          const dur = svc.engine.durationMs();
          if (dur <= 0) return; // 还没解码出时长：宁可不跳，也不要跳到 0
          dispatch({ type: "player/seek", positionMs: Math.round((dur * percent) / 100) });
        },
        prev: () => dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 }),
        next: () => dispatch({ type: "queue/next" }),
        volumeBy: (delta) =>
          dispatch({ type: "player/setVolume", volume: getState().player.volume + delta }),
        mute: () => dispatch({ type: "player/setMuted", muted: !getState().player.muted }),
        like: () => {
          const p = getState().player;
          // 在线曲目的 trackId 是直链，换了直链就是另一首 —— 红心只记本地曲目
          if (!p.trackId || p.remote) return;
          toggleLike(p.trackId);
        },
      }),
    [page],
  );

  /**
   * 在线曲目播放（在线页与榜单页共用一条链路）：
   * 先拿地址再 player/play —— 拿不到（未登录 / 无版权）就抛，由页面显示人话。
   */
  const playRemote = async (sourceId: string, track: RemoteTrack): Promise<void> => {
    const svc = services.current;
    if (!svc) return;
    const url = await svc.resolveOnlineUrl(sourceId, track.sourceId, "320k");
    dispatch({
      type: "player/play",
      trackId: url,
      trackTitle: `${track.title} — ${track.artist}`,
      remote: { sourceId, songId: track.sourceId, coverUrl: track.coverUrl },
    });
  };

  /**
   * 首页的账号每日推荐（R1）。
   * 选第一个「有账号能力且已登录」的源；都没有就把「有账号能力但没登录」这句话带回去——
   * 不带的话用户只看得到本地推荐，永远不知道自己登录后这里是另一份。
   */
  const dailyForHome = async (): Promise<DailyBundle> => {
    const svc = services.current;
    if (!svc) return { sourceId: "", songs: [], hint: null };
    let sawAccount = false;
    for (const s of svc.sources()) {
      if (!s.canAccount) continue;
      sawAccount = true;
      const st = await svc.loginStatus(s.id).catch(() => ({ loggedIn: false, nick: null }));
      if (!st.loggedIn) continue;
      return { sourceId: s.id, songs: await svc.accountDailySongs(s.id), hint: null };
    }
    return {
      sourceId: "",
      songs: [],
      hint: sawAccount ? "登录网易云后，这里换成你账号的每日推荐" : null,
    };
  };

  /* ---- 页面挂载：加页只改这里 + pages.ts，不再有涨到十个分支的三元链 ---- */
  const renderPage = (): ReactNode => {
    switch (page) {
      case "stage":
        return (
          <StageView
            state={state}
            cover={(trackId) => services.current?.cover(trackId, trackId) ?? Promise.resolve(null)}
            spectrum={(bins) => services.current?.spectrum(bins) ?? null}
            exportTheme={() => services.current?.exportTheme() ?? Promise.resolve(false)}
            importTheme={() => services.current?.importTheme() ?? Promise.reject(new Error("还没准备好"))}
            durationMs={() => services.current?.engine.durationMs() ?? 0}
            findLyric={() => setFindOpen(true)}
          />
        );
      case "home":
        return (
          <HomeView
            onPlayGroup={onPlayGroup}
            cover={(id, path) => services.current?.cover(id, path) ?? Promise.resolve(null)}
            onGo={setPage}
            daily={dailyForHome}
            onPlayRemote={(sourceId, track) => {
              void playRemote(sourceId, track).catch((err: unknown) => {
                setNotice({ text: err instanceof Error ? err.message : "这首歌暂时播不了" });
              });
            }}
          />
        );
      case "liked":
        return <LikedView onPlayGroup={onPlayGroup} />;
      case "recent":
        return <RecentView onPlayGroup={onPlayGroup} />;
      case "radio":
        return (
          <RadioView
            onPlayGroup={onPlayGroup}
            now={
              trackId
                ? { title: trackTitle ?? baseName(trackId), artist: remote ? "在线音源" : "本地曲库" }
                : null
            }
          />
        );
      case "roam":
        return (
          <RoamView
            onPlayGroup={onPlayGroup}
            cover={(id, path) => services.current?.cover(id, path) ?? Promise.resolve(null)}
          />
        );
      case "settings":
        return (
          <SettingsView
            theme={theme}
            onTheme={(next) => {
              const svc = services.current;
              if (svc) setThemeState(svc.setTheme(next));
            }}
            trackCount={getTracks().length}
            scanning={scanning}
            notice={scanNote}
            onScan={() => void onScan()}
            onOpenFx={() => setFxOpen(true)}
            onOpenLyric={() => void services.current?.openLyric()}
            onOpenMini={() => void services.current?.openMini()}
            playOnError={state.playback.onError}
            onPlayOnError={(value) => dispatch({ type: "playback/setOnError", onError: value })}
            outputId={state.audio.outputId}
            onOutput={(id) => dispatch({ type: "audio/setOutput", id })}
            shortcutBindings={shortcutBindings}
            shortcutStatus={shortcutStatus}
            onShortcutChange={async (action, acc) => {
              const ctrl = shortcutsRef.current;
              if (!ctrl) return "快捷键还没准备好";
              const err = await ctrl.setBinding(action, acc);
              setShortcutBindings(ctrl.bindings());
              return err;
            }}
            onShortcutReset={async () => {
              const ctrl = shortcutsRef.current;
              if (!ctrl) return;
              await ctrl.resetDefaults();
              setShortcutBindings(ctrl.bindings());
            }}
            onExportBackup={() =>
              void services.current?.exportBackup().then((dest) => {
                if (dest) setScanNote(`已备份到 ${dest}`);
              })
            }
            onImportBackup={() =>
              void services.current?.importBackup().then((r) => {
                if (r?.restored) setScanNote("备份已恢复，重启应用后生效");
              })
            }
          />
        );
      case "local":
        return (
          <LibraryView
            onPlay={onPlay}
            onPlayGroup={onPlayGroup}
            onAddToQueue={(ids) => dispatch({ type: "queue/add", items: ids })}
            onScan={() => void onScan()}
            scanning={scanning}
            scanNote={scanNote}
            cover={(id, path) => services.current?.cover(id, path) ?? Promise.resolve(null)}
          />
        );
      case "downloads":
        return services.current ? (
          <DownloadsView
            services={services.current}
            onRemove={(id) => services.current?.removeDownload(id) ?? Promise.resolve()}
          />
        ) : (
          <p className="lib-empty">还没准备好，请稍候。</p>
        );
      case "charts":
        return (
          <ChartsView
            sources={sources.filter((s) => s.canToplists)}
            listToplists={(sourceId) => {
              const svc = services.current;
              return svc ? svc.listToplists(sourceId) : Promise.reject(new Error("还没准备好，请稍后再试"));
            }}
            playlistTracks={(sourceId, listId, page) => {
              const svc = services.current;
              return svc
                ? svc.playlistTracks(sourceId, listId, page)
                : Promise.reject(new Error("还没准备好，请稍后再试"));
            }}
            onPlay={playRemote}
          />
        );
      case "online":
        return (
          <OnlineView
            sources={sources}
            onSearch={(sourceId, keyword) => {
              const svc = services.current;
              if (!svc) return Promise.resolve({ items: [] });
              return svc.searchOnline(sourceId, keyword);
            }}
            onPlay={playRemote}
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
        );
      default:
        // 还没落地的页：给明确的路标，而不是白屏
        return (
          <div className="wip">
            <p className="wip-label">UNDER CONSTRUCTION · 施工中</p>
            <h2>{PAGE_LABEL[page]}</h2>
            <p>这一页正在按 design-demos/pages-v11 的稿子重建，先前的实现不迁移。</p>
          </div>
        );
    }
  };

  const navBtn = (item: (typeof NAV_MAIN)[number]): ReactNode => (
    <button
      type="button"
      key={item.id}
      data-page={item.id}
      className={`it${item.small ? " sm" : ""}${page === item.id ? " on" : ""}`}
      onClick={() => setPage(item.id)}
      title={item.label}
    >
      <NavIcon name={item.icon} />
      <span>{item.label}</span>
    </button>
  );

  return (
    <main className={offline ? "shell offline" : "shell"}>
      {/* 离线态（P0-25）：常驻横幅，不用 toast —— 断网期间 toast 会反复刷屏 */}
      {offline ? (
        <div className="net-banner" role="status" aria-live="polite">
          离线 · 只放本地曲目，在线搜索/登录/榜单暂不可用
        </div>
      ) : null}
      <header className="tbar">
        <h1 className="brand">
          <i />
          afeifei
        </h1>
        <span className="brand-cn">阿飞飞</span>
        <span className="sp" />
        <span className="date">{today()}</span>
        <span className="status" data-status={status} title={error ?? undefined}>
          {status}
          {/* 错误只给人话（原始码用户看不懂）；码与文案在 capability/errors.ts 一处对账 */}
          {error ? ` · ${errorText(error)}` : ""}
        </span>
        {/* 出错且可重试：给一个重试按钮（重试 = 重播当前这首） */}
        {error && isRetryable(error) ? (
          <button
            type="button"
            className="retry-btn"
            title={`重试：${errorText(error)}`}
            onClick={() => {
              const id = trackId;
              if (!id) return;
              dispatch({ type: "player/play", trackId: id, trackTitle: trackTitle ?? null });
            }}
          >
            重试
          </button>
        ) : null}
        <button type="button" className="theme-toggle" onClick={toggleTheme} title="日间 / 夜间（只换 token 值）">
          <i className="moon" />
        </button>
      </header>

      <div className="body">
        <nav className="rail">
          {NAV_MAIN.map(navBtn)}
          <span className="sp" />
          <div className="grp">
            <i />
            <span>我的</span>
            <i />
          </div>
          {NAV_MINE.map(navBtn)}
          <div className="rule" />
          {NAV_FOOT.map(navBtn)}
        </nav>

        <section className="main">
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
          {renderPage()}
        </section>
      </div>

      <footer className="console">
        {/* 左：正在播放。整块可点跳播放页（旧仓 console 行为） */}
        <button type="button" className="np" onClick={() => setPage("stage")} title="打开播放页">
          <span
            className={`np-art${npCover ? "" : " blank"}${phase === "loading" || phase === "buffering" ? " busy" : ""}`}
            style={npCover ? { backgroundImage: `url("${npCover}")` } : undefined}
          />
          <span className="np-tx">
            <b>{trackTitle ?? baseName(trackId)}</b>
            <span>{phaseLabel(phase, !!remote)}</span>
          </span>
        </button>

        <div className="mid">
          <div className="transport">
            <button
              type="button"
              className="tb"
              aria-label="上一首"
              onClick={() =>
                dispatch({ type: "queue/prev", atPositionMs: services.current?.positionMs() ?? 0 })
              }
            >
              <i className="tb-ic ic-prev">
                <i />
                <i />
              </i>
            </button>
            <button type="button" className="tb main" aria-label={playing ? "暂停" : "播放"} onClick={() => dispatch({ type: "player/toggle" })}>
              <i className={`tb-ic ${playing ? "ic-pause" : "ic-play"}`}>
                <i />
                {playing ? <i /> : null}
              </i>
            </button>
            <button type="button" className="tb" aria-label="下一首" onClick={() => dispatch({ type: "queue/next" })}>
              <i className="tb-ic ic-next">
                <i />
                <i />
              </i>
            </button>
          </div>

          {/* 进度：原生 range 保住键盘/拖拽语义，视觉由 app.css 画成发丝轨 + 朱砂头 */}
          <div className="seek">
            <span ref={timeEl} className="tm">
              0:00
            </span>
            <input
              ref={barEl}
              className={`bar${playing ? " playing" : ""}`}
              type="range"
              min="0"
              max="1"
              step="1"
              defaultValue="0"
              aria-label="播放进度"
              onPointerDown={() => {
                dragging.current = true;
              }}
              // 松手才提交（P0-03）：拖动中只画预览，不发 seek ——
              // 每动一格就 seek 一次会把音频打成"碎碎的发声片段"（旧行为）
              onPointerUp={(e) => {
                dragging.current = false;
                dispatch({ type: "player/seek", positionMs: Number(e.currentTarget.value) });
              }}
              // 指针在窗外交代时 pointerup 可能收不到：丢捕获也要收尾，
              // 否则 dragging 卡住 → 进度条永远停在原地（P0-03 的兜底）
              onLostPointerCapture={(e) => {
                if (!dragging.current) return;
                dragging.current = false;
                dispatch({ type: "player/seek", positionMs: Number(e.currentTarget.value) });
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
              onPointerMove={(e) => {
                // 悬停时间泡：直接写 DOM（每帧级事件不走 React），松手即隐
                const tip = tipEl.current;
                if (!tip) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                const duration = services.current?.engine.durationMs() ?? 0;
                tip.textContent = fmt(pct * duration);
                tip.style.left = `${pct * 100}%`;
              }}
              onChange={(e) => {
                // 拖动中：只画预览（墨色填充 + 时间），不触发 seek
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
            <span ref={tipEl} className="seek-tip" aria-hidden="true" />
            <span ref={totalEl} className="tm">
              0:00
            </span>
          </div>
        </div>

        <div className="tools">
          <button
            type="button"
            title={`播放模式：${PLAY_MODE_LABEL[queueMode]}`}
            aria-label={`播放模式：${PLAY_MODE_LABEL[queueMode]}`}
            onClick={() => dispatch({ type: "queue/mode", mode: nextPlayMode(queueMode) })}
          >
            {PLAY_MODE_SHORT[queueMode]}
          </button>
          <button
            type="button"
            className={volOpen || muted ? "on" : ""}
            aria-expanded={volOpen}
            onClick={() => {
              setVolOpen(!volOpen);
              setSleepOpen(false);
            }}
            title={muted ? "已静音" : "音量"}
          >
            {muted ? "静音" : "音量"}
          </button>
          <button
            type="button"
            className={sleepOpen || sleepEndsAt || sleepPending ? "on" : ""}
            aria-expanded={sleepOpen}
            onClick={() => {
              setSleepOpen(!sleepOpen);
              setVolOpen(false);
            }}
            title={
              sleepPending
                ? "到点了：这首播完就停"
                : sleepWaitEnd
                  ? "睡眠定时：播完当前曲再停"
                  : "睡眠定时：到点暂停，不退出"
            }
          >
            睡眠
            {sleepEndsAt ? <span ref={sleepEl} className="sleep-left" /> : null}
            {sleepPending ? <span className="sleep-left">等这首完</span> : null}
          </button>
          <button
            type="button"
            onClick={() => {
              setRateOpen(!rateOpen);
              setVolOpen(false);
              setSleepOpen(false);
            }}
            title={`播放速度：${playbackRate.toFixed(2)}x`}
          >
            {playbackRate.toFixed(2)}x
          </button>
          <button type="button" onClick={() => void services.current?.openLyric()} title="桌面歌词">
            词
          </button>
          <button type="button" onClick={() => void services.current?.openMini()} title="迷你窗">
            迷你
          </button>
          <button
            type="button"
            className={queueOpen ? "on" : ""}
            aria-expanded={queueOpen}
            onClick={() => setQueueOpen((v) => !v)}
            title="播放队列（P0-10）"
          >
            队列
          </button>
          <button type="button" className={fxOpen ? "on" : ""} aria-expanded={fxOpen} onClick={() => setFxOpen(!fxOpen)}>
            音效
          </button>
        </div>
        {/* 音量条常驻 DOM、只切 visibility：滑杆语义与键盘可达性不因开合而丢 */}
        <div className="vol-pop volume" hidden={!volOpen}>
          <button
            type="button"
            className={`mute${muted ? " on" : ""}`}
            aria-pressed={muted}
            title={muted ? "取消静音" : "静音"}
            onClick={() => dispatch({ type: "player/setMuted", muted: !muted })}
          >
            {muted ? "静音中" : "静音"}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={volume}
            aria-label="音量"
            onChange={(e) => dispatch({ type: "player/setVolume", volume: Number(e.target.value) })}
          />
          <span className="vol-val">{Math.round(volume * 100)}</span>
        </div>
        <div className="vol-pop rate-pop" role="dialog" aria-label="播放速度" hidden={!rateOpen}>
          <p className="rate-title">播放速度</p>
          <div className="rate-opts">
            {RATE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className={playbackRate === r ? "on" : ""}
                onClick={() => dispatch({ type: "player/setPlaybackRate", rate: r })}
              >
                {r.toFixed(2)}x
              </button>
            ))}
          </div>
          <label className="rate-pitch">
            <input
              type="checkbox"
              checked={preservesPitch}
              onChange={(e) => dispatch({ type: "player/setPreservesPitch", on: e.target.checked })}
            />
            音调补偿（变速不变调）
          </label>
        </div>

        {sleepOpen && (
          <div className="vol-pop sleep-pop" role="dialog" aria-label="睡眠定时">
            <p className="sleep-now">
              {sleepPending
                ? "已到点 · 这首播完就停"
                : sleepEndsAt
                  ? sleepWaitEnd
                    ? "定时中 · 播完当前曲停"
                    : "定时中 · 到点自动暂停"
                  : "到点只暂停，不退出"}
            </p>
            <label className="sleep-wait">
              <input
                type="checkbox"
                checked={sleepWaitEnd}
                onChange={(e) => dispatch({ type: "sleep/setWaitEnd", waitEnd: e.target.checked })}
              />
              <span>播完当前曲再停</span>
            </label>
            <div className="sleep-opts">
              {SLEEP_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    dispatch({ type: "sleep/set", endsAt: Date.now() + m * 60000 });
                    setSleepOpen(false);
                  }}
                >
                  {m} 分钟
                </button>
              ))}
              <button
                type="button"
                disabled={!sleepEndsAt}
                onClick={() => {
                  dispatch({ type: "sleep/clear" });
                  setSleepOpen(false);
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}
        <span className="stamp">入场券 · ADMIT ONE</span>
      </footer>
      <Toaster />

      {fxOpen && (
        <div className="fx-panel" role="dialog" aria-label="音效设置">
          <div className="fx-head">
            <span className="fx-label">AUDIO · 音效</span>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "audio/restore",
                  // 音效重置只动音效：输出设备是另一件事，不能被顺手改回默认（P0-09）
                  config: {
                    preampDb: PREAMP_DEFAULT,
                    eq: EQ_DEFAULT,
                    crossfadeSec: 0,
                    outputId: state.audio.outputId,
                  },
                })
              }
            >
              重置
            </button>
          </div>
          <EqCurve gains={state.audio.eq} sampleRate={services.current?.engine.sampleRate() ?? 48000} />
          {/* 音量归控制台的「音量」按钮弹层，面板里只留音效相关，一处状态一个入口 */}
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
          <span className="fx-label">EQ · 10 BANDS</span>
          {/* 预设（A-06 判据 ≥3）：点亮条件不是"点过"，而是当前增益真的等于这一组 */}
          <div className="fx-presets">
            {EQ_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={sameGains(state.audio.eq, p.gains)}
                onClick={() => dispatch({ type: "audio/setEq", gains: [...p.gains] })}
              >
                {p.name}
              </button>
            ))}
          </div>
          {/* 10 段竖排：横向一行放 10 根会挤成一堆，竖排还能看见峰谷 */}
          <div className="fx-bands">
            {state.audio.eq.map((db, i) => {
              const hz = EQ_BANDS[i];
              return (
                <label className="fx-band" key={hz}>
                  <b>{Math.round(db)}</b>
                  {/* 0dB 基准线挂在轨道容器上：挂在整块上要算文字行高，必然偏几像素 */}
                  <span className="fx-track">
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={Math.round(db)}
                      aria-label={`${hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}`}
                      onChange={(e) => {
                        const gains = [...state.audio.eq];
                        gains[i] = Number(e.target.value);
                        dispatch({ type: "audio/setEq", gains });
                      }}
                    />
                  </span>
                  <i>{hz >= 1000 ? `${hz / 1000}k` : hz}</i>
                </label>
              );
            })}
          </div>
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
              run: () => {
                dispatch({ type: "queue/set", items: [t.path], startAt: 0 });
                dispatch({ type: "player/play" });
              },
            }))
          }
        />
      ) : null}

      {findOpen && trackId ? (
        <FindLyric
          initialQuery={findQuery}
          onSearch={(q) => {
            const svc = services.current;
            return svc ? svc.searchLyrics(q) : Promise.reject(new Error("还没准备好，请稍后再试"));
          }}
          onPick={async (hit) => {
            const svc = services.current;
            if (!svc) throw new Error("还没准备好，请稍后再试");
            const text = hit.syncedLyrics?.trim() || hit.plainLyrics?.trim() || "";
            const libTrack = getTracks().find((t) => t.id === trackId);
            // 线上按 sourceId:songId 绑，本地按曲目 id 绑 —— 见 lyricBindKey
            const doc = await svc.bindLyric(
              lyricBindKey(remote, trackId) ?? "",
              trackId,
              text,
              remote ? undefined : libTrack?.durationMs,
            );
            setManualLyric(doc);
            setNotice({
              text: `已换上「${hit.trackName}${hit.artistName ? ` — ${hit.artistName}` : ""}」的歌词`,
            });
          }}
          onClose={() => setFindOpen(false)}
        />
      ) : null}

      {queueOpen ? <QueuePanel queue={state.queue} onClose={() => setQueueOpen(false)} /> : null}
    </main>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<App />);
