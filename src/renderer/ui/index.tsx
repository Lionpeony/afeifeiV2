import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import type { AppState, RemoteTrackMeta } from "../../contracts/index.js";
import { getFiltered, searchTracks } from "../domain/library/state.js";
import { EQ_BANDS, EQ_DEFAULT, EQ_PRESETS, PREAMP_DEFAULT, sameGains } from "../capability/audio/eq.js";
import { dispatch, getState, remoteTrackId, subscribe } from "../kernel/index.js";
import { bootstrap } from "./bootstrap.js";
import type { Services } from "./services.js";
import type { Track } from "../domain/library/schema.js";
import { onFrame } from "./compositor.js";
import { EqCurve } from "./EqCurve.js";
import { Toaster } from "./Toaster.js";
import { StageView } from "./views/stage/index.js";
import { ChartsView } from "./views/charts/index.js";
import { PlaylistsView } from "./views/playlists/index.js";
import { StatsView } from "./views/stats/index.js";
import type { RemoteTrack } from "../../contracts/capability.js";
import { startMiniBridge } from "./mini-bridge.js";
import { startLyricBridge } from "./lyric-bridge.js";
import { setManualLyric } from "./lyric-source.js";
import { lyricBindKey } from "../domain/lyrics/bindings.js";
import { isLiked } from "../domain/likes/index.js";
import { beginAccount, isAccountLiked } from "../domain/account-likes/index.js";
import { fmt, phaseLabel, phaseOf } from "./playback-phase.js";
import { FindLyric } from "./FindLyric.js";
import { registerCommand } from "./input/commands.js";
import { currentTheme, type Theme } from "./theme.js";
import { getActiveSource, setActiveSource, subscribeActiveSource } from "./active-source.js";
import { AccountMenu, type AccountProfile } from "./live/AccountMenu.js";
import { LoginDialog } from "./views/online/LoginDialog.js";
import { installKeyboard } from "./input/keyboard.js";
import { CommandPalette } from "./input/CommandPalette.js";
import type { DailyBundle } from "./views/home/index.js";
import { StationRuler } from "./live/StationRuler.js";
import { LiveHome } from "./live/LiveHome.js";
import { onAirProgram } from "./live/on-air.js";
import { BootSplash } from "./BootSplash.js";
import { invalidatePrefix, loadNet } from "../domain/net-cache/index.js";
import { accountKey } from "./account-data.js";


/** 四个账号数据入口的提示：账号是「当前音源」那一个，不再写死网易云。 */
const accountHint = (kind: AccountKind, sourceName: string): string => {
  switch (kind) {
    case "daily":
      return `登录${sourceName}后，这里换成你账号的每日推荐`;
    case "liked":
      return `登录${sourceName}后，这里显示账号的红心（与 App 同步）`;
    case "week":
      return `登录${sourceName}后，这里显示账号的听歌排行`;
    case "fm":
      return `登录${sourceName}后，漫游改用账号的个人 FM`;
  }
};

/** 当前音源本身没有账号能力（例如 QQ 音乐）：不拿别的账号顶替，直接说清。 */
const noAccountHint = (sourceName: string): string =>
  `${sourceName} 没有账号数据；切到支持账号的音源（如网易云音乐）再看这里`;
import { LikedView } from "./views/liked/index.js";
import { RadioView } from "./views/radio/index.js";
import { RecentView } from "./views/recent/index.js";
import { RoamView } from "./views/roam/index.js";
import { SettingsView } from "./views/settings/index.js";
import { getTracks, trackById } from "../domain/library/state.js";
import { LibraryView } from "./views/library/index.js";
import { OnlineView, type SourceOption } from "./views/online/index.js";
import { DownloadsView } from "./views/downloads/index.js";
import { PAGE_LABEL, type PageId } from "./pages.js";
import { PLAY_MODE_LABEL, PLAY_MODE_SHORT, nextPlayMode } from "./play-mode.js";
import { QueuePanel } from "./QueuePanel.js";
import { pushPanel } from "./input/panels.js";
import { errorText } from "../capability/errors.js";
import { useMediaSession } from "./hooks/use-media-session.js";
import { usePlaybackChannels } from "./hooks/use-playback-channels.js";
import { useLyricSync } from "./hooks/use-lyric-sync.js";
import { useAccountLikes, type AccountKind } from "./hooks/use-account-likes.js";
import type { ShortcutStatus } from "./shortcuts.js";
import { DEFAULT_BINDINGS, type ShortcutBinding } from "../domain/shortcuts/index.js";
import { Console } from "./Console.js";

