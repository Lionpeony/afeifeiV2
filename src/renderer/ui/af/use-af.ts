/* 界面层控制器：把 App 的真实播放/账号状态整理成 AfApi，并托管彩蛋/浮层状态。
   逻辑层（kernel/domain/services）只读/派发 intent，不在这里重算播放语义。 */
import { useEffect, useRef, useState, type RefObject } from "react";

import type { AppState } from "../../../contracts/index.js";
import { dispatch, getState } from "../../kernel/index.js";
import { isLiked as isLocalLiked, toggleLike as toggleLocalLike } from "../../domain/likes/index.js";
import { isAccountLiked, pressAccountLike } from "../../domain/account-likes/index.js";
import { getHistory, subscribe as subscribeHistory, clearHistory as clearHistoryDomain } from "../../domain/history/index.js";
import type { AccountKind } from "../hooks/use-account-likes.js";
import type { Services } from "../services.js";
import { Sound } from "./sound.js";
import { likeToastCopy, eggText, packToastCopy, packEventCopy, setActivePalette } from "./copy.js";
import { SECRET_CODES, PALETTES, EGGS } from "./data.js";
import { usePref, useVisibilityHidden } from "./prefs.js";
import type { AfApi, AfDensity, AfDetailSeek, AfEqState, AfListEditor, AfMotion, AfMyList, AfOverlay, AfSleep, AfSource, AfThemePref, AfTrack } from "./context.js";
import type { OnomaItem } from "./layers.js";

/** E23 副歌现场：各包进场拟声 + 应援色（onoma tone）。 */
const CHORUS_FX: Record<string, { say: string; tone: string }> = {
  default: { say: "キラッ", tone: "coral" },
  mygo: { say: "ヒカリ…", tone: "mint" },
  gbc: { say: "ウォー!!", tone: "coral" },
  btr: { say: "バン!!", tone: "yellow" },
};

export interface AfUiInput {
  page: string;
  setPage(p: string): void;
  localTab: "library" | "downloads" | "radio";
  setLocalTab(t: "library" | "downloads" | "radio"): void;
  mineTab: "liked" | "recent" | "stats";
  setMineTab(t: "liked" | "recent" | "stats"): void;
  state: AppState;
  services: RefObject<Services | null>;
  playing: boolean;
  themePref: AfThemePref;
  setThemePref(p: AfThemePref): void;
  motionPref: AfMotion | "system";
  setMotionPref(m: AfMotion | "system"): void;
  resolvedTheme: "light" | "dark";
  reduce: boolean;
  accountSource: RefObject<string>;
  resolveAccountSource(): Promise<{ id: string | null; hint(kind: AccountKind): string | null }>;
  ensureAccount(id: string): void;
  toggleCurrentLike(): void;
  sources: AfSource[];
  source: string;
  setSource(id: string): void;
  accounts: Record<string, boolean>;
  loggedIn: boolean;
  loginFor(id: string | null): void;
  logout(id: string): void;
  loginSrc: string | null;
  searchOnline(q: string): Promise<{ items: unknown[]; artists?: { id?: string; name: string; picUrl?: string }[] }>;
  /** 搜索浮层「查看全部结果」→ 发现页整表搜索 */
  seekOnlineSearch(text: string): void;
  /** 搜索浮层发起的详情跳转（状态在 index 持有，Discover 读它开门） */
  discoverDetail: AfDetailSeek | null;
  openDiscoverDetail(ref: Omit<AfDetailSeek, "at">): void;
  clearDiscoverDetail(): void;
  playRemote(sourceId: string, track: unknown, list: unknown[], origin: string): void;
  playIds(ids: string[], startAt?: number): void;
  toAfTrack(id: string): AfTrack;
  currentTrack: AfTrack;
  notify(text: string, kind?: "ok" | "info" | "bad"): void;
  /** 用系统浏览器打开外链（点歌分享；主进程有白名单） */
  openExternal(url: string): void;
  profileOf(id: string): { nick: string | null; avatarUrl: string | null } | null;
  lastRoom: string;
}

export interface AfUiResult {
  api: AfApi;
  onomas: OnomaItem[];
  focusKey: number;
  boot: boolean;
}

