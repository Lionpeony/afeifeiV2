/* ---------- 侧边栏 + 顶栏（v4 真实产品结构） ---------- */
function Sidebar() {
  const { page, setPage, onLogoClick, themePref, setThemePref, liked, eggs, accounts } = useApp();
  const nav = [
    { id: "discover", label: "发现", icon: IconDisc },
    { id: "wander", label: "漫游", icon: IconCompass },
    { id: "local", label: "本地音乐", icon: IconFolder },
    { id: "downloads", label: "下载管理", icon: IconDownload },
    { id: "likes", label: "我喜欢的音乐", icon: IconHeart },
    { id: "history", label: "播放历史", icon: IconArchive },
    { id: "playlists", label: "歌单", icon: IconList }
  ];
  const isActive = id => page === id || (id === "discover" && page === "archive");
  const linked = Object.values(accounts).filter(Boolean).length;

  /* 拨片标：滑到当前项，而不是瞬移 */
  const navRef = React.useRef(null);
  const itemRefs = React.useRef({});
  const activeId = nav.find(n => isActive(n.id)) ? nav.find(n => isActive(n.id)).id : "discover";
  const [mark, setMark] = React.useState({ top: 0, ready: false });

  React.useLayoutEffect(() => {
    const el = itemRefs.current[activeId];
    if (!el) return;
    setMark({ top: el.offsetTop + el.offsetHeight / 2 - 9, ready: true });
  }, [activeId, accounts]);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand" onClick={onLogoClick} title="AFEIFEI · 点五下试试">
        <span className="brand-mark"><LogoMark size={38} /></span>
        <span className="brand-word">
          <b>AFEIFEI</b>
          <span>少女乐队后台</span>
        </span>
      </div>

      <nav className="nav" ref={navRef}>
        <div className="nav__label eyebrow">曲库</div>
        {mark.ready && (
          <span className="nav__marker" style={{ transform: `translateY(${mark.top}px)` }} aria-hidden="true"></span>
        )}
        {nav.map(n => (
          <button key={n.id}
            ref={el => { itemRefs.current[n.id] = el; }}
            className={"nav-item" + (isActive(n.id) ? " is-active" : "")}
            onClick={() => { setPage(n.id); Sound.tap && Sound.tap(); }}>
            <span className="nav-ico"><n.icon size={18} /></span>
            <span>{n.label}</span>
            {n.id === "likes" && liked.length > 0 && (
              <span className="num nav-item__count">{liked.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar__next">
        <div className="side-card">
          <Tape w={52} rot={-3} style={{ top: -8, left: "50%", marginLeft: -26 }} />
          <div className="side-card__row">
            <span className="side-card__day">19</span>
            <div className="side-card__meta">
              <div>十二月 · 周六</div>
              <div style={{ color: "var(--text-3)" }}>排练公开日 15:00</div>
            </div>
          </div>
          <div className="side-card__note hand">地下室 B1，记得带耳塞。</div>
        </div>

        <div className="side-user">
          <span className="side-user__avatar">{linked > 1 ? "A" : "a"}</span>
          <span className="side-user__meta">
            <b>后台值班</b>
            <span className="num">{linked}/2 个音源已登录</span>
          </span>
          <button className="icon-btn" title="设置" onClick={() => setPage("settings")}
            style={{ marginLeft: "auto" }}>
            <IconSettings size={16} />
          </button>
        </div>

        <div className="sidebar__foot">
          <span className="eyebrow" style={{ letterSpacing: ".08em", fontSize: 9 }}>
            彩蛋 {eggs.length}/17
          </span>
          <div className="row gap6">
            <button className={"icon-btn" + (themePref === "light" ? " is-on" : "")}
              onClick={() => setThemePref("light")} title="明亮 · 排练室" aria-label="明亮主题">
              <IconSun size={16} />
            </button>
            <button className={"icon-btn" + (themePref === "dark" ? " is-on" : "")}
              onClick={() => setThemePref("dark")} title="暗色 · 排练室熄灯" aria-label="暗色主题">
              <IconMoon size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const { setPage, tryCode, accounts, source, switchSource, onomaAt } = useApp();
  const [q, setQ] = React.useState(() => new URLSearchParams(location.search).get("q") || "");
  const [open, setOpen] = React.useState(() => !!new URLSearchParams(location.search).get("q"));
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const fn = e => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current && inputRef.current.focus();
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);

  const linked = Object.values(accounts).filter(Boolean).length;

  return (
    <header className="topbar">
      <div className="searchbox">
        <div className="searchbox__field">
          <IconSearch size={15} style={{ color: "var(--text-3)", flex: "none" }} />
          <input ref={inputRef} value={q}
            onChange={e => { setQ(e.target.value); setOpen(!!e.target.value.trim()); }}
            onFocus={() => { if (q.trim()) setOpen(true); }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                if (tryCode(q.trim())) { setQ(""); setOpen(false); return; }
                setOpen(!!q.trim());
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="搜索曲目、艺人或专辑"
            aria-label="搜索曲目、艺人或专辑" />
          <span className="searchbox__kbd">/</span>
        </div>
        {open && q.trim() && <SearchOverlay q={q} onClose={() => setOpen(false)} />}
      </div>

      <div className="topbar__right">
        <div className="src-switch" title="当前音源">
          <PillWipe />
          {Object.values(SOURCES).map(s => (
            <button key={s.id}
              className={"src-switch__btn" + (source === s.id ? " is-on" : "")}
              style={{ "--src": s.tone }}
              onClick={e => {
                if (source === s.id) return;
                onomaAt(e.currentTarget, "ザッ…", "mint");
                switchSource(s.id, { scope: "pill", quiet: true });
              }}
              title={accounts[s.id] ? s.name + " · 已登录" : s.name + " · 未登录"}>
              <i style={{ background: s.tone }}></i>{s.short}
            </button>
          ))}
        </div>

        <div className="win-ctrl">
          <button title="最小化" aria-label="最小化"><IconMin size={14} /></button>
          <button title="最大化" aria-label="最大化"><IconMax size={12} /></button>
          <button title="关闭" aria-label="关闭"><IconX size={14} /></button>
        </div>

        <button className="topbar__avatar" title={linked + " 个音源已登录 · 点击设置"} onClick={() => setPage("settings")}>
          {linked > 1 ? "A" : "a"}
        </button>
      </div>
    </header>
  );
}

Object.assign(window, { Sidebar, TopBar });
