import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { toast } from "./toast.js";
import type { SourceOption } from "./views/discover/index.js";
import { DiscoverPage } from "./af/pages/Discover.js";
import { PlaylistsPage } from "./af/pages/Playlists.js";
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
import { getActiveSource, setActiveSource, subscribeActiveSource } from "./active-source.js";
import { AccountMenu, type AccountProfile } from "./live/AccountMenu.js";
import { LoginDialog } from "./views/discover/LoginDialog.js";
import { installKeyboard } from "./input/keyboard.js";
import { CommandPalette } from "./input/CommandPalette.js";
import { Sidebar } from "./af/Sidebar.js";
import { Topbar } from "./af/Topbar.js";
import { invalidateAccountData, type AccountBundle } from "./account-data.js";
import { loadNet } from "../domain/net-cache/index.js";
import { accountKey } from "./account-data.js";
import { getThemePref, subscribeThemePref } from "./theme.js";
import { getMotionPref, subscribeMotionPref } from "./motion.js";


/** 四个账号数据入口的提示：账号是「当前音源」那一个，不再写死网易云。 */
const accountHint = (kind: AccountKind, sourceName: string): string => {
  switch (kind) {
    case "daily":
      return `登录${sourceName}后，这里显示账号的每日推荐（每天 06:00 换新）`;
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
import { LikedPage } from "./af/pages/Liked.js";
import { RoamPage } from "./af/pages/Roam.js";
import { SettingsPage } from "./af/pages/Settings.js";
import { HistoryPage } from "./af/pages/History.js";
import { ArchivePage } from "./af/pages/Archive.js";
import { LocalPage } from "./af/pages/Local.js";
import { DownloadsPage } from "./af/pages/Downloads.js";
import { StudioDrawer } from "./af/Studio.js";
import { MediaDock } from "./af/MediaDock.js";
import { Hotkeys, KeysSheet } from "./af/Keys.js";
import { PerfHUD } from "./af/PerfHUD.js";
import { ListEditor } from "./af/ListEditor.js";
import { getTracks, trackById } from "../domain/library/state.js";
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
import { AfContext, type AfSource, type AfTrack } from "./af/context.js";
import { useAfUi } from "./af/use-af.js";
import { NowPlaying } from "./af/NowPlaying.js";
import { Auth, DemoPanel, EggLayer, FocusLines, LyricsBar, MascotWalk, MiniCard, OnomaLayer } from "./af/layers.js";
import { ScanLogin } from "./af/ScanLogin.js";
import { RowMenu } from "./af/RowMenu.js";
import { useSystemReduce, loadPref } from "./af/prefs.js";
import { sourceShort, sourceTone } from "./af/data.js";

function baseName(p: string | null): string {
  if (!p) return "未选择";
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function App() {
  const [state, setState] = useState<AppState>(getState());
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");
  // 外观偏好：DOM 的 data-theme / data-motion 由 theme.ts / motion.ts 写真；
  // 这里只订阅变化，让设置页的分段按钮跟上（也含系统明暗/减少动效的自动切换）。
  const themePref = useSyncExternalStore(subscribeThemePref, getThemePref, getThemePref);
  const motionPref = useSyncExternalStore(subscribeMotionPref, getMotionPref, getMotionPref);
  const systemReduce = useSystemReduce();
  const resolvedTheme: "light" | "dark" =
    themePref === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : themePref;
  const effectiveMotion = motionPref === "system" ? (systemReduce ? "off" : "full") : motionPref;
  const reduce = effectiveMotion === "off";
  // 外壳只有一种：边栏 + 内容 + 控制台
  const [page, setPage] = useState<PageId>("online");
  const [localTab, setLocalTab] = useState<"library" | "downloads" | "radio">("library");
  // 首屏联网预取完成（或超时兜底）前先停在加载页，不把半空的内容页亮给用户
  const [bootReady, setBootReady] = useState(false);
  /* 顶栏搜索提交的一次性请求：at 变化即重新执行。
     搜索结果不是独立页面：有关键词时发现页整页切成结果态，清空即回推荐与榜单。 */
  const [searchSeek, setSearchSeek] = useState<{ text: string; at: number } | null>(null);
  /* 我的页内的三个视角：喜欢（默认）/ 最近 / 统计 */
  const [mineTab, setMineTab] = useState<"liked" | "recent" | "stats">("liked");
  const lastRoom = useRef<PageId>("online");
  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountProfiles, setAccountProfiles] = useState<Record<string, AccountProfile | undefined>>({});
  const [loginFor, setLoginFor] = useState<string | null>(null);
  /* 切源「换台闪变」：>0 时渲染全页扫描线覆盖层，动画结束（或 600ms 兜底）归零。
     key 用计数值——连切两次也能重播。 */
  const [tuneFlash, setTuneFlash] = useState(0);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (tuneFlash <= 0) return;
    flashTimer.current = window.setTimeout(() => setTuneFlash(0), 600);
    return () => window.clearTimeout(flashTimer.current);
  }, [tuneFlash]);

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
  const [libraryRoots, setLibraryRoots] = useState<string[]>([]);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [lyricFiltersText, setLyricFiltersText] = useState("");
  const [globalTokenCount, setGlobalTokenCount] = useState(0);
  const services = useRef<Services | null>(null);
  /*
   * 装配完成的信号。内容页在首帧就挂载，早于 bootstrap 完成；
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
      // 不足 2% 不画：54px 的环上 1.4% 只有一个点那么长，
      // 读起来像污渍而不是进度（2026-11-12 用户截图里的"球旁小绿点"）。
      const shown = ringPct < 0.02 ? 0 : ringPct;
      ringEl.current.style.strokeDashoffset = (RING_CIRC * (1 - shown)).toFixed(2);
    }
    // 睡眠定时剩余时间同样只写 DOM：1s 一个 setInterval 会违反「时间唯一」（I1），
    // 而 deadline 是绝对的，掉帧后补算也不会累积误差。
    if (sleepEl.current) {
      const endsAt = getState().sleep.endsAt;
      if (endsAt !== null) sleepEl.current.textContent = fmt(Math.max(0, endsAt - Date.now()));
    }
  };

  useEffect(() => {
    // 启动层在 index.html 里，App 挂载后通知它退场
    (window as unknown as { __bootDone?: () => void }).__bootDone?.();
  }, []);

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
        // 结果落进 domain/net-cache，之后每次切页都直接命中；
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
          // 不 await、缓 2 秒再发：启动的带宽先给上面这两份，抢不到也不影响放行。
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
  /*
   * 底栏的曲名 / 歌手分开取：在线曲目的 trackTitle 是「歌名 — 歌手」拼好的整串，
   * 按「—」拆会误伤带横线的歌名；队列元数据里本来就分开存着。
   * 本地曲目从曲库取，取不到就留空（副行只剩播放状态，不编一个"未知歌手"）。
   */
  const npMeta = trackId ? state.queue.remote[trackId] : undefined;
  /* 本地曲目 trackTitle 为空（kernel 只存在线元数据），旧实现直接回落到文件名；
     曲库里本来就有标题/歌手，先查库再退文件名，底栏才显示「夜的第七章」而不是 .mp3。 */
  const localMeta = trackId && !remote ? trackById(trackId) : undefined;
  const npTitle = npMeta?.title ?? trackTitle ?? localMeta?.title ?? null;
  const npArtist = npMeta?.artist ?? localMeta?.artist ?? "";
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
    /* 在线曲目的封面地址在队列元数据里（player.remote 只存 sourceId/songId，
       常常没有 coverUrl）。不补这一手，底栏就只剩盘纹占位，而播放页大图明明有图
       （2026-11-12 用户截图："只有看到歌名"）。 */
    remote: remote && npMeta?.coverUrl && !remote.coverUrl ? { ...remote, coverUrl: npMeta.coverUrl } : remote,
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
      // 只停不播（关窗收托盘用）：已经暂停时收到它必须什么都不发生
      registerCommand({
        id: "play-stop",
        label: "暂停播放",
        run: () => dispatch({ type: "player/pause" }),
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
        id: "tab-local",
        label: "转到：本地曲库",
        hint: "Ctrl+F 聚焦搜索",
        run: () => setPage("local"),
      }),
      registerCommand({ id: "tab-online", label: "转到：发现", run: () => setPage("online") }),
      registerCommand({ id: "tab-roam", label: "转到：漫游", run: () => setPage("roam") }),
      registerCommand({
        id: "tab-liked",
        label: "转到：喜欢的音乐",
        run: () => {
          setMineTab("liked");
          setPage("mine");
        },
      }),
      registerCommand({
        id: "tab-recent",
        label: "转到：最近播放",
        run: () => {
          setMineTab("recent");
          setPage("mine");
        },
      }),
      registerCommand({
        id: "tab-stats",
        label: "转到：听歌报告",
        run: () => {
          setMineTab("stats");
          setPage("mine");
        },
      }),
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
    /** 节目来源标签（「内地榜」「搜索 · xx」），queue/set 落进队列给播放页 ON AIR 显示 */
    origin?: string,
  ): Promise<void> => {
    const svc = services.current;
    if (!svc) return;
    const q = loadPref<string>("quality", "hq");
    const level = q === "standard" ? "128k" : q === "lossless" || q === "hires" ? "flac" : "320k";
    await svc.resolveOnlineUrl(sourceId, track.sourceId, level);

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

  const accountBundle = async (kind: AccountKind): Promise<AccountBundle> => {
    const svc = services.current ?? (await servicesReady.current);
    if (!svc) return { sourceId: "", songs: [], hint: null };
    const resolved = await resolveAccountSource();
    if (!resolved.id) return { sourceId: "", songs: [], hint: resolved.hint(kind) };
    const id = resolved.id;
    // Record 强制四类账号数据都给出加载器：以后再加一类，编译器直接点名
    const loaders: Record<AccountKind, () => Promise<RemoteTrack[]>> = {
      daily: () => svc.accountDailySongs(id),
      liked: () => svc.accountLikedSongs(id),
      week: () => svc.accountHistory(id, "week"),
      fm: () => svc.accountPersonalFm(id),
    };
    const songs = await loaders[kind]();
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
      // 播放失败是瞬态反馈：4.2 秒后自清，不再挂成顶部常驻条
      toast(err instanceof Error ? err.message : "这首歌暂时播不了", "bad");
    });
  };

  /* 账号红心（底栏 + 喜欢页取消红心 + 绑定生命周期）：hooks/use-account-likes.ts */
  const { accountSource, ensureAccount, unlikeAccount, toggleCurrentLike, likeActionRef } = useAccountLikes({
    services,
    notify: (text, kind) => toast(text, kind ?? "info"),
    resolveAccountSource,
  });

  /* ---- 外壳切换：直播带 ⇄ 旧标签页 ---- */
  useEffect(() => {
    if (page !== "stage") lastRoom.current = page;
  }, [page]);

  /* 「我的」：喜欢 / 最近 / 统计三个视角收进一页，页头右侧切。 */
  const mineTabs = (
    <div className="lib-tabs">
      {(
        [
          ["liked", "喜欢"],
          ["recent", "最近"],
          ["stats", "统计"],
        ] as const
      ).map(([id, label]) => (
        <button
          type="button"
          key={id}
          className={mineTab === id ? "on" : ""}
          onClick={() => setMineTab(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  /* ---- 页面挂载：加页只改这里 + pages.ts，不再有涨到十个分支的三元链 ---- */
  const renderPage = (): ReactNode => {
    switch (page) {
      case "stage":
        // 播放页是 fixed 覆盖层（af/NowPlaying），内容区留空
        return null;
      case "mine":
        return (
          <LikedPage
            onPlayGroup={onPlayGroup}
            account={() => accountBundle("liked")}
            onPlayRemote={(sourceId, track, list) => playRemoteSafe(sourceId, track, list, false, "喜欢的音乐")}
            onUnlike={unlikeAccount}
          />
        );
      case "history":
        return <HistoryPage />;
      case "archive":
        return <ArchivePage />;
      case "downloads":
        return <DownloadsPage />;
      case "local":
        return (
          <LocalPage
            mode="local"
            tracks={getTracks()}
            scanning={scanning}
            scanNote={scanNote}
            onScan={() => void onScan()}
            onPlayGroup={onPlayGroup}
            downloads={null}
          />
        );
      case "roam":
        return <RoamPage />;
      case "settings":
        return <SettingsPage />;
      case "playlists":
        return (
          <PlaylistsPage
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
        return (
          <DiscoverPage
            sources={sources}
            daily={() => accountBundle("daily")}
            seekQuery={searchSeek}
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
            onSearch={(sourceId, keyword) => {
              const svc = services.current;
              if (!svc) return Promise.resolve({ items: [] });
              return svc.searchOnline(sourceId, keyword);
            }}
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

  /** 顶栏与左栏共用的一份账号摘要 */
  const accountSummary = {
    nick: accountProfiles[getActiveSource()]?.nick ?? null,
    avatarUrl: accountProfiles[getActiveSource()]?.avatarUrl ?? null,
    sourceName: sources.find((s) => s.id === getActiveSource())?.name ?? getActiveSource(),
    loggedIn: accountProfiles[getActiveSource()]?.loggedIn ?? false,
  };

  /* ---------- 界面层：真实状态 → 原型组件能消费的形状 ---------- */
  const toAfTrack = (id: string): AfTrack => {
    const meta = state.queue.remote[id];
    if (meta) {
      return {
        id,
        title: meta.title,
        artist: meta.artist,
        album: meta.artist,
        cover: meta.coverUrl ?? null,
        dur: (meta.durationMs ?? 0) / 1000,
        remote: { sourceId: meta.sourceId, songId: meta.songId, coverUrl: meta.coverUrl },
      };
    }
    const t = trackById(id);
    return {
      id,
      title: t?.title ?? baseName(id),
      artist: t?.artist ?? "",
      album: t?.album ?? "",
      cover: null,
      dur: (t?.durationMs ?? 0) / 1000,
    };
  };
  const currentTrack: AfTrack = trackId
    ? toAfTrack(trackId)
    : { id: "", title: "还没选歌", artist: "", album: "", cover: npCover, dur: 0 };

  const afSources: AfSource[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    short: sourceShort(s.id, s.name),
    tone: sourceTone(s.id),
    canAuth: s.canAuth,
    canPlaylists: s.canPlaylists,
    canDownload: s.canDownload,
  }));
  const afAccounts: Record<string, boolean> = Object.fromEntries(
    sources.map((s) => [s.id, Boolean(accountProfiles[s.id]?.loggedIn)]),
  );
  const afLoggedIn = Object.values(afAccounts).some(Boolean);

  const playIds = (ids: string[], startAt = 0): void => {
    const local: Track[] = [];
    const remoteTracks: RemoteTrack[] = [];
    let remoteSource = "";
    for (const id of ids) {
      const meta = state.queue.remote[id];
      if (meta) {
        remoteTracks.push({
          sourceId: meta.sourceId,
          title: meta.title,
          artist: meta.artist,
          album: meta.artist,
          durationMs: meta.durationMs ?? 0,
          coverUrl: meta.coverUrl,
        });
        remoteSource = meta.sourceId;
      } else {
        const t = trackById(id);
        if (t) local.push(t);
      }
    }
    if (remoteTracks.length > 0 && remoteTracks.length >= local.length) {
      const at = Math.min(Math.max(0, startAt), remoteTracks.length - 1);
      playRemoteSafe(remoteSource, remoteTracks[at]!, remoteTracks, false, "我的歌单");
    } else if (local.length > 0) {
      onPlayGroup(local, Math.min(Math.max(0, startAt), local.length - 1));
    } else {
      toast("这些曲目当前播不了", "info");
    }
  };

  const { api: afApi, onomas, focusKey, mascot, setMascot, boot } = useAfUi({
    page,
    setPage: (p) => setPage(p as PageId),
    localTab,
    setLocalTab,
    mineTab,
    setMineTab,
    state,
    services,
    playing,
    themePref,
    setThemePref: (p) => void services.current?.setTheme(p),
    motionPref,
    setMotionPref: (m) => void services.current?.setMotion(m),
    resolvedTheme,
    reduce,
    accountSource,
    resolveAccountSource,
    ensureAccount,
    toggleCurrentLike,
    sources: afSources,
    source: getActiveSource(),
    setSource: (id) => {
      setActiveSource(id);
    },
    accounts: afAccounts,
    loggedIn: afLoggedIn,
    loginFor: (id) => setLoginFor(id),
    loginSrc: loginFor,
    logout: (id) => {
      void (async () => {
        await services.current?.logout(id).catch(() => undefined);
        invalidateAccountData(`account:${id}:`);
        refreshAccountProfiles();
      })();
    },
    searchOnline: (q) => {
      const svc = services.current;
      return svc ? svc.searchOnline(getActiveSource(), q) : Promise.resolve({ items: [] });
    },
    playRemote: (sourceId, track, list, origin) =>
      playRemoteSafe(sourceId, track as RemoteTrack, list as RemoteTrack[], false, origin),
    playIds,
    toAfTrack,
    currentTrack,
    notify: (text, kind) => toast(text, kind ?? "info"),
    openFx: () => setFxOpen(true),
    lastRoom: lastRoom.current,
  });

  return (
    <AfContext.Provider value={afApi}>
      {/* 启动层是 index.html 里的纯 HTML/CSS，不在这里挂 */}
      {/* 离线态（P0-25）：常驻横幅，不用 toast —— 断网期间 toast 会反复刷屏 */}
      {offline ? (
        <div className="net-banner" role="status" aria-live="polite">
          离线 · 只放本地曲目，在线搜索/登录/榜单暂不可用
        </div>
      ) : null}
      <div className={`app${afApi.density === "compact" ? " is-compact" : ""}${offline ? " offline" : ""}`}>
        <Sidebar />
        <div className="main">
          <Topbar />

      <AccountMenu
        open={accountOpen}
        sources={sources.filter((s) => s.canAuth).map((s) => ({ id: s.id, name: s.name, canAuth: s.canAuth }))}
        active={getActiveSource()}
        profiles={accountProfiles}
        loginFor={loginFor}
        renderLogin={(id) => (
          <LoginDialog
            start={async (ch) => {
              const svc = services.current;
              if (!svc) throw new Error("还没准备好，请稍后再试");
              const result = await svc.startLogin(id, ch);
              if (!("key" in result) || typeof result.key !== "string" || typeof result.qrImage !== "string") {
                throw new Error("获取二维码失败");
              }
              return { key: result.key, qrImage: result.qrImage };
            }}
            poll={(key) =>
              services.current?.pollLogin(key) ?? Promise.resolve({ code: 0, loggedIn: false, message: "还没准备好" })
            }
            scanHint={id === "qq" ? "使用 QQ、微信、QQ 音乐任一 App 扫一扫" : "请打开网易云音乐 App → 扫一扫"}
            sourceName={sources.find((s) => s.id === id)?.name}
            sendCaptcha={id === "netease" ? (phone) => services.current!.sendCaptcha(phone) : undefined}
            loginByCaptcha={id === "netease" ? (phone, code) => services.current!.loginByCaptcha(phone, code) : undefined}
            onSuccess={() => {
              setLoginFor(null);
              setTuneFlash((k) => k + 1); // 接入成功也是一次换台
              setActiveSource(id);
              // 新账号的数据不能沿用上一个账号的缓存
              invalidateAccountData(`account:${id}:`);
              ensureAccount(id);
              refreshAccountProfiles();
            }}
            onClose={() => setLoginFor(null)}
          />
        )}
        onClose={() => {
          setAccountOpen(false);
          setLoginFor(null); // 弹层关了，内嵌登录流程一并收回
        }}
        onSwitch={(id) => {
          setTuneFlash((k) => k + 1); // 换台闪变先落弦，数据换源在动画后半程接上
          setActiveSource(id);
        }}
        onLogin={(id) => setLoginFor(id)}
        onLogout={(id) => {
          void (async () => {
            await services.current?.logout(id).catch(() => undefined);
            invalidateAccountData(`account:${id}:`);
            if (getActiveSource() === id) {
              accountSource.current = "";
              beginAccount("");
            }
            refreshAccountProfiles();
          })();
        }}
      />

      {/* 切源换台闪变：琥珀扫描线扫过全页 + 轻微压暗（animationend 或 600ms 兜底移除） */}
      {tuneFlash > 0 ? (
        <div className="tune-flash" key={tuneFlash} aria-hidden="true" onAnimationEnd={() => setTuneFlash(0)} />
      ) : null}

          <div className="main__page scroll live-room" key={page}>
          {notice ? (
            /* 常驻提示（新版本 / 上次异常退出）必须能关：这类不自动消退，
               没有 × 就只能等下次覆盖或重启（2026-11-12 用户："一直显示不会消失"）。 */
            <div className="notice-bar">
              {notice.url ? (
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
              )}
              <button
                type="button"
                className="notice-x"
                aria-label="关闭提示"
                title="关闭"
                onClick={() => setNotice(null)}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                  <path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : null}
          {renderPage()}
          </div>

        <Console
        npCover={npCover}
        phase={phase}
        likedNow={likedNow}
        sourceName={sourceName}
        title={npTitle ?? baseName(trackId)}
        artist={npArtist || null}
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
        page={page}
        queueOpen={queueOpen}
        fxOpen={fxOpen}
        setQueueOpen={setQueueOpen}
        setFxOpen={setFxOpen}
        setPage={setPage}
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
        </div>
      </div>

      <Toaster />
      {page === "stage" ? <NowPlaying /> : null}
      <RowMenu />
      {afApi.lyricsBar && !afApi.playerOpen ? <LyricsBar /> : null}
      <Auth />
      <ScanLogin
        sourceId={loginFor}
        sourceName={sources.find((s) => s.id === loginFor)?.name ?? loginFor ?? ""}
        sourceTone={sourceTone(loginFor ?? "")}
        account={accountProfiles[loginFor ?? ""]?.nick ?? undefined}
        start={async (ch) => {
          const svc = services.current;
          if (!svc) throw new Error("还没准备好，请稍后再试");
          const result = await svc.startLogin(loginFor as string, ch);
          if (!("key" in result) || typeof result.key !== "string" || typeof result.qrImage !== "string") {
            throw new Error("获取二维码失败");
          }
          return { key: result.key, qrImage: result.qrImage };
        }}
        poll={(key) => services.current?.pollLogin(key) ?? Promise.resolve({ code: 0, loggedIn: false, message: "还没准备好" })}
        sendCaptcha={loginFor === "netease" ? (phone) => services.current!.sendCaptcha(phone) : undefined}
        loginByCaptcha={loginFor === "netease" ? (phone, code) => services.current!.loginByCaptcha(phone, code) : undefined}
        onSuccess={() => {
          const id = loginFor;
          if (!id) return;
          setLoginFor(null);
          setTuneFlash((k) => k + 1);
          setActiveSource(id);
          invalidateAccountData(`account:${id}:`);
          ensureAccount(id);
          refreshAccountProfiles();
        }}
        onClose={() => setLoginFor(null)}
      />
      <EggLayer />
      <StudioDrawer />
      <MediaDock />
      <KeysSheet />
      <Hotkeys />
      <PerfHUD />
      <ListEditor />
      {afApi.miniMode ? <MiniCard /> : null}
      {afApi.demoOpen ? <DemoPanel /> : null}
      <OnomaLayer items={onomas} />
      {focusKey > 0 ? <FocusLines key={focusKey} /> : null}
      {mascot ? <MascotWalk onEnd={() => setMascot(false)} /> : null}

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

      {queueOpen ? (
        <QueuePanel
          queue={state.queue}
          cover={(id, path) => services.current?.cover(id, path) ?? Promise.resolve(null)}
          onClose={() => setQueueOpen(false)}
        />
      ) : null}
    </AfContext.Provider>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<App />);
