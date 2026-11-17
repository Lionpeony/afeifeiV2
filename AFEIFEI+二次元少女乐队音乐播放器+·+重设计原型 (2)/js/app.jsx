/* ============================================================
   AFEIFEI · 应用状态 / 彩蛋引擎
   ============================================================ */
const AppCtx = React.createContext(null);
const useApp = () => React.useContext(AppCtx);

const STORE = "afeifei.v31.";
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(STORE + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch (e) {}
}

function App() {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const params = useMemo(() => new URLSearchParams(location.search), []);

  /* ---------- 持久化偏好 ---------- */
  const [loggedIn, setLoggedIn] = useState(() => params.get("guest") === "1" || load("loggedIn", false));
  const [accounts, setAccounts] = useState(() => {
    const a = params.get("acct");
    if (a === "out") return { netease: false, qq: false };
    if (a === "in") return { netease: true, qq: true };
    return load("accounts", { netease: false, qq: false });
  });
  const [source, setSourceState] = useState(() => load("source", "netease"));
  const [savedLists, setSavedLists] = useState(() => load("savedLists", []));
  const [scanState, setScanState] = useState("idle");
  const [srcSwap, setSrcSwap] = useState(() => {
    const sp = params.get("swap");
    return sp ? { id: sp, phase: params.get("swapphase") || "hold" } : null;
  });
  const [loginSrc, setLoginSrc] = useState(() => params.get("scan") || null);
  const [downloads, setDownloads] = useState(() => DOWNLOADS);
  const [miniMode, setMiniMode] = useState(() => params.get("mini") === "1");
  const [lyricsBar, setLyricsBar] = useState(() => params.get("lyrics") === "1" || load("lyricsBar", false));
  const [rowMenu, setRowMenu] = useState(() => {
    const m = params.get("menu");
    return m ? { trackId: m, x: Math.max(12, window.innerWidth / 2 - 300), y: 220 } : null;
  });
  const [themePref, setThemePref] = useState(() => params.get("theme") || load("theme", "light"));
  const [palette, setPalette] = useState(() => load("palette", "default"));
  const [unlocked, setUnlocked] = useState(() => load("unlocked", ["default"]));
  const [eggs, setEggs] = useState(() => load("eggs", []));
  const [liked, setLiked] = useState(() => load("liked", []));
  const [chorus, setChorus] = useState(() => load("chorus", {}));
  const [plays, setPlays] = useState(() => load("plays", {}));
  const [volume, setVolume] = useState(() => load("volume", 0.7));
  const [sfx, setSfx] = useState(() => load("sfx", true));
  const [motion, setMotion] = useState(() => load("motion", "full"));
  const [density, setDensity] = useState(() => params.get("density") || load("density", "cozy"));

  /* ---------- v4.3 用户资产 / 历史 / 调音台 / 悬浮控制 ---------- */
  const [myLists, setMyLists] = useState(() => load("myLists", []));
  const [history, setHistory] = useState(() => load("history", []));
  const [quality, setQuality] = useState(() => params.get("quality") || load("quality", "hq"));
  const [eq, setEq] = useState(() => load("eq", { preset: "flat", bands: [0, 0, 0, 0, 0] }));
  const [sleep, setSleep] = useState({ mode: "off", until: null, minutes: 30 });
  const [sleepLeft, setSleepLeft] = useState(0);
  const [studio, setStudio] = useState(() => (params.get("studio") ? { tab: params.get("studio") } : null));
  const [showTr, setShowTr] = useState(() => params.get("tr") === "1" || load("showTr", true));
  const [dock, setDock] = useState(() => params.get("dock") === "1");
  const [dockPin, setDockPin] = useState(() => params.get("dock") === "1");
  const [keysOpen, setKeysOpen] = useState(() => params.get("keys") === "1");
  const [lyricsFull, setLyricsFull] = useState(() => params.get("lyricsfull") === "1");
  const [keysHintSeen, setKeysHintSeen] = useState(() => load("keysHintSeen", false));
  const [listEditor, setListEditor] = useState(() =>
    params.get("newlist") === "1" ? { mode: "new", tracks: [] } : null);
  const [focusList, setFocusList] = useState(null);
  const [muted, setMuted] = useState(false);
  const dockPinRef = useRef(false);
  const dockTimer = useRef(null);
  const lastVol = useRef(0.7);
  const sleepModeRef = useRef("off");
  useEffect(() => { dockPinRef.current = dockPin; }, [dockPin]);
  useEffect(() => { sleepModeRef.current = sleep.mode; }, [sleep.mode]);
  const [systemReduce, setSystemReduce] = useState(() =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const effectiveMotion = systemReduce ? "off" : motion;
  const reduce = effectiveMotion === "off";

  /* ---------- 播放 ---------- */
  const [queueIds, setQueueIds] = useState(() => TRACKS.slice(0, 12).map(t => t.id));
  const [currentId, setCurrentId] = useState("t1");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(() => Number(params.get("pos")) || 0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off");
  const [playerOpen, setPlayerOpen] = useState(() => params.get("player") === "1");
  const [playerClosing, setPlayerClosing] = useState(false);
  const [struckId, setStruckId] = useState(null);
  const [sheerSide, setSheerSide] = useState(null);
  const [lyricsOn, setLyricsOn] = useState(() => params.get("lyrics") !== "0" && load("lyrics", true));

  /* ---------- 二次元表现层 ---------- */
  const [onomas, setOnomas] = useState([]);
  const [focusKey, setFocusKey] = useState(0);
  const [mascot, setMascot] = useState(() => params.get("mascot") === "1");

  /* ---------- 界面 ---------- */
  const [page, setPage] = useState(() => params.get("p") || "discover");
  const [toasts, setToasts] = useState([]);
  const [overlay, setOverlay] = useState(null);
  const [corner, setCorner] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [codeFocus, setCodeFocus] = useState(false);

  const track = TRACK_MAP[currentId] || TRACKS[0];
  const chorusAt = chorus[currentId];

  /* ---------- 声音 ---------- */
  useEffect(() => { if (window.Sound) Sound.setEnabled(sfx && effectiveMotion !== "off"); }, [sfx, effectiveMotion]);

  /* 系统减弱动效联动 */
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = e => setSystemReduce(e.matches);
    mq.addEventListener ? mq.addEventListener("change", fn) : mq.addListener(fn);
    return () => mq.removeEventListener ? mq.removeEventListener("change", fn) : mq.removeListener(fn);
  }, []);

  /* 页面不可见时暂停循环动画 */
  useEffect(() => {
    const fn = () => { document.documentElement.dataset.hidden = document.hidden ? "1" : "0"; };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);

  /* ---------- 主题 ---------- */
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = e => setSystemDark(e.matches);
    mq.addEventListener ? mq.addEventListener("change", fn) : mq.addListener(fn);
    return () => mq.removeEventListener ? mq.removeEventListener("change", fn) : mq.removeListener(fn);
  }, []);
  const resolvedTheme = themePref === "system" ? (systemDark ? "dark" : "light") : themePref;
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = resolvedTheme;
    el.dataset.palette = palette;
    el.dataset.motion = effectiveMotion;
    el.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, palette, effectiveMotion]);

  /* 主题切换：2s 交叉淡化 + 短促 bloom */
  const firstTheme = useRef(true);
  const [bloomKey, setBloomKey] = useState(0);
  useEffect(() => {
    if (firstTheme.current) { firstTheme.current = false; return; }
    const el = document.documentElement;
    el.classList.add("theme-fade");
    setBloomKey(k => k + 1);
    const t = setTimeout(() => el.classList.remove("theme-fade"), 2200);
    return () => clearTimeout(t);
  }, [resolvedTheme]);

  /* 拟声词：跟随音效与动效档位 */
  const onoma = useCallback((text, opts = {}) => {
    if (!sfx || effectiveMotion === "off") return;
    const id = "o" + Math.random().toString(36).slice(2);
    setOnomas(l => [...l.slice(-2), {
      id, text,
      tone: opts.tone || "coral",
      x: opts.x != null ? opts.x : window.innerWidth / 2,
      y: opts.y != null ? opts.y : window.innerHeight / 2,
      rot: (Math.random() * 12 - 6).toFixed(1)
    }]);
    setTimeout(() => setOnomas(l => l.filter(o => o.id !== id)), 820);
  }, [sfx, effectiveMotion]);

  const onomaAt = useCallback((el, text, tone) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    onoma(text, { tone, x: r.left + r.width / 2, y: r.top - 16 });
  }, [onoma]);

  /* 集中线 */
  const focus = useCallback(() => {
    if (effectiveMotion === "off") return;
    setFocusKey(k => k + 1);
  }, [effectiveMotion]);
  useEffect(() => {
    if (!focusKey) return;
    const t = setTimeout(() => setFocusKey(0), 640);
    return () => clearTimeout(t);
  }, [focusKey]);

  /* ---------- 写入本地 ---------- */
  useEffect(() => { save("theme", themePref); }, [themePref]);
  useEffect(() => { save("loggedIn", loggedIn); }, [loggedIn]);
  useEffect(() => { save("accounts", accounts); }, [accounts]);
  useEffect(() => { save("source", source); }, [source]);
  useEffect(() => { save("savedLists", savedLists); }, [savedLists]);
  useEffect(() => { save("lyricsBar", lyricsBar); }, [lyricsBar]);
  useEffect(() => { save("palette", palette); }, [palette]);
  useEffect(() => { save("unlocked", unlocked); }, [unlocked]);
  useEffect(() => { save("eggs", eggs); }, [eggs]);
  useEffect(() => { save("liked", liked); }, [liked]);
  useEffect(() => { save("chorus", chorus); }, [chorus]);
  useEffect(() => { save("plays", plays); }, [plays]);
  useEffect(() => { save("volume", volume); }, [volume]);
  useEffect(() => { save("sfx", sfx); }, [sfx]);
  useEffect(() => { save("motion", motion); }, [motion]);
  useEffect(() => { save("density", density); }, [density]);
  useEffect(() => { save("lyrics", lyricsOn); }, [lyricsOn]);
  useEffect(() => { save("myLists", myLists); }, [myLists]);
  useEffect(() => { save("history", history); }, [history]);
  useEffect(() => { save("quality", quality); }, [quality]);
  useEffect(() => { save("eq", eq); }, [eq]);
  useEffect(() => { save("showTr", showTr); }, [showTr]);
  useEffect(() => { save("keysHintSeen", keysHintSeen); }, [keysHintSeen]);

  /* ---------- toast ---------- */
  const toast = useCallback((text, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(list => [...list.slice(-2), { id, text, icon: opts.icon, hand: opts.hand, action: opts.action }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), opts.ms || 2700);
  }, []);

  /* ---------- 彩蛋发现 ---------- */
  const discovered = useRef(new Set(eggs));
  const discover = useCallback((id, opts = {}) => {
    if (discovered.current.has(id)) return;
    discovered.current.add(id);
    const next = Array.from(discovered.current);
    setEggs(next);
    if (!opts.silent) {
      if (window.Sound) Sound.ding();
      toast(`拾到一枚拨片 · ${next.length}/17`, { icon: "pick" });
    }
  }, [toast]);

  /* 下载进度：原型内缓慢推进，到 92% 停住，表示“还在下” */
  useEffect(() => {
    const timer = setInterval(() => {
      setDownloads(list => list.map(d =>
        d.state === "downloading" && d.pct < 92 ? { ...d, pct: d.pct + 1 } : d
      ));
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  /* ---------- 登录 / 音源 ---------- */
  const linkAccount = useCallback((id) => {
    if (accounts[id]) return;
    setAccounts(a => ({ ...a, [id]: true }));
    if (window.Sound) Sound.ding();
    toast(`${SOURCES[id].name} 登记成功（模拟登录）`, { hand: true });
  }, [accounts, toast]);

  const unlinkAccount = useCallback((id) => {
    setAccounts(a => ({ ...a, [id]: false }));
    toast(`${SOURCES[id].name} 已退出（模拟）`, { hand: true });
  }, [toast]);

  const enterApp = useCallback(() => {
    setLoggedIn(true);
    setPage("discover");
    focus();
    if (window.Sound) Sound.paper();
    setTimeout(() => toast("幕布拉开了，今晚的自助。", { hand: true, ms: 2600 }), 500);
  }, [focus, toast]);

  const skipLogin = useCallback(() => {
    setLoggedIn(true);
    setPage("discover");
    toast("没登录也能逛，只是没有歌单数据。", { hand: true });
  }, [toast]);

  const logout = useCallback(() => {
    setLoggedIn(false);
    setAccounts({ netease: false, qq: false });
    setPlayerOpen(false);
  }, []);

  const setSource = useCallback((id) => setSourceState(id), []);

  /* 换音源：幕间动效，幕布合上时才真正切换 */
  const swapTimers = useRef([]);
  const switchSource = useCallback((id, opts = {}) => {
    if (id === source) { toast("已经在这边的台上了。", { hand: true }); return; }
    const quiet = !!opts.quiet;
    if (motion === "off" || systemReduce) {
      setSourceState(id);
      if (!quiet) toast(`换到 ${SOURCES[id].name} 了`, { hand: true });
      return;
    }
    swapTimers.current.forEach(clearTimeout);
    swapTimers.current = [];

    /* 顶栏/歌单页的小胶囊：局部幕帘，320ms 内完成 */
    if (opts.scope === "pill") {
      setSrcSwap({ id, phase: "close", scope: "pill" });
      swapTimers.current.push(setTimeout(() => {
        setSourceState(id);
        setSrcSwap({ id, phase: "open", scope: "pill" });
        if (window.Sound) Sound.paper();
      }, 170));
      swapTimers.current.push(setTimeout(() => setSrcSwap(null), 400));
      return;
    }

    setSrcSwap({ id, phase: "close" });
    onoma("ザッ…", { tone: "mint", x: window.innerWidth / 2, y: window.innerHeight * 0.34 });
    swapTimers.current.push(setTimeout(() => {
      setSourceState(id);
      setSrcSwap({ id, phase: "hold" });
      if (window.Sound) Sound.paper();
    }, 390));
    swapTimers.current.push(setTimeout(() => setSrcSwap({ id, phase: "open" }), 900));
    swapTimers.current.push(setTimeout(() => {
      setSrcSwap(null);
      toast(`幕拉开了，现在放的是 ${SOURCES[id].name}`, { hand: true });
    }, 1320));
  }, [source, motion, systemReduce, onoma, toast]);

  const openScan = useCallback((id) => setLoginSrc(id), []);
  const closeScan = useCallback(() => setLoginSrc(null), []);
  useEffect(() => () => swapTimers.current.forEach(clearTimeout), []);
  const saveList = useCallback((key, name) => {
    setSavedLists(l => {
      if (l.includes(key)) return l;
      toast(`「${name}」收藏到我的歌单了`, { icon: "check" });
      return [...l, key];
    });
  }, [toast]);

  const startScan = useCallback(() => {
    if (scanState === "scanning") return;
    setScanState("scanning");
    onoma("ザッ…", { tone: "mint", x: window.innerWidth * 0.5, y: window.innerHeight * 0.35 });
    setTimeout(() => {
      setScanState("done");
      if (window.Sound) Sound.ding();
      toast(`扫到 ${LOCAL_TRACKS.length} 个音频文件`, { icon: "check" });
    }, 2300);
  }, [scanState, onoma, toast]);

  /* ---------- 切歌 ---------- */
  const changeCount = useRef(0);
  const lastCopyAt = useRef(-99);
  const skipStamps = useRef([]);
  const lyricDone = useRef(new Set());

  const goTo = useCallback((id, opts = {}) => {
    const prevId = currentId;
    if (prevId === id && !opts.force) {
      setPos(0); setPlaying(true);
      return;
    }
    setCurrentId(id);
    setPos(0);
    setPlaying(true);
    changeCount.current += 1;
    setStruckId(prevId);
    setTimeout(() => setStruckId(null), 1400);
    if (!opts.silent) {
      onoma("シュッ", { tone: "yellow", x: window.innerWidth * 0.46, y: window.innerHeight * 0.52 });
      setSheerSide(opts.dir === "prev" ? "l" : "r");
      setTimeout(() => setSheerSide(null), 400);
      if (window.Sound) Sound.paper();
    }
    const count = (plays[id] || 0) + 1;
    setPlays(p => ({ ...p, [id]: count }));
    setHistory(h => [{ id, at: Date.now() }, ...h.filter(x => x.id !== id)].slice(0, 120));

    /* E10 同一首 10 遍 */
    if (count === 10 && !lyricDone.current.has(id)) {
      lyricDone.current.add(id);
      setTimeout(() => { setOverlay("lyric"); discover("E10"); }, 700);
    }
  }, [currentId, plays, discover, onoma]);

  const nextTrack = useCallback((opts = {}) => {
    if (shuffle) {
      const pool = queueIds.filter(id => id !== currentId);
      goTo(pool[Math.floor(Math.random() * pool.length)] || currentId, opts);
      return;
    }
    const i = queueIds.indexOf(currentId);
    const nextId = queueIds[(i + 1) % queueIds.length];
    goTo(nextId, opts);
  }, [shuffle, queueIds, currentId, goTo]);

  const prevTrack = useCallback(() => {
    if (pos > 4) { setPos(0); return; }
    const i = queueIds.indexOf(currentId);
    const prevId = queueIds[(i - 1 + queueIds.length) % queueIds.length];
    goTo(prevId, { dir: "prev" });
  }, [pos, queueIds, currentId, goTo]);

  const playAll = useCallback((ids) => {
    if (!ids || !ids.length) return;
    setQueueIds(ids);
    goTo(ids[0], { force: true });
  }, [goTo]);

  const playAt = useCallback((ids, i) => {
    if (!ids || !ids.length) return;
    setQueueIds(ids);
    goTo(ids[i] || ids[0], { force: true });
  }, [goTo]);

  /* ---------- v4.1 缺口补齐 ---------- */
  const addDownload = useCallback((trackId) => {
    const t = TRACK_MAP[trackId];
    if (!t) return;
    setDownloads(list => {
      if (list.some(d => d.title === t.title && d.state === "downloading")) {
        toast("这首已经在下载队列里了", { hand: true });
        return list;
      }
      return [{ id: "d" + Date.now(), title: t.title, artist: t.artist, source, pct: 4, state: "downloading", size: "7.8 MB" }, ...list];
    });
  }, [source, toast]);

  const playNext = useCallback((trackId) => {
    setQueueIds(q => {
      const base = q.length ? q.slice() : [currentId];
      const at = base.indexOf(currentId);
      base.splice(at < 0 ? 0 : at + 1, 0, trackId);
      return Array.from(new Set(base));
    });
    toast("下一首就是它了", { icon: "check" });
  }, [currentId, toast]);

  const crossPlay = useCallback((trackId, srcId) => {
    setSourceState(srcId);
    setQueueIds(q => q.includes(trackId) ? q : [...q, trackId]);
    goTo(trackId, { force: true });
    toast(`已切到 ${SOURCES[srcId].name} 播放`, { hand: true });
  }, [goTo, toast]);

  const tryPlay = useCallback((trackId, ids, index) => {
    const t = TRACK_MAP[trackId];
    if (!t) return;
    const av = (t.avail && t.avail[source]) || "ok";
    if (av === "ok") {
      if (ids) playAt(ids, index || 0);
      else goTo(trackId, { force: true });
      return;
    }
    const other = source === "netease" ? "qq" : "netease";
    const otherOk = t.avail && t.avail[other] === "ok";
    if (otherOk && accounts[other]) {
      toast(`${SOURCES[source].short}没有这首，但${SOURCES[other].short}有`, {
        hand: true, ms: 6000,
        action: { label: "切换并播放", onClick: () => crossPlay(trackId, other) }
      });
      return;
    }
    if (otherOk) {
      toast(`${SOURCES[other].name}有这首，先登记那个账号才能播`, { hand: true, ms: 4200 });
      return;
    }
    toast("这首哪儿都没有，换一首吧", { hand: true });
  }, [source, accounts, playAt, goTo, toast, crossPlay]);

  const openRowMenu = useCallback((trackId, rect) => {
    const w = 212, h = 306;
    let x = rect.right - w;
    let y = rect.bottom + 8;
    if (y + h > window.innerHeight - 16) y = Math.max(12, rect.top - h - 8);
    setRowMenu({ trackId, x: Math.max(12, x), y });
  }, []);
  const closeRowMenu = useCallback(() => setRowMenu(null), []);

  /* 用户主动切歌 → E13 */
  const userSkip = useCallback((kind) => {
    const now = Date.now();
    skipStamps.current = skipStamps.current.filter(t => now - t < 60000);
    skipStamps.current.push(now);
    if (skipStamps.current.length >= 5) {
      skipStamps.current = [];
      setCorner(true);
      setTimeout(() => setCorner(false), 2900);
      discover("E13");
      onoma("タッタッ…", { tone: "mint", x: window.innerWidth - 150, y: window.innerHeight - 150 });
    }
    changeCount.current += 1;
    /* E06 文案，5 首冷却 */
    if (changeCount.current - lastCopyAt.current >= 5) {
      lastCopyAt.current = changeCount.current;
      setTimeout(() => toast("还在找今晚的那首歌？♡", { hand: true }), 500);
    }
    kind === "prev" ? prevTrack() : nextTrack({ dir: "next" });
  }, [discover, nextTrack, prevTrack, toast, onoma]);

  /* ---------- 播放推进 ---------- */
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setPos(p => {
        if (p + 0.25 >= track.dur) {
          if (sleepModeRef.current === "song") return track.dur;
          if (repeat === "one") return 0;
          setTimeout(() => nextTrack({ silent: false }), 0);
          return track.dur;
        }
        return p + 0.25;
      });
    }, 250);
    return () => clearInterval(t);
  }, [playing, track.dur, repeat, nextTrack]);

  useEffect(() => {
    setPlays(p => {
      if ((p[currentId] || 0) > 0) return p;
      return { ...p, [currentId]: 1 };
    });
  }, [currentId]);

  /* ---------- E04 副歌前提示 ---------- */
  const chorusShown = useRef({});
  useEffect(() => {
    if (chorusAt == null) return;
    const inWindow = pos >= chorusAt - 8 && pos < chorusAt;
    if (inWindow && !chorusShown.current[currentId]) {
      chorusShown.current[currentId] = true;
      discover("E04", { silent: true });
    }
  }, [pos, chorusAt, currentId, discover]);

  const markChorus = useCallback((sec) => {
    setChorus(c => ({ ...c, [currentId]: sec }));
    chorusShown.current[currentId] = false;
    if (window.Sound) Sound.ding();
    toast("副歌点记在这儿了", { icon: "check" });
  }, [currentId, toast]);

  /* ---------- 收藏 E05 ---------- */
  const toggleLike = useCallback((id) => {
    const isLiked = liked.includes(id);
    setLiked(l => isLiked ? l.filter(x => x !== id) : [...l, id]);
    if (!isLiked) {
      discover("E05");
      if (window.Sound) Sound.tap();
    }
    return !isLiked;
  }, [liked, discover]);

  /* ---------- 随机 E07 ---------- */
  const toggleShuffle = useCallback(() => {
    setShuffle(s => {
      if (!s) { discover("E07"); if (window.Sound) Sound.tap(); }
      return !s;
    });
  }, [discover]);

  /* ---------- 打开播放页 E08 ---------- */
  const closePlayer = useCallback(() => {
    if (effectiveMotion === "off") { setPlayerOpen(false); return; }
    setPlayerClosing(true);
    setTimeout(() => { setPlayerOpen(false); setPlayerClosing(false); }, 400);
  }, [effectiveMotion]);

  const openPlayer = useCallback(() => {
    setPlayerOpen(true);
    focus();
    onoma("ザッ…", { tone: "coral", x: window.innerWidth / 2, y: window.innerHeight * 0.42 });
    discover("E08", { silent: true });
    if (window.Sound) Sound.paper();
    if (queueIds.length > 12) setTimeout(() => discover("E16", { silent: true }), 900);
  }, [discover, queueIds.length, focus, onoma]);

  /* ---------- E11 连点 logo ---------- */
  const logoClicks = useRef([]);
  const onLogoClick = useCallback(() => {
    const now = Date.now();
    logoClicks.current = logoClicks.current.filter(t => now - t < 2200);
    logoClicks.current.push(now);
    if (logoClicks.current.length >= 5) {
      logoClicks.current = [];
      if (discovered.current.has("E11")) return;
      setOverlay("live");
      focus();
      if (window.Sound) Sound.crowd();
      setTimeout(() => setOverlay(o => o === "live" ? null : o), 1800);
      discover("E11", { silent: true });
      setTimeout(() => toast("今晚加演一首。", { hand: true }), 700);
    }
  }, [discover, toast, focus]);

  /* ---------- E12 暗号 ---------- */
  const tryCode = useCallback((raw) => {
    const code = (raw || "").trim();
    const hit = SECRET_CODES[code];
    if (!hit) return false;
    if (window.Sound) Sound.unlock();
    setPalette(hit.palette);
    setUnlocked(u => u.includes(hit.palette) ? u : [...u, hit.palette]);
    discover("E12");
    focus();
    toast("这是今晚的秘密 setlist。♡", { hand: true, ms: 3400 });
    return true;
  }, [discover, toast, focus]);

  /* ---------- E17 抱琴小剪影路过 ---------- */
  const mascotSeen = useRef([]);
  useEffect(() => {
    if (!playing || mascot) return;
    if (mascotSeen.current.length >= 2) return;
    const last = mascotSeen.current[mascotSeen.current.length - 1] || 0;
    const wait = last
      ? Math.max(9000, 30 * 60 * 1000 - (Date.now() - last))
      : 26000 + Math.random() * 24000;
    const t = setTimeout(() => {
      mascotSeen.current.push(Date.now());
      setMascot(true);
      discover("E17");
    }, wait);
    return () => clearTimeout(t);
  }, [playing, mascot, discover]);

  /* ---------- E09 凌晨河边 ---------- */
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    if (h >= 2 && h < 4) {
      const t = setTimeout(() => {
        setThemePref("dark");
        setOverlay("river");
        discover("E09");
        setTimeout(() => setOverlay(o => o === "river" ? null : o), 7000);
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [discover]);

  /* ---------- E14 待机 ---------- */
  const idleTimer = useRef(null);
  const resetIdle = useCallback(() => {
    if (overlay === "idle") setOverlay(o => o === "idle" ? null : o);
    clearTimeout(idleTimer.current);
    if (!playerOpen) return;
    idleTimer.current = setTimeout(() => {
      setOverlay("idle");
      discover("E14", { silent: true });
    }, 90000);
  }, [playerOpen, overlay, discover]);
  useEffect(() => {
    resetIdle();
    const evs = ["pointermove", "pointerdown", "keydown", "wheel"];
    evs.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));
    return () => { clearTimeout(idleTimer.current); evs.forEach(e => window.removeEventListener(e, resetIdle)); };
  }, [resetIdle]);

  /* ---------- Esc 收起播放页 ---------- */
  useEffect(() => {
    const fn = e => { if (e.key === "Escape" && playerOpen) closePlayer(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [playerOpen, closePlayer]);

  /* ---------- E01 启动（首屏由 index.html 的静态层承担） ---------- */
  useEffect(() => {
    if (window.__bootDone) window.__bootDone();
    const t1 = setTimeout(() => { if (window.Sound) Sound.pluck(); }, 780);
    const t2 = setTimeout(() => {
      discover("E01", { silent: true });
      toast("今晚的 setlist 还空着两行。", { hand: true, ms: 3200 });
    }, 1650);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [discover, toast]);

  /* ---------- 演示触发 ---------- */
  const triggerEgg = useCallback((id) => {
    setDemoOpen(false);
    switch (id) {
      case "E01":
        if (window.__splashReplay) window.__splashReplay();
        setTimeout(() => { if (window.Sound) Sound.pluck(); }, 780);
        break;
      case "E02":
        setArchiveFilter("liked");
        setPage("archive");
        break;
      case "E03":
        setPlaying(p => !p);
        break;
      case "E04": {
        const target = Math.min(track.dur - 12, pos + 14);
        setChorus(c => ({ ...c, [currentId]: target }));
        chorusShown.current[currentId] = false;
        setPlaying(true);
        setPos(Math.max(0, target - 7.6));
        break;
      }
      case "E05":
        toggleLike(currentId);
        break;
      case "E06":
        nextTrack({ dir: "next" });
        break;
      case "E07":
        toggleShuffle();
        break;
      case "E08":
        openPlayer();
        break;
      case "E09":
        setThemePref("dark");
        setOverlay("river");
        discover("E09");
        setTimeout(() => setOverlay(o => o === "river" ? null : o), 7000);
        break;
      case "E10":
        setOverlay("lyric");
        discover("E10");
        break;
      case "E11":
        setOverlay("live");
        if (window.Sound) Sound.crowd();
        discover("E11", { silent: true });
        setTimeout(() => setOverlay(o => o === "live" ? null : o), 2000);
        break;
      case "E12":
        setPage("settings");
        setCodeFocus(true);
        discover("E12", { silent: true });
        break;
      case "E13":
        setCorner(true);
        discover("E13");
        setTimeout(() => setCorner(false), 2900);
        break;
      case "E14":
        setOverlay("idle");
        discover("E14");
        break;
      case "E15":
        setPage("settings");
        discover("E15");
        break;
      case "E16":
        setQueueIds(TRACKS.map(t => t.id));
        openPlayer();
        setTimeout(() => discover("E16"), 900);
        break;
      case "E17":
        setPlaying(true);
        setMascot(true);
        discover("E17");
        break;
    }
  }, [pos, track.dur, currentId, nextTrack, toggleShuffle, toggleLike, openPlayer, discover]);

  /* ---------- v4.3 定时 / 音质 / 均衡 / 悬浮控制 ---------- */
  const flashDock = useCallback(() => {
    if (!dock) onoma("ピッ", { tone: "mint", x: window.innerWidth - 190, y: window.innerHeight - 260 });
    setDock(true);
    clearTimeout(dockTimer.current);
    dockTimer.current = setTimeout(() => {
      if (!dockPinRef.current) setDock(false);
    }, 3200);
  }, [dock, onoma]);

  const toggleMute = useCallback(() => {
    setVolume(v => {
      if (v > 0) { lastVol.current = v; setMuted(true); return 0; }
      setMuted(false);
      return lastVol.current || 0.7;
    });
  }, []);

  const startSleep = useCallback((arg) => {
    if (arg === "song") {
      setSleep({ mode: "song", until: null, minutes: sleep.minutes || 30 });
      setSleepLeft(0);
      toast("播完这首就关灯", { hand: true });
      return;
    }
    const minutes = Number(arg) || 30;
    setSleep({ mode: "timer", until: Date.now() + minutes * 60000, minutes });
    setSleepLeft(minutes * 60);
    toast(`定时 ${minutes} 分钟，到点我把灯关掉`, { icon: "check" });
  }, [sleep.minutes, toast]);

  const stopSleep = useCallback(() => {
    setSleep({ mode: "off", until: null, minutes: sleep.minutes || 30 });
    setSleepLeft(0);
    toast("定时取消了", { hand: true });
  }, [sleep.minutes, toast]);

  useEffect(() => {
    if (sleep.mode !== "timer" || !sleep.until) return;
    const tick = () => {
      const left = Math.round((sleep.until - Date.now()) / 1000);
      if (left <= 0) {
        setSleep({ mode: "off", until: null, minutes: sleep.minutes });
        setSleepLeft(0);
        setPlaying(false);
        toast("定时到了 · 灯关掉了", { hand: true, ms: 3400 });
        if (window.Sound) Sound.paper();
        return;
      }
      setSleepLeft(left);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [sleep.mode, sleep.until, sleep.minutes, setPlaying, toast]);

  /* 播完这首就关灯 */
  useEffect(() => {
    if (sleep.mode !== "song" || !playing) return;
    if (pos >= track.dur - 0.4) {
      setPlaying(false);
      setSleep({ mode: "off", until: null, minutes: sleep.minutes || 30 });
      toast("唱完了 · 关灯", { hand: true });
    }
  }, [pos, sleep.mode, sleep.minutes, playing, track.dur, setPlaying, toast]);

  /* 系统媒体键（MediaSession） */
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const wrap = fn => (...args) => { fn(...args); flashDock(); };
    try {
      if (window.MediaMetadata) {
        ms.metadata = new window.MediaMetadata({
          title: track.title, artist: track.artist, album: track.album
        });
      }
      ms.setActionHandler("play", wrap(() => setPlaying(true)));
      ms.setActionHandler("pause", wrap(() => setPlaying(false)));
      ms.setActionHandler("previoustrack", wrap(() => prevTrack()));
      ms.setActionHandler("nexttrack", wrap(() => nextTrack({ dir: "next" })));
      ms.setActionHandler("seekbackward", wrap(() => setPos(p => Math.max(0, p - 10))));
      ms.setActionHandler("seekforward", wrap(() => setPos(p => Math.min(track.dur, p + 10))));
      ms.setActionHandler("stop", wrap(() => setPlaying(false)));
      ms.playbackState = playing ? "playing" : "paused";
    } catch (err) { /* 原型环境不支持时静默 */ }
  }, [track.id, track.title, track.artist, track.album, track.dur, playing, setPlaying, nextTrack, prevTrack, flashDock]);

  /* ---------- 我的歌单 ---------- */
  const openList = useCallback((id) => {
    setFocusList(id);
    setPage("playlists");
  }, []);

  const addToMyList = useCallback((listId, trackId) => {
    setMyLists(list => list.map(l => l.id === listId
      ? (l.tracks.includes(trackId) ? l : { ...l, tracks: [...l.tracks, trackId], updatedAt: Date.now() })
      : l));
  }, []);

  const removeFromMyList = useCallback((listId, trackId) => {
    setMyLists(list => list.map(l => l.id === listId
      ? { ...l, tracks: l.tracks.filter(t => t !== trackId), updatedAt: Date.now() }
      : l));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  const ctx = {
    React, page, setPage, track, currentId, playing, setPlaying, pos, setPos,
    queueIds, setQueueIds, shuffle, repeat, setRepeat, toggleShuffle,
    goTo, nextTrack, prevTrack, userSkip, toggleLike, liked, chorus, markChorus, chorusAt,
    volume, setVolume, sfx, setSfx, reduce, motion, setMotion, effectiveMotion, systemReduce,
    themePref, setThemePref, resolvedTheme, palette, setPalette, unlocked, setUnlocked,
    density, setDensity,
    eggs, discover, playerOpen, setPlayerOpen, openPlayer, closePlayer, playerClosing,
    toast, struckId, sheerSide, overlay, setOverlay, corner, onLogoClick,
    archiveFilter, setArchiveFilter, searchOpen, setSearchOpen, tryCode,
    codeFocus, setCodeFocus, demoOpen, setDemoOpen, triggerEgg, plays,
    onoma, onomaAt, focus, lyricsOn, setLyricsOn, mascot, setMascot,
    loggedIn, accounts, linkAccount, unlinkAccount, enterApp, skipLogin, logout,
    source, setSource, switchSource, srcSwap, savedLists, saveList,
    loginSrc, openScan, closeScan, playAll, playAt, scanState, startScan, downloads,
    miniMode, setMiniMode, lyricsBar, setLyricsBar, rowMenu, openRowMenu, closeRowMenu,
    addDownload, playNext, crossPlay, tryPlay,
    myLists, setMyLists, addToMyList, removeFromMyList, openList, focusList,
    history, setHistory, clearHistory,
    quality, setQuality, eq, setEq, sleep, startSleep, stopSleep, sleepLeft,
    studio, setStudio, showTr, setShowTr,
    dock, setDock, dockPin, setDockPin, flashDock, keysOpen, setKeysOpen,
    listEditor, setListEditor, muted, toggleMute,
    lyricsFull, setLyricsFull, keysHintSeen,
    dismissKeysHint: () => setKeysHintSeen(true)
  };

  return (
    <AppCtx.Provider value={ctx}>
      {!loggedIn ? <Auth /> : miniMode ? <MiniCard /> : (
        <div className={"app" + (density === "compact" ? " is-compact" : "")}>
          <Sidebar />
          <div className="main">
            <TopBar />
            <div className="main__page scroll" key={page}>
              {page === "discover" && <Discover />}
              {page === "wander" && <Wander />}
              {page === "local" && <LocalFiles mode="local" />}
              {page === "downloads" && <LocalFiles mode="downloads" />}
              {page === "likes" && <Likes />}
              {page === "playlists" && <Playlists />}
              {page === "history" && <History />}
              {page === "archive" && <Archive />}
              {page === "settings" && <Settings />}
            </div>
            <MiniPlayer />
          </div>
        </div>
      )}
      {playerOpen && loggedIn && !miniMode && <NowPlaying />}
      {loggedIn && !miniMode && <RowMenu />}
      {loggedIn && !miniMode && lyricsBar && !playerOpen && <LyricsBar />}
      {loggedIn && !miniMode && <StudioDrawer />}
      {loggedIn && !miniMode && <ListEditor />}
      {loggedIn && !miniMode && <MediaDock />}
      {loggedIn && !miniMode && <KeysSheet />}
      <ScanLogin />
      {loggedIn && !miniMode && <Hotkeys />}
      <EggLayer />
      <PerfHUD />
      <Toasts items={toasts} />
      {bloomKey > 0 && <span key={bloomKey} className="bloom" aria-hidden="true" />}
      {focusKey > 0 && <FocusLines key={focusKey} />}
      <OnomaLayer items={onomas} />
      {mascot && <MascotWalk onEnd={() => setMascot(false)} />}
      {demoOpen && <DemoPanel />}
    </AppCtx.Provider>
  );
}

Object.assign(window, { AppCtx, useApp, App });

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
