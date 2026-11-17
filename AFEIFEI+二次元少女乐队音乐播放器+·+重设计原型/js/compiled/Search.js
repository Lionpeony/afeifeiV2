const Mark = ({ text, q }) => {
  const key = (q || "").trim();
  if (!key) return /* @__PURE__ */ React.createElement(React.Fragment, null, text);
  const i = text.toLowerCase().indexOf(key.toLowerCase());
  if (i < 0) return /* @__PURE__ */ React.createElement(React.Fragment, null, text);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, text.slice(0, i), /* @__PURE__ */ React.createElement("mark", { className: "hl" }, text.slice(i, i + key.length)), text.slice(i + key.length));
};
const SourceDots = ({ avail }) => /* @__PURE__ */ React.createElement("span", { className: "src-dots" }, Object.values(SOURCES).map((s) => {
  const st = avail && avail[s.id] || "ok";
  return /* @__PURE__ */ React.createElement(
    "span",
    {
      key: s.id,
      className: "src-dot" + (st === "ok" ? " is-ok" : st === "vip" ? " is-vip" : " is-none"),
      style: { "--src": s.tone },
      title: s.name + " \xB7 " + AVAIL_LABEL[st]
    },
    st === "ok" ? s.short : st === "vip" ? "VIP" : "\u2014"
  );
}));
function SearchOverlay({ q, onClose }) {
  const { playAt, tryPlay, source, setPage } = useApp();
  const [tab, setTab] = React.useState("track");
  const [busy, setBusy] = React.useState(false);
  const key = (q || "").trim().toLowerCase();
  React.useEffect(() => {
    if (!key) return;
    setBusy(true);
    const t = setTimeout(() => setBusy(false), 240);
    return () => clearTimeout(t);
  }, [key]);
  React.useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);
  const hit = (s) => s.toLowerCase().includes(key);
  const tracks = key ? TRACKS.filter((t) => hit(t.title) || hit(t.artist) || hit(t.album)) : [];
  const artists = key ? Array.from(new Set(TRACKS.filter((t) => hit(t.artist)).map((t) => t.artist))) : [];
  const albums = key ? Object.values(RELEASES).filter((r) => hit(r.title) || hit(r.band)) : [];
  const lists = key ? ["netease", "qq"].flatMap((sid) => (PLAYLISTS[sid] || []).map((p) => ({ ...p, src: sid }))).filter((p) => hit(p.name)) : [];
  const tabs = [
    { id: "track", label: "\u5355\u66F2", n: tracks.length },
    { id: "artist", label: "\u827A\u4EBA", n: artists.length },
    { id: "album", label: "\u4E13\u8F91", n: albums.length },
    { id: "list", label: "\u6B4C\u5355", n: lists.length }
  ];
  const total = tracks.length + artists.length + albums.length + lists.length;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "search-scrim", onPointerDown: onClose }), /* @__PURE__ */ React.createElement("div", { className: "search-overlay", role: "dialog", "aria-label": "\u641C\u7D22\u7ED3\u679C" }, /* @__PURE__ */ React.createElement("div", { className: "search-overlay__tabs" }, tabs.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      className: "search-tab" + (tab === t.id ? " is-on" : ""),
      onClick: () => setTab(t.id)
    },
    t.label,
    /* @__PURE__ */ React.createElement("span", { className: "num" }, t.n)
  )), /* @__PURE__ */ React.createElement("span", { className: "search-overlay__total meta" }, "\u300C", q.trim(), "\u300D\u5171 ", total, " \u6761")), /* @__PURE__ */ React.createElement("div", { className: "search-overlay__body" }, busy ? /* @__PURE__ */ React.createElement("div", { className: "search-busy" }, /* @__PURE__ */ React.createElement("span", { className: "search-busy__guitar" }, /* @__PURE__ */ React.createElement(GuitarFigure, { w: 110, h: 52 })), /* @__PURE__ */ React.createElement("span", { className: "hand" }, "\u5728\u7FFB\u66F2\u5E93\u2026\u2026")) : total === 0 ? /* @__PURE__ */ React.createElement("div", { className: "search-empty-note loop" }, /* @__PURE__ */ React.createElement(Tape, { w: 60, rot: -2.5, style: { top: -9, left: "50%", marginLeft: -30 } }), /* @__PURE__ */ React.createElement("p", null, "\u8FD9\u5BB6 live house \u6CA1\u627E\u5230\u8FD9\u9996\u66F2\u5B50\u3002"), /* @__PURE__ */ React.createElement("span", { className: "hand" }, "\u6362\u4E2A\u8BCD\u8BD5\u8BD5\uFF0C\u6216\u8005\u53BB\u6F2B\u6E38\u968F\u4FBF\u542C\u542C\u3002"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-soft btn-sm", onClick: () => {
    onClose();
    setPage("wander");
  } }, "\u53BB\u8FF7\u8DEF\u6F2B\u6E38", /* @__PURE__ */ React.createElement(IconArrowRight, { size: 14 }))) : tab === "track" ? /* @__PURE__ */ React.createElement("div", { className: "sr-list" }, tracks.map((t, i) => {
    const av = t.avail && t.avail[source] || "ok";
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: t.id,
        className: "sr-row" + (av !== "ok" ? " is-dim" : ""),
        onClick: () => {
          tryPlay(t.id, tracks.map((x) => x.id), i);
          onClose();
        }
      },
      /* @__PURE__ */ React.createElement("img", { className: "sr-row__art", src: t.cover, alt: "" }),
      /* @__PURE__ */ React.createElement("span", { className: "sr-row__main" }, /* @__PURE__ */ React.createElement("span", { className: "sr-row__title truncate" }, /* @__PURE__ */ React.createElement(Mark, { text: t.title, q })), /* @__PURE__ */ React.createElement("span", { className: "sr-row__sub truncate" }, /* @__PURE__ */ React.createElement(Mark, { text: t.artist, q }), " \xB7 ", /* @__PURE__ */ React.createElement(Mark, { text: t.album, q }))),
      /* @__PURE__ */ React.createElement(SourceDots, { avail: t.avail }),
      /* @__PURE__ */ React.createElement("span", { className: "sr-row__dur num" }, fmt(t.dur))
    );
  })) : tab === "artist" ? /* @__PURE__ */ React.createElement("div", { className: "sr-artists" }, artists.map((a) => {
    const own = TRACKS.filter((t) => t.artist === a);
    return /* @__PURE__ */ React.createElement("button", { key: a, className: "sr-artist", onClick: () => {
      playAt(own.map((t) => t.id), 0);
      onClose();
    } }, /* @__PURE__ */ React.createElement("span", { className: "sr-artist__avatar" }, a.slice(0, 1)), /* @__PURE__ */ React.createElement("span", { className: "sr-artist__name truncate" }, /* @__PURE__ */ React.createElement(Mark, { text: a, q })), /* @__PURE__ */ React.createElement("span", { className: "meta" }, own.length, " \u9996 \xB7 ", own[0].album));
  })) : tab === "album" ? /* @__PURE__ */ React.createElement("div", { className: "sr-list" }, albums.map((r) => /* @__PURE__ */ React.createElement("button", { key: r.id, className: "sr-row", onClick: () => {
    onClose();
    setPage("discover");
  } }, /* @__PURE__ */ React.createElement("img", { className: "sr-row__art", src: r.cover, alt: "" }), /* @__PURE__ */ React.createElement("span", { className: "sr-row__main" }, /* @__PURE__ */ React.createElement("span", { className: "sr-row__title truncate" }, /* @__PURE__ */ React.createElement(Mark, { text: r.title, q })), /* @__PURE__ */ React.createElement("span", { className: "sr-row__sub truncate" }, /* @__PURE__ */ React.createElement(Mark, { text: r.band, q }), " \xB7 ", r.kind)), /* @__PURE__ */ React.createElement("span", { className: "sr-row__tag" }, TRACKS.filter((t) => t.release === r.id).length, " \u9996")))) : /* @__PURE__ */ React.createElement("div", { className: "sr-list" }, lists.map((p) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: p.src + p.id,
      className: "sr-row",
      onClick: () => {
        onClose();
        setPage("playlists");
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "sr-row__art sr-row__art--art" }, /* @__PURE__ */ React.createElement(TrackArt, { id: p.src + p.id, size: 40, radius: 9 })),
    /* @__PURE__ */ React.createElement("span", { className: "sr-row__main" }, /* @__PURE__ */ React.createElement("span", { className: "sr-row__title truncate" }, /* @__PURE__ */ React.createElement(Mark, { text: p.name, q })), /* @__PURE__ */ React.createElement("span", { className: "sr-row__sub truncate" }, p.tracks.length, " \u9996 \xB7 ", SOURCES[p.src].name)),
    /* @__PURE__ */ React.createElement("span", { className: "sr-row__tag", style: { color: SOURCES[p.src].tone } }, SOURCES[p.src].short)
  )))), /* @__PURE__ */ React.createElement("div", { className: "search-overlay__foot" }, /* @__PURE__ */ React.createElement("span", { className: "meta" }, "\u7ED3\u679C\u5168\u90E8\u4E3A\u865A\u6784\u6F14\u793A\u6570\u636E \xB7 \u97F3\u6E90\u6807\u7B7E\u8868\u793A\u54EA\u5BB6\u6536\u5F55\u4E86\u8FD9\u9996"), /* @__PURE__ */ React.createElement("span", { className: "meta" }, "Esc \u5173\u95ED"))));
}
Object.assign(window, { SearchOverlay, Mark, SourceDots });
