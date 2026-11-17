const SHORTCUT_GROUPS = [
  {
    title: "\u64AD\u653E",
    rows: [["\u7A7A\u683C", "\u64AD\u653E / \u6682\u505C"], ["\u2190 \u2192", "\u540E\u9000 / \u524D\u8FDB 5 \u79D2"], ["Shift + \u2190 \u2192", "\u4E0A\u4E00\u9996 / \u4E0B\u4E00\u9996"], ["\u2191 \u2193", "\u97F3\u91CF \xB15%"], ["M", "\u9759\u97F3"], ["L", "\u559C\u6B22\u8FD9\u9996\u6B4C"]]
  },
  {
    title: "\u754C\u9762",
    rows: [["P", "\u5C55\u5F00 / \u6536\u8D77\u64AD\u653E\u9875"], ["/", "\u805A\u7126\u641C\u7D22"], ["H", "\u64AD\u653E\u5386\u53F2"], ["G", "\u6B4C\u5355"], ["D", "\u53D1\u73B0"], ["Esc", "\u5173\u95ED\u6D6E\u5C42"]]
  },
  {
    title: "\u53F0\u4FA7",
    rows: [["T", "\u5B9A\u65F6\u5173\u95ED"], ["Q", "\u97F3\u8D28"], ["E", "\u5747\u8861\u5668"], ["K", "\u5A92\u4F53\u952E\u60AC\u6D6E\u63A7\u5236"], ["?", "\u8FD9\u4EFD\u6E05\u5355"]]
  }
];
function Hotkeys() {
  const app = useApp();
  const ref = React.useRef(app);
  ref.current = app;
  React.useEffect(() => {
    const typing = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onKey = (e) => {
      const a = ref.current;
      const active = document.activeElement;
      if (e.key === "Escape") {
        if (typing(active)) {
          active.blur();
          return;
        }
        if (a.keysOpen) {
          a.setKeysOpen(false);
          return;
        }
        if (a.loginSrc) {
          a.closeScan();
          return;
        }
        if (a.lyricsFull) {
          a.setLyricsFull(false);
          return;
        }
        if (a.listEditor) {
          a.setListEditor(null);
          return;
        }
        if (a.studio) {
          a.setStudio(null);
          return;
        }
        if (a.searchOpen) {
          a.setSearchOpen(false);
          return;
        }
        if (a.playerOpen) {
          a.closePlayer();
          return;
        }
        if (a.dock) {
          a.setDock(false);
          return;
        }
        return;
      }
      if (typing(active)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (k === " ") {
        stop();
        a.setPlaying((p) => !p);
        a.flashDock();
        return;
      }
      if (k === "ArrowRight" || k === "ArrowLeft") {
        stop();
        const dir = k === "ArrowRight" ? 1 : -1;
        if (e.shiftKey) {
          a.userSkip(dir > 0 ? "next" : "prev");
          a.flashDock();
          return;
        }
        a.setPos((p) => Math.max(0, Math.min(a.track.dur, p + dir * 5)));
        a.flashDock();
        return;
      }
      if (k === "ArrowUp" || k === "ArrowDown") {
        stop();
        a.setVolume((v) => Math.max(0, Math.min(1, v + (k === "ArrowUp" ? 0.05 : -0.05))));
        a.flashDock();
        return;
      }
      const key = k.toLowerCase();
      if (key === "m") {
        stop();
        a.toggleMute();
        return;
      }
      if (key === "l") {
        stop();
        a.toggleLike(a.currentId);
        return;
      }
      if (key === "p") {
        stop();
        a.playerOpen ? a.closePlayer() : a.openPlayer();
        return;
      }
      if (key === "h") {
        stop();
        a.setPage("history");
        return;
      }
      if (key === "g") {
        stop();
        a.setPage("playlists");
        return;
      }
      if (key === "d") {
        stop();
        a.setPage("discover");
        return;
      }
      if (key === "k") {
        stop();
        a.setDock((v) => !v);
        a.setDockPin(true);
        return;
      }
      if (key === "t") {
        stop();
        a.setStudio({ tab: "sleep" });
        return;
      }
      if (key === "q") {
        stop();
        a.setStudio({ tab: "quality" });
        return;
      }
      if (key === "e") {
        stop();
        a.setStudio({ tab: "eq" });
        return;
      }
      if (k === "?" || k === "/" && e.shiftKey) {
        stop();
        a.setKeysOpen(true);
        return;
      }
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
function MediaDock() {
  const {
    dock,
    setDock,
    dockPin,
    setDockPin,
    track,
    playing,
    setPlaying,
    pos,
    setPos,
    userSkip,
    volume,
    setVolume,
    liked,
    toggleLike,
    quality,
    openPlayer,
    flashDock,
    lyricsBar,
    queueIds,
    currentId
  } = useApp();
  const seekRef = React.useRef(null);
  if (!dock) return null;
  const pct = Math.min(100, pos / track.dur * 100);
  const isLiked = liked.includes(track.id);
  const q = (QUALITY_LEVELS.find((x) => x.id === quality) || QUALITY_LEVELS[1]).short;
  const idx = queueIds.indexOf(currentId);
  const no = String(hashStr(track.title + track.band) % 9e3 + 1e3).slice(0, 4);
  const seek = (e) => {
    const r = seekRef.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * track.dur);
  };
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "pass",
      role: "region",
      "aria-label": "\u5A92\u4F53\u952E\u60AC\u6D6E\u63A7\u5236 \xB7 \u540E\u53F0\u901A\u884C\u8BC1",
      style: lyricsBar ? { bottom: 168 } : void 0
    },
    /* @__PURE__ */ React.createElement("span", { className: "pass__hole", "aria-hidden": "true" }),
    /* @__PURE__ */ React.createElement("div", { className: "pass__head" }, /* @__PURE__ */ React.createElement("span", { className: "pass__brand" }, /* @__PURE__ */ React.createElement("b", null, "AFEIFEI"), /* @__PURE__ */ React.createElement("span", null, "BACKSTAGE PASS \xB7 STAFF")), /* @__PURE__ */ React.createElement("span", { className: "pass__no" }, "No.", no)),
    /* @__PURE__ */ React.createElement("div", { className: "pass__body" }, /* @__PURE__ */ React.createElement("img", { className: "pass__art", src: track.cover, alt: "" }), /* @__PURE__ */ React.createElement("span", { className: "pass__meta" }, /* @__PURE__ */ React.createElement("span", { className: "pass__title", title: track.title }, track.title), /* @__PURE__ */ React.createElement("span", { className: "pass__artist" }, track.artist), /* @__PURE__ */ React.createElement("span", { className: "pass__tags" }, /* @__PURE__ */ React.createElement("i", { className: "pass__tag pass__tag--live" }, q), /* @__PURE__ */ React.createElement("i", { className: "pass__tag" }, "SETLIST ", String(idx + 1).padStart(2, "0"), "/", String(queueIds.length).padStart(2, "0"))))),
    /* @__PURE__ */ React.createElement("span", { className: "pass__stamp", "aria-hidden": "true" }, "\u53F0\u4FA7\u901A\u884C"),
    /* @__PURE__ */ React.createElement("div", { className: "pass__perf", "aria-hidden": "true" }),
    /* @__PURE__ */ React.createElement("div", { className: "pass__controls" }, /* @__PURE__ */ React.createElement("button", { className: "pass__key", onClick: () => userSkip("prev"), title: "\u4E0A\u4E00\u9996\uFF08Shift + \u2190\uFF09" }, /* @__PURE__ */ React.createElement(IconPrev, { size: 16 })), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "pass__play",
        onClick: () => {
          setPlaying((p) => !p);
          flashDock();
        },
        "aria-label": playing ? "\u6682\u505C" : "\u64AD\u653E"
      },
      /* @__PURE__ */ React.createElement(PlayGlyph, { playing, size: 18 })
    ), /* @__PURE__ */ React.createElement("button", { className: "pass__key", onClick: () => userSkip("next"), title: "\u4E0B\u4E00\u9996\uFF08Shift + \u2192\uFF09" }, /* @__PURE__ */ React.createElement(IconNext, { size: 16 })), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "pass__key" + (isLiked ? " is-liked" : ""),
        onClick: () => toggleLike(track.id),
        title: isLiked ? "\u53D6\u6D88\u559C\u6B22\uFF08L\uFF09" : "\u559C\u6B22\uFF08L\uFF09"
      },
      isLiked ? /* @__PURE__ */ React.createElement(IconHeartFill, { size: 15 }) : /* @__PURE__ */ React.createElement(IconHeart, { size: 15 })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "pass__key",
        onClick: () => setVolume((v) => v > 0 ? 0 : 0.7),
        title: volume > 0 ? "\u9759\u97F3\uFF08M\uFF09" : "\u6062\u590D\u97F3\u91CF\uFF08M\uFF09"
      },
      /* @__PURE__ */ React.createElement(IconVolume, { size: 15 })
    )),
    /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "pass__seek",
        ref: seekRef,
        onPointerDown: seek,
        onPointerMove: (e) => {
          if (e.buttons === 1) seek(e);
        },
        role: "slider",
        "aria-label": "\u64AD\u653E\u8FDB\u5EA6",
        "aria-valuenow": Math.round(pct)
      },
      /* @__PURE__ */ React.createElement("b", { style: { width: Math.min(100, pct + 12) + "%" } }),
      /* @__PURE__ */ React.createElement("i", { style: { width: pct + "%" } }),
      /* @__PURE__ */ React.createElement("span", { style: { left: pct + "%" } })
    ),
    /* @__PURE__ */ React.createElement("div", { className: "pass__ticks" }, /* @__PURE__ */ React.createElement("em", null, fmt(pos)), /* @__PURE__ */ React.createElement("em", null, "\u2212", fmt(Math.max(0, track.dur - pos)))),
    /* @__PURE__ */ React.createElement("div", { className: "pass__foot" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "pass__pin" + (dockPin ? " is-on" : ""),
        onClick: () => setDockPin((v) => !v),
        title: dockPin ? "\u53D6\u6D88\u5E38\u9A7B" : "\u522B\u5728\u5C4F\u5E55\u4E0A\u5E38\u9A7B"
      },
      /* @__PURE__ */ React.createElement(IconPick, { size: 11 }),
      dockPin ? "\u5DF2\u522B\u4E0A" : "\u5E38\u9A7B"
    ), /* @__PURE__ */ React.createElement("button", { className: "pass__pin", onClick: openPlayer, title: "\u5C55\u5F00\u64AD\u653E\u9875\uFF08P\uFF09" }, /* @__PURE__ */ React.createElement(IconArrowRight, { size: 11 }), "\u8FDB\u821E\u53F0"), /* @__PURE__ */ React.createElement("span", { className: "pass__hint" }, "\u7A7A\u683C / \u2190 \u2192 / K"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "pass__close",
        onClick: () => {
          setDock(false);
          setDockPin(false);
        },
        title: "\u6536\u8D77",
        "aria-label": "\u6536\u8D77\u60AC\u6D6E\u63A7\u5236"
      },
      /* @__PURE__ */ React.createElement(IconX, { size: 13 })
    ))
  );
}
function KeysSheet() {
  const { keysOpen, setKeysOpen } = useApp();
  React.useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") setKeysOpen(false);
    };
    if (keysOpen) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [keysOpen, setKeysOpen]);
  if (!keysOpen) return null;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "keys-mask", onClick: () => setKeysOpen(false) }), /* @__PURE__ */ React.createElement("div", { className: "keys", role: "dialog", "aria-modal": "true", "aria-label": "\u952E\u76D8\u5FEB\u6377\u952E" }, /* @__PURE__ */ React.createElement("div", { className: "keys__head" }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "var(--font-display)", fontSize: 24 } }, "\u952E\u76D8\u4E5F\u5F39\u5F97\u4E86"), /* @__PURE__ */ React.createElement("span", { className: "eyebrow", style: { marginBottom: 6 } }, "KEYBOARD \xB7 \u4E0D\u7528\u79BB\u5F00\u7434\u952E"), /* @__PURE__ */ React.createElement("button", { className: "icon-btn", style: { marginLeft: "auto" }, onClick: () => setKeysOpen(false), title: "\u5173\u95ED", "aria-label": "\u5173\u95ED\u5FEB\u6377\u952E\u9762\u677F" }, /* @__PURE__ */ React.createElement(IconX, { size: 15 }))), /* @__PURE__ */ React.createElement("div", { className: "keys__grid" }, SHORTCUT_GROUPS.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.title }, /* @__PURE__ */ React.createElement("div", { className: "keys__group-title" }, g.title), g.rows.map(([k, label]) => /* @__PURE__ */ React.createElement("div", { key: k, className: "keys__row" }, /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("kbd", null, k)))))), /* @__PURE__ */ React.createElement("p", { className: "hand", style: { fontSize: 12, color: "var(--text-3)", marginTop: 18 } }, "\u5728\u8F93\u5165\u6846\u91CC\u6253\u5B57\u65F6\u5FEB\u6377\u952E\u4E0D\u751F\u6548\uFF0C\u6309 Esc \u5148\u9000\u51FA\u8F93\u5165\u3002")));
}
Object.assign(window, { Hotkeys, MediaDock, KeysSheet, SHORTCUT_GROUPS });