export function useAfUi(input: AfUiInput): AfUiResult {
  const { state, services, playing, currentTrack, toAfTrack, sources, source, accounts, loggedIn, reduce, resolvedTheme } = input;
  const currentId = state.player.trackId ?? "";
  const track = currentTrack;

  /* ---------- 偏好 / 浮层 ---------- */
  const [eggs, setEggs] = usePref<string[]>("eggs", []);
  const [packEggs, setPackEggs] = usePref<Record<string, string[]>>("packEggs", {});
  const [palette, setPalette] = usePref<string>("palette", "default");
  const [unlocked, setUnlocked] = usePref<string[]>("unlocked", ["default"]);
  const [chorus, setChorus] = usePref<Record<string, number>>("chorus", {});
  const [plays, setPlays] = usePref<Record<string, number>>("plays", {});
  const [sfx, setSfx] = usePref<boolean>("sfx", true);
  const [density, setDensity] = usePref<AfDensity>("density", "cozy");
  const [lyricsOn, setLyricsOn] = usePref<boolean>("lyricsOn", false);
  const playerOpen = input.page === "stage";
  const [playerClosing, setPlayerClosing] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ trackId: string; x: number; y: number } | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [overlay, setOverlay] = useState<AfOverlay>(null);
  /** 角落小人：bye=背影离开（E13/E20 五连），peek=探头回来（E27 断网恢复） */
  const [corner, setCorner] = useState<null | "bye" | "peek">(null);
  const [struckId, setStruckId] = useState<string | null>(null);
  const [sheerSide, setSheerSide] = useState<"l" | "r" | null>(null);
  const [onomas, setOnomas] = useState<OnomaItem[]>([]);
  const [focusKey, setFocusKey] = useState(0);
  const [boot, setBoot] = useState(true);
  const [srcSwap, setSrcSwap] = useState<{ id: string; phase: "close" | "hold" | "open"; scope?: "pill" } | null>(null);
  const swapTimers = useRef<number[]>([]);
  /** 换源序号：连续换源时，旧定时器即使漏清也不许再改相位或弹 toast。 */
  const swapSeq = useRef(0);
  useEffect(() => () => swapTimers.current.forEach((t) => clearTimeout(t)), []);

  useVisibilityHidden();

  /* 色板 / 动效档位落 DOM；主题由 theme.ts 管 */
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    setActivePalette(palette); // 服务层字符串的收敛翻译点跟着换包
    Sound.setPack(palette); // UI 音色跟着包换气质（btr 小声 / mygo 闷柔 / gbc 干硬）
  }, [palette]);

  /* 世界随时间走：时段落 DOM（stage / 歌词墙按时段微调，纯 CSS 静态变化，不吃动效档位）
     用 setTimeout 链对表（I1：ui 层不用 setInterval） */
  useEffect(() => {
    let timer = 0;
    const apply = (): void => {
      const h = new Date().getHours();
      document.documentElement.dataset.hour = h >= 22 || h < 5 ? "night" : h >= 17 ? "dusk" : "day";
      timer = window.setTimeout(apply, 60_000);
    };
    apply();
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    Sound.setEnabled(sfx && !reduce);
  }, [sfx, reduce]);

  /* ---------- 反馈 ---------- */
  const toast = (text: string, opts?: { hand?: boolean; icon?: string; action?: { label: string; onClick(): void }; ms?: number }): void => {
    void opts;
    input.notify(text, opts?.hand ? "info" : "ok");
  };

  const onoma = (text: string, opts?: { tone?: string; x?: number; y?: number }): void => {
    if (!sfx || reduce) return;
    const id = "o" + Math.random().toString(36).slice(2);
    setOnomas((list) => [
      ...list.slice(-2),
      {
        id,
        text,
        tone: opts?.tone ?? "coral",
        x: opts?.x ?? window.innerWidth / 2,
        y: opts?.y ?? window.innerHeight / 2,
        rot: (Math.random() * 12 - 6).toFixed(1),
      },
    ]);
    setTimeout(() => setOnomas((list) => list.filter((o) => o.id !== id)), 820);
  };
  const onomaAt = (el: HTMLElement | null, text: string, tone?: string): void => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    onoma(text, { tone, x: r.left + r.width / 2, y: r.top - 16 });
  };
  const focus = (): void => {
    if (reduce) return;
    setFocusKey((k) => k + 1);
  };
  useEffect(() => {
    if (!focusKey) return;
    const t = setTimeout(() => setFocusKey(0), 640);
    return () => clearTimeout(t);
  }, [focusKey]);

  /* ---------- v5.6：历史 / 我的歌单 / 排练室 / 悬浮控制 ---------- */
  const [, setHistoryRev] = useState(0);
  useEffect(() => subscribeHistory(() => setHistoryRev((r) => r + 1)), []);
  const history = getHistory().map((e) => ({ id: e.trackId, at: e.at }));
  const clearHistory = (): void => clearHistoryDomain();
  const [archiveFilter, setArchiveFilter] = useState("all");

  const [myLists, setMyLists] = usePref<AfMyList[]>("myLists", []);
  const [focusList, setFocusList] = useState<string | null>(null);
  const [listEditor, setListEditor] = useState<AfListEditor | null>(null);
  const openList = (id: string): void => {
    setFocusList(id);
    input.setPage("playlists");
  };
  const addToMyList = (listId: string, trackId: string): void => {
    setMyLists((list) =>
      list.map((l) =>
        l.id === listId && !l.tracks.includes(trackId)
          ? { ...l, tracks: [...l.tracks, trackId], updatedAt: Date.now() }
          : l,
      ),
    );
  };
  const removeFromMyList = (listId: string, trackId: string): void => {
    setMyLists((list) =>
      list.map((l) => (l.id === listId ? { ...l, tracks: l.tracks.filter((t) => t !== trackId), updatedAt: Date.now() } : l)),
    );
  };

  const [studio, setStudio] = useState<{ tab: "sleep" | "quality" | "eq" } | null>(null);
  const [quality, setQuality] = usePref<"standard" | "hq" | "lossless" | "hires">("quality", "hq");
  const [eqPreset, setEqPreset] = usePref<string>("eqPreset", "flat");
  const eq10 = state.audio.eq;
  const eq: AfEqState = { preset: eqPreset, bands: [eq10[1] ?? 0, eq10[3] ?? 0, eq10[5] ?? 0, eq10[7] ?? 0, eq10[9] ?? 0] };
  const map5to10 = (b: number[]): number[] => [b[0], b[0], b[0] * 0.6, b[1], b[1] * 0.6, b[2], b[2] * 0.6, b[3], b[4], b[4]];
  const setEq = (v: AfEqState): void => {
    setEqPreset(v.preset);
    dispatch({ type: "audio/setEq", gains: map5to10(v.bands) });
  };

  const [sleepMinutes, setSleepMinutes] = usePref<number>("sleepMinutes", 30);
  const [sleepLeft, setSleepLeft] = useState(0);
  const sleepStore = getState().sleep;
  const sleep: AfSleep = sleepStore.endsAt
    ? { mode: "timer", until: sleepStore.endsAt, minutes: sleepMinutes }
    : sleepStore.pending
      ? { mode: "song", until: null, minutes: sleepMinutes }
      : { mode: "off", until: null, minutes: sleepMinutes };
  const startSleep = (arg: "song" | number): void => {
    if (arg === "song") {
      dispatch({ type: "sleep/set", endsAt: Date.now() + 800, waitEnd: true });
      setSleepLeft(0);
      toast("播完这首就关灯", { hand: true });
      return;
    }
    const m = Number(arg) || 30;
    setSleepMinutes(m);
    dispatch({ type: "sleep/set", endsAt: Date.now() + m * 60000, waitEnd: false });
    setSleepLeft(m * 60);
    toast(`定时 ${m} 分钟，到点我把灯关掉`, { icon: "check" });
  };
  const stopSleep = (): void => {
    dispatch({ type: "sleep/clear" });
    setSleepLeft(0);
    toast("定时取消了", { hand: true });
  };
  useEffect(() => {
    if (!sleepStore.endsAt) {
      setSleepLeft(0);
      return;
    }
    let timer = 0;
    const tick = (): void => {
      const left = Math.max(0, Math.round((sleepStore.endsAt! - Date.now()) / 1000));
      setSleepLeft(left);
      if (left > 0) timer = window.setTimeout(tick, 1000);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [sleepStore.endsAt]);

  const [showTr, setShowTr] = usePref<boolean>("showTr", true);
  const [keysOpen, setKeysOpen] = useState(false);
  const [lyricsFull, setLyricsFull] = useState(false);
  const [keysHintSeen, setKeysHintSeen] = usePref<boolean>("keysHintSeen", false);
  const dismissKeysHint = (): void => setKeysHintSeen(true);
  const muted = state.player.muted;
  const toggleMute = (): void => dispatch({ type: "player/setMuted", muted: !muted });

  const discovered = useRef(new Set(eggs));
  const discover = (id: string, opts?: { silent?: boolean }): void => {
    if (discovered.current.has(id)) return;
    discovered.current.add(id);
    const next = Array.from(discovered.current);
    setEggs(next);
    if (palette !== "default") {
      // 累积感：首次拾到时归档到当时的包，各包进度分开算
      setPackEggs((prev) => {
        const mine = prev[palette] ?? [];
        return mine.includes(id) ? prev : { ...prev, [palette]: [...mine, id] };
      });
    }
    if (!opts?.silent) {
      Sound.ding();
      toast(`拾到一枚拨片 · ${next.length}/${EGGS.length}`, { icon: "pick" });
    }
  };

  /* ---------- 播放控制 ---------- */
  const positionMs = (): number => services.current?.positionMs() ?? 0;
  const durationMs = (): number => services.current?.engine.durationMs() ?? 0;
  const setPlaying = (v: boolean): void => {
    if (v === playing) return;
    dispatch({ type: v ? "player/play" : "player/pause" });
  };
  const togglePlay = (): void => dispatch({ type: "player/toggle" });
  const seekTo = (sec: number): void => dispatch({ type: "player/seek", positionMs: Math.max(0, Math.round(sec * 1000)) });

  /** 换音源：幕间动效。幕布合上后才真正切源，拉开时已是新界面。 */
  const switchSource = (id: string, opts: { scope?: "pill"; quiet?: boolean } = {}): void => {
    if (id === source) {
      toast("已经在这边的台上了。", { hand: true });
      return;
    }
    const name = sources.find((s) => s.id === id)?.name ?? id;
    if (reduce) {
      input.setSource(id);
      if (!opts.quiet) toast(`换到 ${name} 了`, { hand: true });
      return;
    }
    swapTimers.current.forEach((t) => clearTimeout(t));
    swapTimers.current = [];
    const seq = (swapSeq.current += 1);
    const live = (): boolean => seq === swapSeq.current;
    if (opts.scope === "pill") {
      setSrcSwap({ id, phase: "close", scope: "pill" });
      swapTimers.current.push(
        window.setTimeout(() => {
          if (!live()) return;
          input.setSource(id);
          setSrcSwap({ id, phase: "open", scope: "pill" });
          Sound.paper();
        }, 170),
      );
      swapTimers.current.push(
        window.setTimeout(() => {
          if (live()) setSrcSwap(null);
        }, 400),
      );
      return;
    }
    setSrcSwap({ id, phase: "close" });
    onoma("ザッ…", { tone: "mint", x: window.innerWidth / 2, y: window.innerHeight * 0.34 });
    /* 390 合拢 → 640 拉开（hold 250ms）→ 1060 收尾。
       原来 hold 510ms、总 1320ms，视觉上像卡住；幕布本身 380/400ms 不变。 */
    swapTimers.current.push(
      window.setTimeout(() => {
        if (!live()) return;
        input.setSource(id);
        setSrcSwap({ id, phase: "hold" });
        Sound.paper();
      }, 390),
    );
    swapTimers.current.push(
      window.setTimeout(() => {
        if (live()) setSrcSwap({ id, phase: "open" });
      }, 640),
    );
    swapTimers.current.push(
      window.setTimeout(() => {
        if (!live()) return;
        setSrcSwap(null);
        toast(`幕拉开了，现在放的是 ${name}`, { hand: true });
      }, 1060),
    );
  };
  const openScan = (id: string): void => input.loginFor(id);
  const closeScan = (): void => input.loginFor(null);

  const next = (): void => dispatch({ type: "queue/next" });
  const prev = (): void => dispatch({ type: "queue/prev", atPositionMs: positionMs() });
  const goTo = (id: string): void => {
    const meta = state.queue.remote[id];
    dispatch({
      type: "player/play",
      trackId: id,
      trackTitle: meta?.title ?? null,
      remote: meta ? { sourceId: meta.sourceId, songId: meta.songId, coverUrl: meta.coverUrl } : null,
    });
  };

  const skipStamps = useRef<number[]>([]);
  const skipToastCount = useRef(0);
  const chorusFired = useRef<string | null>(null);
  const artistStreak = useRef<{ name: string; n: number }>({ name: "", n: 0 });
  const userSkip = (kind: "next" | "prev"): void => {
    const now = Date.now();
    skipStamps.current = skipStamps.current.filter((t) => now - t < 60_000);
    skipStamps.current.push(now);
    if (skipStamps.current.length === 3) {
      /* E20 三连迷路：先温柔地问一句，5 连还有角落小背影（E13）兜底 */
      skipToastCount.current += 1;
      discover("E20", { silent: true });
      toast(eggText(palette, "lostSkip", skipToastCount.current), { hand: true });
    }
    if (skipStamps.current.length >= 5) {
      skipStamps.current = [];
      setCorner("bye");
      setTimeout(() => setCorner(null), 2900);
      discover("E13");
      onoma("タッタッ…", { tone: "mint", x: window.innerWidth - 150, y: window.innerHeight - 150 });
    }
    if (currentId) {
      setStruckId(currentId);
      setTimeout(() => setStruckId(null), 1400);
    }
    if (!reduce) {
      onoma("シュッ", { tone: "yellow", x: window.innerWidth * 0.46, y: window.innerHeight * 0.52 });
      setSheerSide(kind === "prev" ? "l" : "r");
      setTimeout(() => setSheerSide(null), 400);
    }
    Sound.paper();
    if (kind === "prev") prev();
    else next();
  };

  const shuffle = state.queue.mode === "shuffle";

  /* E18 音量拉满：越过 95% 触发一次破音抖动 + 手写小字；降回去才重新武装。
     文案递进池：第几次触发说第几句（copy.ts eggText n）。 */
  const volArmed = useRef(true);
  const volCount = useRef(0);
  const setVolume = (v: number): void => {
    dispatch({ type: "player/setVolume", volume: v });
    if (v >= 0.95 && volArmed.current) {
      volArmed.current = false;
      volCount.current += 1;
      discover("E18");
      onoma("バッ…", { tone: "coral", x: window.innerWidth * 0.5, y: window.innerHeight * 0.62 });
      toast(eggText(palette, "volMax", volCount.current), { hand: true });
      document.documentElement.classList.add("vol-max");
      setTimeout(() => document.documentElement.classList.remove("vol-max"), 1200);
    }
    if (v < 0.95) volArmed.current = true;
  };

  /* E21 播放失败：这首歌…已经不在了（内核 player/error 会自动跳下一首，这里只补一句氛围） */
  const wasPlayErr = useRef(false);
  const playErrCount = useRef(0);
  useEffect(() => {
    const isErr = state.player.status === "error";
    if (isErr && !wasPlayErr.current) {
      playErrCount.current += 1;
      discover("E21", { silent: true });
      toast(eggText(palette, "goneSong", playErrCount.current), { hand: true });
    }
    wasPlayErr.current = isErr;
  }, [state.player.status]);

  const toggleShuffle = (): void => {
    if (!shuffle) {
      discover("E07");
      Sound.tap();
    }
    dispatch({ type: "queue/mode", mode: shuffle ? "repeat-all" : "shuffle" });
  };
  const repeat: "off" | "all" | "one" = state.queue.mode === "repeat-one" ? "one" : state.queue.mode === "order" ? "off" : "all";
  const cycleRepeat = (): void => {
    const nextMode = state.queue.mode === "repeat-one" ? "order" : state.queue.mode === "order" ? "repeat-all" : "repeat-one";
    dispatch({ type: "queue/mode", mode: nextMode });
  };

  /* ---------- 红心 ---------- */
  const isLiked = (t: AfTrack): boolean => (t.remote ? isAccountLiked(t.remote.songId) : isLocalLiked(t.id));
  const toggleLike = (t?: AfTrack): void => {
    const target = t ?? track;
    if (!target.remote) {
      toggleLocalLike(target.id);
      return;
    }
    const remote = target.remote;
    void (async () => {
      let id = input.accountSource.current;
      if (!id) {
        const found = await input.resolveAccountSource();
        if (found.id) {
          input.ensureAccount(found.id);
          id = found.id;
        }
      }
      if (!id) {
        toast("登录后才能红心在线曲目", { hand: true });
        return;
      }
      const svc = services.current;
      if (!svc) return;
      const port = {
        likedIds: () => svc.accountLikedIds(id as string),
        likedTotal: () => svc.accountLikedTotal(id as string),
        setLiked: (songId: string, liked: boolean) => svc.accountSetLiked(id as string, songId, liked),
      };
      const wanted = !isAccountLiked(remote.songId);
      try {
        await pressAccountLike(port, remote.songId, wanted);
        toast(likeToastCopy(palette, wanted), { icon: "check" });
        if (wanted) discover("E05");
      } catch (err) {
        toast(err instanceof Error ? err.message : "红心没改成", { hand: true });
      }
    })();
  };

  /* ---------- 播放页 / 浮层 ---------- */
  const reportDislike = (t: AfTrack): void => {
    if (!t.remote) {
      toast("本地曲目没有「少推」", { hand: true });
      return;
    }
    void (services.current?.reportDislike(t.remote.sourceId, t.remote.songId, "fm") ?? Promise.resolve(false))
      .then((ok) => {
        toast(ok ? "记下了，少推这首" : "没记上，再试一次", { icon: ok ? "check" : undefined });
        if (ok) next();
      })
      .catch(() => toast("没记上，再试一次", { hand: true }));
  };
  const openPlayer = (): void => {
    input.setPage("stage");
    focus();
    onoma("ザッ…", { tone: "coral", x: window.innerWidth / 2, y: window.innerHeight * 0.42 });
    discover("E08", { silent: true });
    Sound.paper();
  };
  const closePlayer = (): void => {
    if (reduce) {
      input.setPage(input.lastRoom);
      return;
    }
    setPlayerClosing(true);
    setTimeout(() => {
      setPlayerClosing(false);
      input.setPage(input.lastRoom);
    }, 400);
  };
  const openRowMenu = (trackId: string, rect: DOMRect): void => {
    const w = 212;
    const h = 306;
    let x = rect.right - w;
    let y = rect.bottom + 8;
    if (y + h > window.innerHeight - 16) y = Math.max(12, rect.top - h - 8);
    setRowMenu({ trackId, x: Math.max(12, x), y });
  };
  const closeRowMenu = (): void => setRowMenu(null);

  const markChorus = (sec: number): void => {
    setChorus((c) => ({ ...c, [currentId]: sec }));
    Sound.ding();
    /* 拟声常驻：副歌点标记在高频位上落一个 ♪ 情绪气泡（docs/30 §18） */
    onoma("♪", { tone: "mint", x: window.innerWidth / 2, y: window.innerHeight - 150 });
    toast("副歌点记在这儿了", { icon: "check" });
  };
  const chorusAt = chorus[currentId] ?? null;

  /* ---------- 暗号 / Logo / 彩蛋 ---------- */
  const tryCode = (raw: string): boolean => {
    const code = (raw || "").trim();
    const hit = SECRET_CODES[code];
    if (!hit) return false;
    Sound.unlock();
    Sound.unbox();
    setPalette(hit.palette);
    setUnlocked((u) => (u.includes(hit.palette) ? u : [...u, hit.palette]));
    discover("E12");
    focus();
    setOverlay("unbox");
    setTimeout(() => setOverlay((o) => (o === "unbox" ? null : o)), 2800);
    setTimeout(() => toast("这是今晚的秘密 setlist。♡", { hand: true, ms: 3400 }), 1000);
    return true;
  };

  /* 换包过渡：每个包有专属的开场动画（eggs.css packfx--*），换包瞬间整站换色被动画盖住 */
  const [packFx, setPackFx] = useState<string | null>(null);
  const packFxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchPalette = (id: string): void => {
    if (id === palette) return;
    setPalette(id);
    Sound.tap();
    const label = PALETTES.find((p) => p.id === id)?.label ?? id;
    toast(packToastCopy(palette, label), { icon: "check" });
    setPackFx(id);
    if (packFxTimer.current) clearTimeout(packFxTimer.current);
    packFxTimer.current = setTimeout(() => setPackFx(null), 1500);
  };

  const logoClicks = useRef<number[]>([]);
  const onLogoClick = (): void => {
    const now = Date.now();
    logoClicks.current = logoClicks.current.filter((t) => now - t < 2200);
    logoClicks.current.push(now);
    if (logoClicks.current.length >= 5) {
      logoClicks.current = [];
      if (discovered.current.has("E11")) return;
      setOverlay("live");
      focus();
      Sound.crowd();
      setTimeout(() => setOverlay((o) => (o === "live" ? null : o)), 1800);
      discover("E11", { silent: true });
      setTimeout(() => toast("今晚加演一首。", { hand: true }), 700);
    }
  };

  const addDownload = (trackId: string): void => {
    const meta = state.queue.remote[trackId];
    const svc = services.current;
    if (!meta || !svc) {
      toast("这首没有可下载的在线音源", { hand: true });
      return;
    }
    void svc
      .downloadTrack(meta.sourceId, meta)
      .then((msg) => toast(msg ?? "已加入下载", { icon: "check" }))
      .catch((err) => toast(err instanceof Error ? err.message : "下载没排上", { hand: true }));
  };
  const playNext = (trackId: string): void => {
    const meta = state.queue.remote[trackId];
    dispatch({ type: "queue/add", items: [trackId], remote: meta ? { [trackId]: meta } : undefined });
    toast("已加到队尾", { icon: "check" });
  };

  const triggerEgg = (id: string): void => {
    setDemoOpen(false);
    switch (id) {
      case "E01":
        (window as unknown as { __splashReplay?: () => void }).__splashReplay?.();
        break;
      case "E02":
        input.setMineTab("liked");
        input.setPage("mine");
        break;
      case "E03":
        setPlaying(!playing);
        break;
      case "E04":
        markChorus(Math.max(1, positionMs() / 1000 + 8));
        setPlaying(true);
        break;
      case "E05":
        toggleLike(track);
        break;
      case "E06":
        next();
        break;
      case "E07":
        toggleShuffle();
        break;
      case "E08":
        openPlayer();
        break;
      case "E09":
        input.setThemePref("dark");
        setOverlay("river");
        setTimeout(() => setOverlay((o) => (o === "river" ? null : o)), 7000);
        break;
      case "E10":
        setOverlay("lyric");
        setTimeout(() => setOverlay((o) => (o === "lyric" ? null : o)), 4600);
        break;
      case "E11":
        setOverlay("live");
        Sound.crowd();
        setTimeout(() => setOverlay((o) => (o === "live" ? null : o)), 2000);
        break;
      case "E12":
        input.setPage("settings");
        break;
      case "E13":
        setCorner("bye");
        setTimeout(() => setCorner(null), 2900);
        break;
      case "E14":
        setOverlay("idle");
        break;
      case "E15":
        input.setPage("settings");
        break;
      case "E16":
        openPlayer();
        break;
      case "E17":
        /* walking mascot 已退场：E17 只保留「顺手起播」这一半 */
        setPlaying(true);
        break;
      case "E23":
        chorusFired.current = null;
        markChorus(Math.max(1, positionMs() / 1000));
        setPlaying(true);
        break;
      case "E24":
        toast(eggText(palette, "lateNight"), { hand: true, ms: 3600 });
        break;
      case "E27":
        /* 断网恢复：从墙角探个头（真实触发在 index.tsx 的 offline 恢复沿；这里也是演示面板入口） */
        setCorner("peek");
        setTimeout(() => setCorner(null), 2900);
        toast(eggText(palette, "netBack"), { hand: true });
        break;
      default:
        break;
    }
    discover(id);
  };

  /* ---------- 自动彩蛋 ---------- */
  useEffect(() => {
    const t1 = setTimeout(() => Sound.pluck(), 500);
    const t2 = setTimeout(() => {
      discover("E01", { silent: true });
    }, 1100);
    /* E24 深夜档：22 点–凌晨 2 点启动播放时的问候（2–4 点归 E09 河边） */
    const hour = new Date().getHours();
    const t3 = setTimeout(() => {
      if (hour >= 22 || hour < 2) {
        discover("E24", { silent: true });
        toast(eggText(palette, "lateNight"), { hand: true, ms: 3600 });
      }
    }, 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    if (h >= 2 && h < 4) {
      const t = setTimeout(() => {
        input.setThemePref("dark");
        setOverlay("river");
        discover("E09");
        setTimeout(() => setOverlay((o) => (o === "river" ? null : o)), 7000);
      }, 1400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    let timer = window.setTimeout(function loop() {
      if (chorusAt != null) {
        const pos = positionMs() / 1000;
        if (pos >= chorusAt - 8 && pos < chorusAt) discover("E04", { silent: true });
        /* E23 副歌现场：进场瞬间全场应援光一涨 + 各包自己的拟声；每首歌每次会话一次 */
        if (pos >= chorusAt && pos < chorusAt + 6 && chorusFired.current !== currentId) {
          chorusFired.current = currentId;
          discover("E23", { silent: true });
          const fx = CHORUS_FX[palette] ?? CHORUS_FX.default;
          onoma(fx.say, { tone: fx.tone, x: window.innerWidth * 0.5, y: window.innerHeight * 0.3 });
          document.documentElement.classList.add("chorus-live");
          setTimeout(() => document.documentElement.classList.remove("chorus-live"), 2400);
        }
      }
      timer = window.setTimeout(loop, 1000);
    }, 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, chorusAt, currentId]);

  useEffect(() => {
    if (!currentId) return;
    /* E25 又一遍 / E26 合拍：累计第 3 遍点破；同艺人连听 5 首点破（toast 各一次） */
    if ((plays[currentId] ?? 0) + 1 === 3) {
      setTimeout(() => toast(packEventCopy(palette, "repeatThree", (plays[currentId] ?? 0) + 1), { hand: true }), 800);
      discover("E25");
    }
    const artist = track?.artist ?? "";
    if (artist && artist === artistStreak.current.name) {
      artistStreak.current = { name: artist, n: artistStreak.current.n + 1 };
      if (artistStreak.current.n === 5) {
        setTimeout(() => toast(packEventCopy(palette, "sameArtist", 5), { hand: true }), 1600);
        discover("E26");
      }
    } else {
      artistStreak.current = { name: artist, n: artist ? 1 : 0 };
    }
    setPlays((p) => {
      const count = (p[currentId] ?? 0) + 1;
      if (count === 10) {
        setTimeout(() => {
          setOverlay("lyric");
          discover("E10");
          /* 写词卡会盖住整个应用（z-96 + 毛玻璃），不放着不管：4.6s 自动收，点一下也能收 */
          setTimeout(() => setOverlay((o) => (o === "lyric" ? null : o)), 4600);
        }, 700);
      }
      return { ...p, [currentId]: count };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  /* walking mascot 及其登场/随机路过调度已随角色退场一并移除（2026-11-20） */

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const reset = (): void => {
      if (overlay === "idle") setOverlay((o) => (o === "idle" ? null : o));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (!playerOpen) return;
      idleTimer.current = setTimeout(() => {
        setOverlay("idle");
        discover("E14", { silent: true });
      }, 90_000);
    };
    reset();
    const evs = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerOpen, overlay]);

  useEffect(() => {
    const fn = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && playerOpen) closePlayer();
      /* Esc 也能收掉盖住应用的氛围浮层（写词卡等） */
      if (e.key === "Escape" && overlay) setOverlay(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerOpen, overlay, reduce]);

  /* ---------- 组装 ---------- */
  const queue = state.queue.items.map((id) => toAfTrack(id));
  const queueIndex = Math.max(0, queue.findIndex((t) => t.id === currentId));

  /* E16 分幕：队列第一次超过 12 首时静默收下（原型同一条判据） */
  useEffect(() => {
    if (queue.length <= 12) return;
    const t = window.setTimeout(() => discover("E16", { silent: true }), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const api: AfApi = {
    page: input.page,
    setPage: input.setPage,
    localTab: input.localTab,
    setLocalTab: input.setLocalTab,
    mineTab: input.mineTab,
    setMineTab: input.setMineTab,
    searchOnline: input.searchOnline,
    seekOnlineSearch: input.seekOnlineSearch,
    discoverDetail: input.discoverDetail,
    openDiscoverDetail: input.openDiscoverDetail,
    clearDiscoverDetail: input.clearDiscoverDetail,
    track,
    currentId,
    resolveTrack: input.toAfTrack,
    playing,
    togglePlay,
    setPlaying,
    positionMs,
    durationMs,
    seekTo,
    queue,
    queueIndex,
    goTo,
    next,
    prev,
    userSkip,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    isLiked,
    toggleLike,
    reportDislike,
    volume: state.player.volume,
    setVolume,
    source,
    sources,
    setSource: input.setSource,
    switchSource,
    srcSwap,
    loginSrc: input.loginSrc,
    openScan,
    closeScan,
    accounts,
    loggedIn,
    profileOf: input.profileOf,
    loginFor: input.loginFor,
    logout: input.logout,
    toast,
    openExternal: input.openExternal,
    onoma,
    onomaAt,
    focus,
    eggs,
    packEggs,
    discover,
    palette,
    setPalette: switchPalette,
    packFx,
    unlocked,
    tryCode,
    themePref: input.themePref,
    setThemePref: input.setThemePref,
    resolvedTheme,
    motion: input.motionPref === "system" ? (reduce ? "off" : "full") : input.motionPref,
    motionPref: input.motionPref,
    setMotion: (m) => input.setMotionPref(m),
    reduce,
    density,
    setDensity,
    sfx,
    setSfx,
    lyricsOn,
    setLyricsOn,
    playerOpen,
    playerClosing,
    openPlayer,
    closePlayer,
    rowMenu,
    openRowMenu,
    closeRowMenu,
    demoOpen,
    setDemoOpen,
    overlay,
    setOverlay,
    corner,
    struckId,
    sheerSide,
    chorusAt,
    markChorus,
    plays,
    onLogoClick,
    triggerEgg,
    addDownload,
    playNext,
    playRemote: input.playRemote,
    history,
    clearHistory,
    archiveFilter,
    setArchiveFilter,
    playIds: input.playIds,
    myLists,
    setMyLists: (v: AfMyList[]) => setMyLists(v),
    addToMyList,
    removeFromMyList,
    openList,
    focusList,
    setFocusList,
    listEditor,
    setListEditor,
    studio,
    setStudio,
    quality,
    setQuality,
    eq,
    setEq,
    sleep,
    startSleep,
    stopSleep,
    sleepLeft,
    showTr,
    setShowTr,
    keysOpen,
    setKeysOpen,
    lyricsFull,
    setLyricsFull,
    keysHintSeen,
    dismissKeysHint,
    muted,
    toggleMute,
  };

  return { api, onomas, focusKey, boot };
}
