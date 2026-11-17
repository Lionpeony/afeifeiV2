/* ---------- 键盘快捷键 / 媒体键悬浮控制 / 快捷键面板 ---------- */

const SHORTCUT_GROUPS = [
  {
    title: "播放",
    rows: [["空格", "播放 / 暂停"], ["← →", "后退 / 前进 5 秒"], ["Shift + ← →", "上一首 / 下一首"], ["↑ ↓", "音量 ±5%"], ["M", "静音"], ["L", "喜欢这首歌"]]
  },
  {
    title: "界面",
    rows: [["P", "展开 / 收起播放页"], ["/", "聚焦搜索"], ["H", "播放历史"], ["G", "歌单"], ["D", "发现"], ["Esc", "关闭浮层"]]
  },
  {
    title: "台侧",
    rows: [["T", "定时关闭"], ["Q", "音质"], ["E", "均衡器"], ["K", "媒体键悬浮控制"], ["?", "这份清单"]]
  }
];

/* 全局键盘：媒体键以外的所有操作 */
function Hotkeys() {
  const app = useApp();
  const ref = React.useRef(app);
  ref.current = app;

  React.useEffect(() => {
    const typing = el => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" || el.isContentEditable);

    const onKey = e => {
      const a = ref.current;
      const active = document.activeElement;
      if (e.key === "Escape") {
        if (typing(active)) { active.blur(); return; }
        if (a.keysOpen) { a.setKeysOpen(false); return; }
        if (a.loginSrc) { a.closeScan(); return; }
        if (a.lyricsFull) { a.setLyricsFull(false); return; }
        if (a.listEditor) { a.setListEditor(null); return; }
        if (a.studio) { a.setStudio(null); return; }
        if (a.searchOpen) { a.setSearchOpen(false); return; }
        if (a.playerOpen) { a.closePlayer(); return; }
        if (a.dock) { a.setDock(false); return; }
        return;
      }
      if (typing(active)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };

      if (k === " ") { stop(); a.setPlaying(p => !p); a.flashDock(); return; }
      if (k === "ArrowRight" || k === "ArrowLeft") {
        stop();
        const dir = k === "ArrowRight" ? 1 : -1;
        if (e.shiftKey) { a.userSkip(dir > 0 ? "next" : "prev"); a.flashDock(); return; }
        a.setPos(p => Math.max(0, Math.min(a.track.dur, p + dir * 5)));
        a.flashDock();
        return;
      }
      if (k === "ArrowUp" || k === "ArrowDown") {
        stop();
        a.setVolume(v => Math.max(0, Math.min(1, v + (k === "ArrowUp" ? 0.05 : -0.05))));
        a.flashDock();
        return;
      }
      const key = k.toLowerCase();
      if (key === "m") { stop(); a.toggleMute(); return; }
      if (key === "l") { stop(); a.toggleLike(a.currentId); return; }
      if (key === "p") { stop(); a.playerOpen ? a.closePlayer() : a.openPlayer(); return; }
      if (key === "h") { stop(); a.setPage("history"); return; }
      if (key === "g") { stop(); a.setPage("playlists"); return; }
      if (key === "d") { stop(); a.setPage("discover"); return; }
      if (key === "k") { stop(); a.setDock(v => !v); a.setDockPin(true); return; }
      if (key === "t") { stop(); a.setStudio({ tab: "sleep" }); return; }
      if (key === "q") { stop(); a.setStudio({ tab: "quality" }); return; }
      if (key === "e") { stop(); a.setStudio({ tab: "eq" }); return; }
      if (k === "?" || (k === "/" && e.shiftKey)) { stop(); a.setKeysOpen(true); return; }
      if (k === "/") {
        stop();
        a.setSearchOpen(true);
        requestAnimationFrame(() => {
          const el = document.querySelector(".searchbox input");
          if (el) el.focus();
        });
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return null;
}

/* 媒体键悬浮控制：上一首 / 播放 / 下一首 + 进度 */
function MediaDock() {
  const {
    dock, setDock, dockPin, setDockPin, track, playing, setPlaying, pos, setPos,
    userSkip, volume, setVolume, liked, toggleLike, quality, openPlayer, flashDock,
    lyricsBar, queueIds, currentId
  } = useApp();
  const seekRef = React.useRef(null);
  if (!dock) return null;

  const pct = Math.min(100, (pos / track.dur) * 100);
  const isLiked = liked.includes(track.id);
  const q = (QUALITY_LEVELS.find(x => x.id === quality) || QUALITY_LEVELS[1]).short;
  const idx = queueIds.indexOf(currentId);
  const no = String(((hashStr(track.title + track.band) % 9000) + 1000)).slice(0, 4);

  const seek = e => {
    const r = seekRef.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * track.dur);
  };

  return (
    <div className="pass" role="region" aria-label="媒体键悬浮控制 · 后台通行证"
      style={lyricsBar ? { bottom: 168 } : undefined}>
      <span className="pass__hole" aria-hidden="true"></span>

      <div className="pass__head">
        <span className="pass__brand">
          <b>AFEIFEI</b>
          <span>BACKSTAGE PASS · STAFF</span>
        </span>
        <span className="pass__no">No.{no}</span>
      </div>

      <div className="pass__body">
        <img className="pass__art" src={track.cover} alt="" />
        <span className="pass__meta">
          <span className="pass__title" title={track.title}>{track.title}</span>
          <span className="pass__artist">{track.artist}</span>
          <span className="pass__tags">
            <i className="pass__tag pass__tag--live">{q}</i>
            <i className="pass__tag">SETLIST {String(idx + 1).padStart(2, "0")}/{String(queueIds.length).padStart(2, "0")}</i>
          </span>
        </span>
      </div>

      <span className="pass__stamp" aria-hidden="true">台侧通行</span>
      <div className="pass__perf" aria-hidden="true"></div>

      <div className="pass__controls">
        <button className="pass__key" onClick={() => userSkip("prev")} title="上一首（Shift + ←）">
          <IconPrev size={16} />
        </button>
        <button className="pass__play" onClick={() => { setPlaying(p => !p); flashDock(); }}
          aria-label={playing ? "暂停" : "播放"}>
          <PlayGlyph playing={playing} size={18} />
        </button>
        <button className="pass__key" onClick={() => userSkip("next")} title="下一首（Shift + →）">
          <IconNext size={16} />
        </button>
        <button className={"pass__key" + (isLiked ? " is-liked" : "")} onClick={() => toggleLike(track.id)}
          title={isLiked ? "取消喜欢（L）" : "喜欢（L）"}>
          {isLiked ? <IconHeartFill size={15} /> : <IconHeart size={15} />}
        </button>
        <button className="pass__key" onClick={() => setVolume(v => v > 0 ? 0 : 0.7)}
          title={volume > 0 ? "静音（M）" : "恢复音量（M）"}>
          <IconVolume size={15} />
        </button>
      </div>

      <div className="pass__seek" ref={seekRef} onPointerDown={seek}
        onPointerMove={e => { if (e.buttons === 1) seek(e); }}
        role="slider" aria-label="播放进度" aria-valuenow={Math.round(pct)}>
        <b style={{ width: Math.min(100, pct + 12) + "%" }}></b>
        <i style={{ width: pct + "%" }}></i>
        <span style={{ left: pct + "%" }}></span>
      </div>
      <div className="pass__ticks">
        <em>{fmt(pos)}</em>
        <em>−{fmt(Math.max(0, track.dur - pos))}</em>
      </div>

      <div className="pass__foot">
        <button className={"pass__pin" + (dockPin ? " is-on" : "")} onClick={() => setDockPin(v => !v)}
          title={dockPin ? "取消常驻" : "别在屏幕上常驻"}>
          <IconPick size={11} />{dockPin ? "已别上" : "常驻"}
        </button>
        <button className="pass__pin" onClick={openPlayer} title="展开播放页（P）">
          <IconArrowRight size={11} />进舞台
        </button>
        <span className="pass__hint">空格 / ← → / K</span>
        <button className="pass__close" onClick={() => { setDock(false); setDockPin(false); }}
          title="收起" aria-label="收起悬浮控制">
          <IconX size={13} />
        </button>
      </div>
    </div>
  );
}

/* 快捷键清单 */
function KeysSheet() {
  const { keysOpen, setKeysOpen } = useApp();
  React.useEffect(() => {
    const fn = e => { if (e.key === "Escape") setKeysOpen(false); };
    if (keysOpen) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [keysOpen, setKeysOpen]);
  if (!keysOpen) return null;
  return (
    <React.Fragment>
      <div className="keys-mask" onClick={() => setKeysOpen(false)}></div>
      <div className="keys" role="dialog" aria-modal="true" aria-label="键盘快捷键">
        <div className="keys__head">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>键盘也弹得了</h2>
          <span className="eyebrow" style={{ marginBottom: 6 }}>KEYBOARD · 不用离开琴键</span>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={() => setKeysOpen(false)} title="关闭" aria-label="关闭快捷键面板">
            <IconX size={15} />
          </button>
        </div>
        <div className="keys__grid">
          {SHORTCUT_GROUPS.map(g => (
            <div key={g.title}>
              <div className="keys__group-title">{g.title}</div>
              {g.rows.map(([k, label]) => (
                <div key={k} className="keys__row">
                  <span>{label}</span>
                  <kbd>{k}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="hand" style={{ fontSize: 12, color: "var(--text-3)", marginTop: 18 }}>
          在输入框里打字时快捷键不生效，按 Esc 先退出输入。
        </p>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { Hotkeys, MediaDock, KeysSheet, SHORTCUT_GROUPS });