function baseName(p: string | null): string {
  if (!p) return "未选择";
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function App() {
  const [state, setState] = useState<AppState>(getState());
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");
  // 外壳只有不夜台直播带一种；开机即首页直播面
  const [page, setPage] = useState<PageId>("home");
  // 首屏联网预取完成（或超时兜底）前先停在加载页，不把半空的首页亮给用户
  const [bootReady, setBootReady] = useState(false);
  /* 在线页内的两个模式：结果 / 榜单。
     默认落榜单：搜索由顶栏负责，进页时没有关键词，落「结果」只会看到一块空地。
     从顶栏提交搜索时 onSearch 会强制切回 search，所以不会「搜了却停在榜单」。 */
  const [onlineTab, setOnlineTab] = useState<"search" | "charts">("charts");
  /** 顶栏搜索提交的一次性请求：at 变化即重新执行 */
  const [searchSeek, setSearchSeek] = useState<{ text: string; at: number } | null>(null);
  const lastRoom = useRef<PageId>("home");
  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountProfiles, setAccountProfiles] = useState<Record<string, AccountProfile | undefined>>({});
  const [loginFor, setLoginFor] = useState<string | null>(null);

  /** 读所有可登录源的头像/昵称（站尺账号区 + 面板共用）。 */
  const refreshAccountProfiles = (): void => {
    const svc = services.current;
    if (!svc) return;
    const list = svc.sources().filter((source) => source.canAuth);
    void Promise.all(
      list.map(async (source) => {
        try {
          const status = await svc.loginStatus(source.id);
          return [source.id, { loggedIn: status.loggedIn, nick: status.nick, avatarUrl: status.avatarUrl }] as const;
        } catch {
          return [source.id, { loggedIn: false, nick: null, avatarUrl: null }] as const;
        }
      }),
    ).then((rows) => setAccountProfiles(Object.fromEntries(rows)));
  };

  // 账号状态不会主动推送：切源、窗口重新聚焦、打开面板时各读一次
  useEffect(() => {
    const onFocus = (): void => refreshAccountProfiles();
    window.addEventListener("focus", onFocus);
    const off = subscribeActiveSource(refreshAccountProfiles);
    return () => {
      window.removeEventListener("focus", onFocus);
      off();
    };
  }, []);
  const [fxOpen, setFxOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [theme, setThemeState] = useState<Theme>("light");
  const [libraryRoots, setLibraryRoots] = useState<string[]>([]);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [lyricFiltersText, setLyricFiltersText] = useState("");
  const [globalTokenCount, setGlobalTokenCount] = useState(0);
  const services = useRef<Services | null>(null);
  /*
   * 装配完成的信号。首页在首帧就挂载，早于 bootstrap 完成；
   * 账号请求不能在 services 还没就绪时发出去（拿回空列表后就再也不会重试）。
   */
  const servicesReady = useRef<Promise<Services> | null>(null);
  const resolveServices = useRef<((svc: Services) => void) | null>(null);
  if (!servicesReady.current) {
    servicesReady.current = new Promise<Services>((resolve) => {
      resolveServices.current = resolve;
    });
  }
  const timeEl = useRef<HTMLSpanElement>(null);
  const totalEl = useRef<HTMLSpanElement>(null);
  const barEl = useRef<HTMLInputElement>(null);
  const tipEl = useRef<HTMLSpanElement>(null);
  const sleepEl = useRef<HTMLSpanElement>(null);
  const ringEl = useRef<SVGCircleElement>(null);
  const dragging = useRef(false);

  /** 主键进度环周长（r=23，与 Console.tsx 的 tb-ring-arc 同源） */
  const RING_CIRC = 2 * Math.PI * 23;

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
    // 主键进度环：弧长 = 已播比例，与进度条同一份 position/duration，不触发渲染
    if (ringEl.current) {
      const ringPct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
      ringEl.current.style.strokeDashoffset = (RING_CIRC * (1 - ringPct)).toFixed(2);
    }
    // 睡眠定时剩余时间同样只写 DOM：1s 一个 setInterval 会违反「时间唯一」（I1），
    // 而 deadline 是绝对的，掉帧后补算也不会累积误差。
    if (sleepEl.current) {
      const endsAt = getState().sleep.endsAt;
      if (endsAt !== null) sleepEl.current.textContent = fmt(Math.max(0, endsAt - Date.now()));
    }
  };

  /* 顶栏是「快捷开关」：只在明暗之间来回切。四档配色在设置页里选——
     顶栏点一下就换一档会让用户找不到「回到刚才那档」的路径。 */
  const toggleTheme = (): void => {
    const svc = services.current;
    if (!svc) return;
    setThemeState(svc.setTheme(currentTheme() === "light" ? "dark" : "light"));
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
    let started = false;
    let frames = 0;
    let offFrame: (() => void) | null = null;
    let fallback = 0;

    // 首帧优先：装配会发起一串 IPC（先读曲库索引）。如果挤进首次样式/布局的同一个任务，
    // 回包要等整段 50–70ms 长任务跑完，恢复耗时会随机翻倍。等两帧再启动装配
    //（compositor 的帧循环是全应用唯一的 rAF）；窗口被遮挡时帧循环不跑，
    // 用定时器兜底，别让后台启动永远不装配。
    const start = (): void => {
      if (started || !alive) return;
      started = true;
      clearTimeout(fallback);
      offFrame?.();
      offFrame = null;

      const bootAndPrefetch = async (): Promise<void> => {
        const s = await bootstrap();
        if (!alive) return;
        services.current = s;
        resolveServices.current?.(s);
        setSources(s.sources());
        refreshAccountProfiles();
        setThemeState(s.theme);
        syncPosition();
        startMiniBridge(s);
        startLyricBridge(s);

        // 曲库目录 + 开机自启（M9）：两个值都在主进程/系统侧，界面只做镜像。
        // 读不到就保持默认：截图脚本那套 IPC 桩没有这两条通道，不该把整页带崩
        void s
          .libraryRoots()
          .then((roots) => {
            if (alive) setLibraryRoots(roots);
          })
          .catch(() => undefined);
        void s
          .autoLaunch()
          .then((on) => {
            if (alive) setAutoLaunch(on);
          })
          .catch(() => undefined);
        void s
          .lyricFilters()
          .then((text) => {
            if (alive) setLyricFiltersText(text);
          })
          .catch(() => undefined);
        void s
          .globalTokens()
          .then((tokens) => {
            if (alive) setGlobalTokenCount(tokens ? Object.keys(tokens).length : 0);
          })
          .catch(() => undefined);

        // 首屏联网预取：账号一确定就并发拉每日推荐 / 账号红心 / 个人 FM。
        // 结果落进 domain/net-cache，首页首帧与之后每次切页都直接命中；
        // 单个源失败不影响其它数据，也不挡放行（外层还有 12 秒总超时）。
        const { id } = await resolveAccountSource().catch(() => ({ id: null as string | null }));
        if (alive && id) {
          ensureAccount(id);
          await Promise.allSettled([
            loadNet(accountKey(id, "daily"), () => accountBundle("daily")),
            loadNet(accountKey(id, "liked"), () => accountBundle("liked")),
            loadNet(accountKey(id, "fm"), () => accountBundle("fm")),
          ]);
          // 榜单 / 歌单清单：这两页一进去就要整张清单，等点进去才拉会先闪一次骨架。
          // 不 await、缓 2 秒再发：启动的带宽先给首页那三份，抢不到也不影响放行。
          setTimeout(() => {
            void loadNet(`charts:toplists:${id}`, () => s.listToplists(id)).catch(() => undefined);
            void loadNet(`playlists:list:${id}`, () => s.listPlaylists(id)).catch(() => undefined);
          }, 2000);
        }

        // 更新提示（M8）：一条线，不弹窗不打断播放
        s.onUpdateAvailable((v) => setNotice({ text: `发现新版本 v${v.version}，点击前往下载页`, url: v.url }));
        // 上次异常退出：提示一次，之后不再烦
        void s.lastCrash().then((c) => {
          if (c) {
            setNotice({ text: `上次异常退出（${c.kind}），详情见 ${c.file}` });
            void s.markCrashSeen(c.file);
          }
        });
      };

      // 加载页从挂载起最多停 12 秒：任何一个联网源卡住都不能把用户关在门外
      void Promise.race([bootAndPrefetch(), new Promise<void>((r) => setTimeout(r, 12_000))])
        .catch(() => undefined)
        .finally(() => {
          if (alive) setBootReady(true);
        });
    };
    offFrame = onFrame(() => {
      frames += 1;
      if (frames >= 2) start();
    });
    fallback = window.setTimeout(start, 250);
    return () => {
      alive = false;
      offFrame?.();
      clearTimeout(fallback);
    };
  }, []);

  const { status, trackId, volume, muted, error, trackTitle, remote } = state.player;
  const playing = status === "playing";
  /* 底栏副行的信号源名（「网易云」）：比「在线音源」多一句实话。sources 列表启动后不变。 */
  const sourceName = remote
    ? services.current?.sources().find((s) => s.id === remote.sourceId)?.name ?? null
    : null;
  /*
   * 底栏那颗心的状态：
   * 在线曲目看账号红心域（songId），本地曲目看本机红心（trackId）。
   * 两套 id 空间，A 方案的延伸——不合并，但同一个小按钮按载体分流。
   */
  const likedNow = remote ? isAccountLiked(remote.songId) : trackId ? isLiked(trackId) : false;
  // P0-26：解码中（status=loading）与缓冲中（playing + waiting）是两个词
  const phase = phaseOf(status, state.player.buffering);
  const sleepEndsAt = state.sleep.endsAt;
  const sleepWaitEnd = state.sleep.waitEnd;
  const sleepPending = state.sleep.pending;
  const queueMode = state.queue.mode;
  const playbackRate = state.player.playbackRate;
  const preservesPitch = state.player.preservesPitch;
  /* 最新状态镜像：媒体会话的 handler 闭包里要读当前值，不能吃渲染那一刻的旧快照 */
  const stateRef = useRef(state);
  stateRef.current = state;

  /* 媒体会话 + console 封面（原先 60 行散在两处，见 hooks/use-media-session.ts） */
  const npCover = useMediaSession({
    stateRef,
    services,
    baseName,
    trackId,
    trackTitle,
    status,
    remote,
  });

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
      registerCommand({
        id: "tab-charts",
        label: "转到：榜单",
        run: () => {
          setOnlineTab("charts");
          setPage("online");
        },
      }),
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

  /* 媒体键 / 托盘 / 离线态 / 全局快捷键：语义走命令注册表（hooks/use-playback-channels.ts）。
     绑定与状态这两份留在 App：设置页的快捷键面板直接读值，hook 负责填它们。 */
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutStatus[]>([]);
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBinding[]>(
    DEFAULT_BINDINGS.map((b) => ({ ...b })),
  );
  const { shortcutsRef, seekByDelta } = usePlaybackChannels({
    services,
    baseName,
    playing,
    trackId,
    trackTitle,
    setOffline,
    setShortcutStatus,
    setShortcutBindings,
  });

  /* 歌词取词 + 校准推送（hooks/use-lyric-sync.ts） */
  const lyricOffset = state.lyrics.offsets[trackId ?? ""] ?? 0;
  useLyricSync({ remote, trackId, lyricOffset, services });

  /**
   * 窗控三键（titleBarOverlay）跟着**可见页面**走，不是跟着全局主题走。
   * 播放页在自己的根节点上重映射场景层且恒深色（LIVE_PRESETS），
   * 全局切浅色时若三键仍读结构层，右上角就会在深底上留一块白。
   * 直接同步读：`.stage` 的 token 由 StageRoot 的 effect 写进 inline style，
   * 子组件的 effect 先于本组件执行，此刻已经是最终值。
   */
  useEffect(() => {
    services.current?.syncWindowOverlay();
  }, [page]);

  /* 换词弹窗（P0-19）的初始查询：本地「歌名 歌手」，在线用标题（那里已经是「歌名 — 歌手」）。 */
  const findTrack = findOpen && !remote && trackId ? trackById(trackId) : undefined;
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
        // 在线曲目走账号红心（R1），本地曲目走本机红心；两者 id 空间不同，不混
        like: () => likeActionRef.current?.(),
      }),
    [page],
  );

  /**
   * 在线曲目播放（每日推荐 / 榜单 / 歌单 / 搜索共用一条链路）：
   * 点列表里的任意一首 → **整份列表入队**，从这首开始。这是播放器的基本语义，
   * 只播单曲的话「下一首」永远没有着落。
   *
   * 队列里存 `remote:<音源>:<歌 id>` 而不是直链：直链带令牌、会过期，
   * 真正起播前由 engine 的解析器换成新地址（`AudioEngine.setResolver`）。
   * 但仍先解析这一首 —— 未登录 / 无版权要在点的一瞬间就说，不能入队后才逐首失败。
   */
  const playRemote = async (
    sourceId: string,
    track: RemoteTrack,
    list?: RemoteTrack[],
    stream = false,
    /** 节目来源标签（「内地榜」「搜索 · xx」），queue/set 落进队列给首页 ON AIR 显示 */
    origin?: string,
  ): Promise<void> => {
    const svc = services.current;
    if (!svc) return;
    await svc.resolveOnlineUrl(sourceId, track.sourceId, "320k");

    const tracks = list && list.length > 0 ? list : [track];
    const items = tracks.map((t) => remoteTrackId(sourceId, t.sourceId));
    const remote: Record<string, RemoteTrackMeta> = {};
    for (const t of tracks) {
      remote[remoteTrackId(sourceId, t.sourceId)] = {
        sourceId,
        songId: t.sourceId,
        title: t.title,
        artist: t.artist,
        coverUrl: t.coverUrl,
        durationMs: t.durationMs,
      };
    }
    const at = items.indexOf(remoteTrackId(sourceId, track.sourceId));
    /* 同一份节目单里跳档：队列条目一模一样就不重建 —— shuffle 打散的顺序、
       失败标记、origin 都保住，只把光标切过去（store 的 player/play 自带换档）。 */
    const cur = getState().queue;
    if (cur.items.length === items.length && cur.items.every((id, i) => id === items[i])) {
      if (at >= 0) dispatch({ type: "player/play", trackId: items[at] });
      return;
    }
    // stream = 无限流（漫游 FM）：这批放完由 bootstrap 再要一批接上，不叫"播完了"
    dispatch({
      type: "queue/set",
      items,
      startAt: at >= 0 ? at : 0,
      remote,
      stream: stream ? { sourceId } : null,
      origin: origin ?? null,
    });
    // queue/set 只落 loading —— 补一脚 play（已在播时幂等）
    dispatch({ type: "player/play" });
  };

  /**
   * 当前账号（单账号模型）：只认全局当前音源，**不回退**到别的已登录源。
   *  - 当前源支持账号且已登录 → 用它
   *  - 支持账号但未登录     → 「登录X后…」
   *  - 不支持账号（QQ / demo）→ 「X 没有账号数据…」
   */
  const resolveAccountSource = async (): Promise<{
    id: string | null;
    hint: (kind: AccountKind) => string | null;
  }> => {
    const svc = services.current ?? (await servicesReady.current);
    if (!svc) return { id: null, hint: () => null };
    const active = getActiveSource();
    const src = svc.sources().find((s) => s.id === active);
    if (!src) return { id: null, hint: () => null };
    if (!src.canAccount) {
      return { id: null, hint: () => noAccountHint(src.name) };
    }
    const st = await svc.loginStatus(src.id).catch(() => ({ loggedIn: false, nick: null }));
    if (!st.loggedIn) {
      return { id: null, hint: (kind) => accountHint(kind, src.name) };
    }
    return { id: src.id, hint: () => null };
  };

  const accountBundle = async (kind: AccountKind): Promise<DailyBundle> => {
    const svc = services.current ?? (await servicesReady.current);
    if (!svc) return { sourceId: "", songs: [], hint: null };
    const resolved = await resolveAccountSource();
    if (!resolved.id) return { sourceId: "", songs: [], hint: resolved.hint(kind) };
    const id = resolved.id;
    const songs =
      kind === "daily"
        ? await svc.accountDailySongs(id)
        : kind === "liked"
          ? await svc.accountLikedSongs(id)
          : kind === "week"
            ? await svc.accountHistory(id, "week")
            : await svc.accountPersonalFm(id);
    // 任何一次成功的账号调用都顺手确认一下域绑的是这个账号（幂等）
    ensureAccount(id);
    return { sourceId: id, songs, hint: null };
  };

  /** 在线曲目播放带错误提示（各个入口共用，别各写一遍 catch）。 */
  const playRemoteSafe = (
    sourceId: string,
    track: RemoteTrack,
    list?: RemoteTrack[],
    stream = false,
    origin?: string,
  ): void => {
    void playRemote(sourceId, track, list, stream, origin).catch((err: unknown) => {
      setNotice({ text: err instanceof Error ? err.message : "这首歌暂时播不了" });
    });
  };

  /* 账号红心（底栏 + 喜欢页取消红心 + 绑定生命周期）：hooks/use-account-likes.ts */
  const { accountSource, ensureAccount, unlikeAccount, toggleCurrentLike, likeActionRef } = useAccountLikes({
    services,
    notify: setNotice,
    resolveAccountSource,
  });

  /* ---- 外壳切换：直播带 ⇄ 旧标签页 ---- */
  useEffect(() => {
    if (page !== "stage") lastRoom.current = page;
  }, [page]);

  /* 在线页只有「结果」这一个主视图，榜单是分支。所以页头不放两个 tab ——
     写一个「搜索」在那儿等于又给搜索开了一个入口（顶栏才是唯一入口）。
     一颗按钮，标签写目的地：榜单 ⇄ 搜索结果。 */
  const onlineTabs = (
    <div className="lib-tabs">
      {onlineTab === "search" ? (
        <button type="button" title="看榜单" onClick={() => setOnlineTab("charts")}>
          榜单
        </button>
      ) : searchSeek?.text ? (
        /* 没搜过就没有「结果」可回，别给一颗点了只会看到空地的按钮 */
        <button type="button" title="回到搜索结果" onClick={() => setOnlineTab("search")}>
          搜索结果
        </button>
      ) : null}
    </div>
  );

  /* ---- 页面挂载：加页只改这里 + pages.ts，不再有涨到十个分支的三元链 ---- */
  const renderPage = (): ReactNode => {
    if (page === "home") {
      return (
        <LiveHome
          account={() => accountBundle("daily")}
          accountName={sources.find((s) => s.id === getActiveSource())?.name ?? ""}
          onPlayRemote={(sourceId, track, list, origin) => playRemoteSafe(sourceId, track, list, false, origin)}
          onAccount={() => {
            setAccountOpen(true);
            refreshAccountProfiles();
          }}
          nowPlaying={state.player.remote ?? null}
          playing={playing}
          spectrum={(bins) => services.current?.spectrum(bins) ?? null}
          onAir={onAirProgram(state.player.trackId, state.queue, (id) => sources.find((s) => s.id === id)?.name ?? id)}
        />
      );
    }
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
            positionMs={() => services.current?.positionMs() ?? 0}
            findLyric={() => setFindOpen(true)}
            notify={setNotice}
            onBack={() => setPage(lastRoom.current)}
            live
          />
        );
      case "liked":
        return (
          <LikedView
            onPlayGroup={onPlayGroup}
            account={() => accountBundle("liked")}
            onPlayRemote={(sourceId, track, list) => playRemoteSafe(sourceId, track, list, false, "喜欢的音乐")}
            onUnlike={unlikeAccount}
          />
        );
      case "recent":
        return (
          <RecentView
            onPlayGroup={onPlayGroup}
            account={() => accountBundle("week")}
            onPlayRemote={(sourceId, track, list) => playRemoteSafe(sourceId, track, list, false, "最近播放")}
          />
        );
      case "roam":
        return (
          <RoamView
            onPlayGroup={onPlayGroup}
            cover={(id, path) => services.current?.cover(id, path) ?? Promise.resolve(null)}
            account={() => accountBundle("fm")}
            onPlayRemote={(sourceId, track, list, stream) =>
              playRemoteSafe(sourceId, track, list, stream === true, "私人 FM")
            }
            onReportDislike={(sourceId, songId) =>
              services.current?.reportDislike(sourceId, songId, "fm") ?? Promise.resolve(false)
            }
          />
        );
      case "stats":
        return <StatsView />;
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
            libraryRoots={libraryRoots}
            onAddRoot={() =>
              void services.current?.addLibraryRoot().then((roots) => {
                if (!roots) return;
                setLibraryRoots(roots);
                setScanNote("目录已加入，点「扫描文件夹」按新列表重扫");
              })
            }
            onRemoveRoot={(dir) =>
              void services.current?.removeLibraryRoot(dir).then((roots) => {
                setLibraryRoots(roots);
                setScanNote("目录已移除；已入库的曲目不会自动删，重扫才标记 missing");
              })
            }
            autoLaunch={autoLaunch}
            onAutoLaunch={(on) => void services.current?.setAutoLaunch(on).then(setAutoLaunch)}
            lyricFilters={lyricFiltersText}
            onSaveLyricFilters={(text) =>
              services.current?.setLyricFilters(text) ?? Promise.resolve(["还没准备好，请稍后再试"])
            }
            globalTokenCount={globalTokenCount}
            onImportGlobalTheme={async () => {
              const tokens = await services.current?.importGlobalTheme();
              setGlobalTokenCount(tokens ? Object.keys(tokens).length : 0);
              return tokens ?? null;
            }}
            onExportGlobalTheme={() => services.current?.exportGlobalTheme() ?? Promise.resolve(false)}
            onClearGlobalTheme={async () => {
              await services.current?.clearGlobalTheme();
              setGlobalTokenCount(0);
            }}
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
            onEditMeta={(id, patch) =>
              services.current?.editTrackMeta(id, patch) ?? Promise.reject(new Error("还没准备好，请稍后再试"))
            }
            downloads={() =>
              services.current ? (
                <DownloadsView
                  embedded
                  services={services.current}
                  onRemove={(id) => services.current?.removeDownload(id) ?? Promise.resolve()}
                />
              ) : (
                <p className="lib-empty">还没准备好，请稍候。</p>
              )
            }
            radio={() => (
              <RadioView
                embedded
                onPlayGroup={onPlayGroup}
                now={
                  trackId
                    ? { title: trackTitle ?? baseName(trackId), artist: remote ? "在线音源" : "本地曲库" }
                    : null
                }
              />
            )}
          />
        );
      case "playlists":
        return (
          <PlaylistsView
            sources={sources.filter((s) => s.canPlaylists)}
            listPlaylists={(sourceId) => {
              const svc = services.current;
              return svc ? svc.listPlaylists(sourceId) : Promise.reject(new Error("还没准备好，请稍后再试"));
            }}
            playlistTracks={(sourceId, playlistId, page) => {
              const svc = services.current;
              return svc
                ? svc.playlistTracks(sourceId, playlistId, page)
                : Promise.reject(new Error("还没准备好，请稍后再试"));
            }}
            onPlay={(sourceId, track, list, origin) => playRemote(sourceId, track, list, false, origin)}
            onlinePlaylists={() => services.current?.onlinePlaylists() ?? Promise.resolve([])}
            savePlaylist={(sourceId, playlist) => {
              const svc = services.current;
              return svc ? svc.savePlaylist(sourceId, playlist) : Promise.reject(new Error("还没准备好，请稍后再试"));
            }}
            importPlaylist={(sourceId, ref) => {
              const svc = services.current;
              return svc
                ? svc.importPlaylist(sourceId, ref)
                : Promise.reject(new Error("还没准备好，请稍后再试"));
            }}
            removePlaylist={(sourceId, id) => {
              const svc = services.current;
              return svc ? svc.removePlaylist(sourceId, id) : Promise.reject(new Error("还没准备好，请稍后再试"));
            }}
          />
        );
      case "online":
        return onlineTab === "charts" ? (
          <ChartsView
            tabs={onlineTabs}
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
            onPlay={(sourceId, track, list, origin) => playRemote(sourceId, track, list, false, origin)}
          />
        ) : (
          <OnlineView
            tabs={onlineTabs}
            seekQuery={searchSeek}
            sources={sources}
            onSearch={(sourceId, keyword) => {
              const svc = services.current;
              if (!svc) return Promise.resolve({ items: [] });
              return svc.searchOnline(sourceId, keyword);
            }}
            onPlay={(sourceId, track, list, origin) => playRemote(sourceId, track, list, false, origin)}
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
              invalidatePrefix(`account:${sourceId}:`);
              return svc ? svc.logout(sourceId) : Promise.resolve();
            }}
            onDownload={(sourceId, track) => {
              const svc = services.current;
              if (!svc) return Promise.resolve("还没准备好，请稍后再试");
              return svc.downloadTrack(sourceId, track);
            }}
            onDownloadMany={(sourceId, tracks) => {
              const svc = services.current;
              if (!svc) return Promise.resolve("还没准备好，请稍后再试");
              return svc.downloadTracks(sourceId, tracks);
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

  return (
    <main className={`shell live${offline ? " offline" : ""}`}>
      {/* 加载页是覆盖层不是替换：主壳先挂好，脚本/快捷键在预取期间也能正常工作 */}
      {!bootReady ? <BootSplash /> : null}
      {/* 离线态（P0-25）：常驻横幅，不用 toast —— 断网期间 toast 会反复刷屏 */}
      {offline ? (
        <div className="net-banner" role="status" aria-live="polite">
          离线 · 只放本地曲目，在线搜索/登录/榜单暂不可用
        </div>
      ) : null}
      <StationRuler
        page={page}
        onGo={setPage}
        onToggleTheme={toggleTheme}
        account={{
          nick: accountProfiles[getActiveSource()]?.nick ?? null,
          avatarUrl: accountProfiles[getActiveSource()]?.avatarUrl ?? null,
          sourceName: sources.find((s) => s.id === getActiveSource())?.name ?? getActiveSource(),
          loggedIn: accountProfiles[getActiveSource()]?.loggedIn ?? false,
        }}
        onAccount={() => {
          setAccountOpen((open) => !open);
          refreshAccountProfiles();
        }}
        onSearch={(query) => {
          setOnlineTab("search");
          if (query) setSearchSeek({ text: query, at: Date.now() });
          setPage("online");
        }}
      />

      <AccountMenu
        open={accountOpen}
        sources={sources.filter((s) => s.canAuth).map((s) => ({ id: s.id, name: s.name, canAuth: s.canAuth }))}
        active={getActiveSource()}
        profiles={accountProfiles}
        onClose={() => setAccountOpen(false)}
        onSwitch={(id) => {
          setActiveSource(id);
          setAccountOpen(false);
        }}
        onLogin={(id) => {
          setLoginFor(id);
          setAccountOpen(false);
        }}
        onLogout={(id) => {
          void (async () => {
            await services.current?.logout(id).catch(() => undefined);
            invalidatePrefix(`account:${id}:`);
            if (getActiveSource() === id) {
              accountSource.current = "";
              beginAccount("");
            }
            refreshAccountProfiles();
          })();
        }}
      />

      {loginFor ? (
        <LoginDialog
          start={async (ch) => {
            const svc = services.current;
            if (!svc) throw new Error("还没准备好，请稍后再试");
            const result = await svc.startLogin(loginFor, ch);
            if (!("key" in result) || typeof result.key !== "string" || typeof result.qrImage !== "string") {
              throw new Error("获取二维码失败");
            }
            return { key: result.key, qrImage: result.qrImage };
          }}
          poll={(key) =>
            services.current?.pollLogin(key) ?? Promise.resolve({ code: 0, loggedIn: false, message: "还没准备好" })
          }
          scanHint={loginFor === "qq" ? "使用 QQ、微信、QQ 音乐任一 App 扫一扫" : "请打开网易云音乐 App → 扫一扫"}
          sourceName={sources.find((s) => s.id === loginFor)?.name}
          sendCaptcha={loginFor === "netease" ? (phone) => services.current!.sendCaptcha(phone) : undefined}
          loginByCaptcha={loginFor === "netease" ? (phone, code) => services.current!.loginByCaptcha(phone, code) : undefined}
          onSuccess={() => {
            const id = loginFor;
            setLoginFor(null);
            if (id) {
              setActiveSource(id);
              // 新账号的数据不能沿用上一个账号的缓存
              invalidatePrefix(`account:${id}:`);
              ensureAccount(id);
            }
            refreshAccountProfiles();
          }}
          onClose={() => setLoginFor(null)}
        />
      ) : null}

      <div className="body">
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
          {/* key=page：切页即重挂容器，调频进场动画（live.css room-tune/bleed-tune）每次都重播 */}
          {page === "home" ? (
            <div className="live-bleed" key={page}>{renderPage()}</div>
          ) : page === "stage" ? (
            <div className="live-plate" key={page}>
              <div className="live-plate-body">{renderPage()}</div>
            </div>
          ) : (
            <div className="live-room" key={page}>{renderPage()}</div>
          )}
        </section>
      </div>

      <Console
        npCover={npCover}
        phase={phase}
        likedNow={likedNow}
        sourceName={sourceName}
        title={trackTitle ?? baseName(trackId)}
        trackId={trackId}
        error={error}
        status={status}
        remote={remote}
        playing={playing}
        volume={volume}
        muted={muted}
        queueMode={queueMode}
        playbackRate={playbackRate}
        preservesPitch={preservesPitch}
        sleepEndsAt={sleepEndsAt}
        sleepWaitEnd={sleepWaitEnd}
        sleepPending={sleepPending}
        queueOpen={queueOpen}
        fxOpen={fxOpen}
        setQueueOpen={setQueueOpen}
        setFxOpen={setFxOpen}
        setPage={setPage}
        setNotice={setNotice}
        toggleCurrentLike={toggleCurrentLike}
        timeEl={timeEl}
        totalEl={totalEl}
        barEl={barEl}
        tipEl={tipEl}
        sleepEl={sleepEl}
        ringEl={ringEl}
        dragging={dragging}
        services={services}
      />
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
            const libTrack = trackById(trackId);
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
