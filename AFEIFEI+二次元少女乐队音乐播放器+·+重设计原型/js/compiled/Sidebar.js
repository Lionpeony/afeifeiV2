function Sidebar() {
  const { page, setPage, onLogoClick, themePref, setThemePref, liked, eggs, accounts } = useApp();
  const nav = [
    { id: "discover", label: "\u53D1\u73B0", icon: IconDisc },
    { id: "wander", label: "\u6F2B\u6E38", icon: IconCompass },
    { id: "local", label: "\u672C\u5730\u97F3\u4E50", icon: IconFolder },
    { id: "downloads", label: "\u4E0B\u8F7D\u7BA1\u7406", icon: IconDownload },
    { id: "likes", label: "\u6211\u559C\u6B22\u7684\u97F3\u4E50", icon: IconHeart },
    { id: "history", label: "\u64AD\u653E\u5386\u53F2", icon: IconArchive },
    { id: "playlists", label: "\u6B4C\u5355", icon: IconList }
  ];
  const isActive = (id) => page === id || id === "discover" && page === "archive";
  const linked = Object.values(accounts).filter(Boolean).length;
  const navRef = React.useRef(null);
  const itemRefs = React.useRef({});
  const activeId = nav.find((n) => isActive(n.id)) ? nav.find((n) => isActive(n.id)).id : "discover";
  const [mark, setMark] = React.useState({ top: 0, ready: false });
  React.useLayoutEffect(() => {
    const el = itemRefs.current[activeId];
    if (!el) return;
    setMark({ top: el.offsetTop + el.offsetHeight / 2 - 9, ready: true });
  }, [activeId, accounts]);
  return /* @__PURE__ */ React.createElement("aside", { className: "sidebar" }, /* @__PURE__ */ React.createElement("div", { className: "sidebar__brand", onClick: onLogoClick, title: "AFEIFEI \xB7 \u70B9\u4E94\u4E0B\u8BD5\u8BD5" }, /* @__PURE__ */ React.createElement("span", { className: "brand-mark" }, /* @__PURE__ */ React.createElement(LogoMark, { size: 38 })), /* @__PURE__ */ React.createElement("span", { className: "brand-word" }, /* @__PURE__ */ React.createElement("b", null, "AFEIFEI"), /* @__PURE__ */ React.createElement("span", null, "\u5C11\u5973\u4E50\u961F\u540E\u53F0"))), /* @__PURE__ */ React.createElement("nav", { className: "nav", ref: navRef }, /* @__PURE__ */ React.createElement("div", { className: "nav__label eyebrow" }, "\u66F2\u5E93"), mark.ready && /* @__PURE__ */ React.createElement("span", { className: "nav__marker", style: { transform: `translateY(${mark.top}px)` }, "aria-hidden": "true" }), nav.map((n) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: n.id,
      ref: (el) => {
        itemRefs.current[n.id] = el;
      },
      className: "nav-item" + (isActive(n.id) ? " is-active" : ""),
      onClick: () => {
        setPage(n.id);
        Sound.tap && Sound.tap();
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "nav-ico" }, /* @__PURE__ */ React.createElement(n.icon, { size: 18 })),
    /* @__PURE__ */ React.createElement("span", null, n.label),
    n.id === "likes" && liked.length > 0 && /* @__PURE__ */ React.createElement("span", { className: "num nav-item__count" }, liked.length)
  ))), /* @__PURE__ */ React.createElement("div", { className: "sidebar__next" }, /* @__PURE__ */ React.createElement("div", { className: "side-card" }, /* @__PURE__ */ React.createElement(Tape, { w: 52, rot: -3, style: { top: -8, left: "50%", marginLeft: -26 } }), /* @__PURE__ */ React.createElement("div", { className: "side-card__row" }, /* @__PURE__ */ React.createElement("span", { className: "side-card__day" }, "19"), /* @__PURE__ */ React.createElement("div", { className: "side-card__meta" }, /* @__PURE__ */ React.createElement("div", null, "\u5341\u4E8C\u6708 \xB7 \u5468\u516D"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-3)" } }, "\u6392\u7EC3\u516C\u5F00\u65E5 15:00"))), /* @__PURE__ */ React.createElement("div", { className: "side-card__note hand" }, "\u5730\u4E0B\u5BA4 B1\uFF0C\u8BB0\u5F97\u5E26\u8033\u585E\u3002")), /* @__PURE__ */ React.createElement("div", { className: "side-user" }, /* @__PURE__ */ React.createElement("span", { className: "side-user__avatar" }, linked > 1 ? "A" : "a"), /* @__PURE__ */ React.createElement("span", { className: "side-user__meta" }, /* @__PURE__ */ React.createElement("b", null, "\u540E\u53F0\u503C\u73ED"), /* @__PURE__ */ React.createElement("span", { className: "num" }, linked, "/2 \u4E2A\u97F3\u6E90\u5DF2\u767B\u5F55")), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "icon-btn",
      title: "\u8BBE\u7F6E",
      onClick: () => setPage("settings"),
      style: { marginLeft: "auto" }
    },
    /* @__PURE__ */ React.createElement(IconSettings, { size: 16 })
  )), /* @__PURE__ */ React.createElement("div", { className: "sidebar__foot" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow", style: { letterSpacing: ".08em", fontSize: 9 } }, "\u5F69\u86CB ", eggs.length, "/17"), /* @__PURE__ */ React.createElement("div", { className: "row gap6" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "icon-btn" + (themePref === "light" ? " is-on" : ""),
      onClick: () => setThemePref("light"),
      title: "\u660E\u4EAE \xB7 \u6392\u7EC3\u5BA4",
      "aria-label": "\u660E\u4EAE\u4E3B\u9898"
    },
    /* @__PURE__ */ React.createElement(IconSun, { size: 16 })
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "icon-btn" + (themePref === "dark" ? " is-on" : ""),
      onClick: () => setThemePref("dark"),
      title: "\u6697\u8272 \xB7 \u6392\u7EC3\u5BA4\u7184\u706F",
      "aria-label": "\u6697\u8272\u4E3B\u9898"
    },
    /* @__PURE__ */ React.createElement(IconMoon, { size: 16 })
  )))));
}
function TopBar() {
  const { setPage, tryCode, accounts, source, switchSource, onomaAt } = useApp();
  const [q, setQ] = React.useState(() => new URLSearchParams(location.search).get("q") || "");
  const [open, setOpen] = React.useState(() => !!new URLSearchParams(location.search).get("q"));
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    const fn = (e) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current && inputRef.current.focus();
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);
  const linked = Object.values(accounts).filter(Boolean).length;
  return /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", { className: "searchbox" }, /* @__PURE__ */ React.createElement("div", { className: "searchbox__field" }, /* @__PURE__ */ React.createElement(IconSearch, { size: 15, style: { color: "var(--text-3)", flex: "none" } }), /* @__PURE__ */ React.createElement(
    "input",
    {
      ref: inputRef,
      value: q,
      onChange: (e) => {
        setQ(e.target.value);
        setOpen(!!e.target.value.trim());
      },
      onFocus: () => {
        if (q.trim()) setOpen(true);
      },
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          if (tryCode(q.trim())) {
            setQ("");
            setOpen(false);
            return;
          }
          setOpen(!!q.trim());
        }
        if (e.key === "Escape") setOpen(false);
      },
      placeholder: "\u641C\u7D22\u66F2\u76EE\u3001\u827A\u4EBA\u6216\u4E13\u8F91",
      "aria-label": "\u641C\u7D22\u66F2\u76EE\u3001\u827A\u4EBA\u6216\u4E13\u8F91"
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "searchbox__kbd" }, "/")), open && q.trim() && /* @__PURE__ */ React.createElement(SearchOverlay, { q, onClose: () => setOpen(false) })), /* @__PURE__ */ React.createElement("div", { className: "topbar__right" }, /* @__PURE__ */ React.createElement("div", { className: "src-switch", title: "\u5F53\u524D\u97F3\u6E90" }, /* @__PURE__ */ React.createElement(PillWipe, null), Object.values(SOURCES).map((s) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: s.id,
      className: "src-switch__btn" + (source === s.id ? " is-on" : ""),
      style: { "--src": s.tone },
      onClick: (e) => {
        if (source === s.id) return;
        onomaAt(e.currentTarget, "\u30B6\u30C3\u2026", "mint");
        switchSource(s.id, { scope: "pill", quiet: true });
      },
      title: accounts[s.id] ? s.name + " \xB7 \u5DF2\u767B\u5F55" : s.name + " \xB7 \u672A\u767B\u5F55"
    },
    /* @__PURE__ */ React.createElement("i", { style: { background: s.tone } }),
    s.short
  ))), /* @__PURE__ */ React.createElement("div", { className: "win-ctrl" }, /* @__PURE__ */ React.createElement("button", { title: "\u6700\u5C0F\u5316", "aria-label": "\u6700\u5C0F\u5316" }, /* @__PURE__ */ React.createElement(IconMin, { size: 14 })), /* @__PURE__ */ React.createElement("button", { title: "\u6700\u5927\u5316", "aria-label": "\u6700\u5927\u5316" }, /* @__PURE__ */ React.createElement(IconMax, { size: 12 })), /* @__PURE__ */ React.createElement("button", { title: "\u5173\u95ED", "aria-label": "\u5173\u95ED" }, /* @__PURE__ */ React.createElement(IconX, { size: 14 }))), /* @__PURE__ */ React.createElement("button", { className: "topbar__avatar", title: linked + " \u4E2A\u97F3\u6E90\u5DF2\u767B\u5F55 \xB7 \u70B9\u51FB\u8BBE\u7F6E", onClick: () => setPage("settings") }, linked > 1 ? "A" : "a")));
}
Object.assign(window, { Sidebar, TopBar });
