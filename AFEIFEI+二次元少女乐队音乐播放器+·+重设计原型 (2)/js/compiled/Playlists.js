function Playlists() {
  const {
    source,
    setSource,
    switchSource,
    savedLists,
    saveList,
    playAll,
    setPage,
    liked,
    toast,
    onoma,
    onomaAt,
    myLists,
    setListEditor,
    removeFromMyList,
    focusList,
    setFocusList
  } = useApp();
  const lists = PLAYLISTS[source] || [];
  const [selId, setSelId] = React.useState(() => {
    const want = new URLSearchParams(location.search).get("pl");
    return lists.some((l) => l.id === want) ? want : lists[0].id;
  });
  const [reloading, setReloading] = React.useState(false);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSelId(PLATFORMS_FIRST(source));
  }, [source]);
  const mineId = selId && selId.indexOf("mine:") === 0 ? selId.slice(5) : null;
  const mine = mineId ? myLists.find((l) => l.id === mineId) : null;
  const sel = mine ? null : lists.find((l) => l.id === selId) || lists[0];
  const src = SOURCES[source];
  React.useEffect(() => {
    if (!focusList) return;
    setSelId("mine:" + focusList);
    setFocusList(null);
  }, [focusList, setFocusList]);
  const reload = () => {
    if (reloading) return;
    setReloading(true);
    setTimeout(() => setReloading(false), 460);
  };
  const doImport = () => {
    onoma("\u30DD\u30F3\u30C3", { tone: "mint", x: window.innerWidth * 0.55, y: 200 });
    toast("\u5BFC\u5165\u7A97\u53E3\u662F\u539F\u578B\u5360\u4F4D\uFF0C\u5148\u5F53\u5DF2\u7ECF\u5BFC\u8FDB\u6765\u4E86\u3002", { hand: true });
  };
  return /* @__PURE__ */ React.createElement("div", { className: "page pl", "data-screen-label": "\u6B4C\u5355" }, /* @__PURE__ */ React.createElement("div", { className: "pl__head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 8 } }, "PLAYLISTS \xB7 ", lists.length, " LISTS"), /* @__PURE__ */ React.createElement("h1", { className: "display" }, "\u6B4C\u5355")), /* @__PURE__ */ React.createElement("div", { className: "row gap8" }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: doImport }, /* @__PURE__ */ React.createElement(IconImport, { size: 14 }), "\u5BFC\u5165"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: reload }, /* @__PURE__ */ React.createElement(IconRefresh, { size: 14 }), "\u5237\u65B0"))), /* @__PURE__ */ React.createElement("div", { className: "pl__switch" }, /* @__PURE__ */ React.createElement("div", { className: "src-pill" }, /* @__PURE__ */ React.createElement(PillWipe, null), Object.values(SOURCES).map((s) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: s.id,
      className: "src-pill__btn" + (source === s.id ? " is-on" : ""),
      onClick: (e) => {
        if (source === s.id) return;
        onomaAt(e.currentTarget, "\u30B7\u30E3\u30C3", "mint");
        switchSource(s.id, { scope: "pill", quiet: true });
      }
    },
    s.name
  ))), /* @__PURE__ */ React.createElement("span", { className: "meta" }, lists.length, " \u4E2A\u6B4C\u5355 \xB7 ", src.account), /* @__PURE__ */ React.createElement("span", { className: "meta hand", style: { color: "var(--text-3)" } }, "\u5207\u6362\u97F3\u6E90\u4F1A\u91CD\u65B0\u62C9\u4E00\u6B21\u5217\u8868")), /* @__PURE__ */ React.createElement("div", { className: "pl__grid" + (reloading ? " is-reloading" : "") }, /* @__PURE__ */ React.createElement("aside", { className: "pl__side" }, /* @__PURE__ */ React.createElement("div", { className: "pl__side-label eyebrow" }, "\u6211\u7684\u6B4C\u5355 \xB7 ", myLists.length), /* @__PURE__ */ React.createElement("button", { className: "pl-row pl-row--new", onClick: () => setListEditor({ mode: "new", tracks: [] }) }, /* @__PURE__ */ React.createElement("span", { className: "pl-row__art pl-row__art--new" }, /* @__PURE__ */ React.createElement(IconPlus, { size: 15 })), /* @__PURE__ */ React.createElement("span", { className: "pl-row__text" }, /* @__PURE__ */ React.createElement("span", { className: "pl-row__name" }, "\u65B0\u5EFA\u6B4C\u5355"), /* @__PURE__ */ React.createElement("span", { className: "pl-row__note hand" }, "\u81EA\u5DF1\u6392\u4E00\u7248\u987A\u5E8F"))), myLists.map((l, i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: l.id,
      className: "pl-row" + (selId === "mine:" + l.id ? " is-active" : ""),
      onClick: () => setSelId("mine:" + l.id),
      style: enterStyle(i, 26)
    },
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__art" }, /* @__PURE__ */ React.createElement("img", { className: "pl-row__img", src: COVER[l.cover] || COVER.amp, alt: "" })),
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__text" }, /* @__PURE__ */ React.createElement("span", { className: "pl-row__name truncate" }, l.name), /* @__PURE__ */ React.createElement("span", { className: "pl-row__note truncate hand" }, l.note || "\u8FD8\u6CA1\u5199\u8BF4\u660E")),
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__count num" }, l.tracks.length, " \u9996")
  )), /* @__PURE__ */ React.createElement("div", { className: "pl__side-label eyebrow", style: { marginTop: 18 } }, "\u8D26\u53F7\u6B4C\u5355 \xB7 ", src.short), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "pl-row" + (selId === "__likes" ? " is-active" : ""),
      onClick: () => setPage("likes")
    },
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__art" }, /* @__PURE__ */ React.createElement(IconHeart, { size: 16, style: { color: "var(--pink-600)" } })),
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__name" }, "\u6211\u559C\u6B22\u7684\u97F3\u4E50"),
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__count num" }, liked.length, " \u9996")
  ), lists.map((l, i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: l.id,
      className: "pl-row" + (l.id === selId ? " is-active" : ""),
      onClick: () => setSelId(l.id),
      style: enterStyle(i, 26)
    },
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__art" }, /* @__PURE__ */ React.createElement(TrackArt, { id: source + l.id, size: 38, radius: 8 })),
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__text" }, /* @__PURE__ */ React.createElement("span", { className: "pl-row__name truncate" }, l.name), /* @__PURE__ */ React.createElement("span", { className: "pl-row__note truncate hand" }, l.note)),
    /* @__PURE__ */ React.createElement("span", { className: "pl-row__count num" }, l.tracks.length, " \u9996")
  ))), /* @__PURE__ */ React.createElement("section", { className: "pl__detail paper" }, /* @__PURE__ */ React.createElement(Tape, { w: 70, rot: -2.4, style: { top: -10, left: 30 } }), mine ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "pl__detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "pl__cover" }, /* @__PURE__ */ React.createElement("img", { className: "pl__cover-img", src: COVER[mine.cover] || COVER.amp, alt: "" }), /* @__PURE__ */ React.createElement("span", { className: "pl__cover-tag" }, "\u6211\u7684")), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0, flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "\u672C\u5730\u6B4C\u5355 \xB7 \u81EA\u5DF1\u6392\u7684"), /* @__PURE__ */ React.createElement("h2", { className: "pl__name" }, mine.name), /* @__PURE__ */ React.createElement("div", { className: "meta" }, mine.tracks.length, " \u9996 \xB7 \u5EFA\u4E8E ", new Date(mine.createdAt).getMonth() + 1, " \u6708 \xB7 ", /* @__PURE__ */ React.createElement("span", { className: "hand" }, mine.note || "\u8FD8\u6CA1\u5199\u8BF4\u660E")), /* @__PURE__ */ React.createElement("div", { className: "row gap8", style: { marginTop: 14, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: () => {
    if (!mine.tracks.length) {
      toast("\u8FD9\u5F20\u8FD8\u7A7A\u7740\uFF0C\u5148\u53BB\u6311\u51E0\u9996", { hand: true });
      return;
    }
    playAll(mine.tracks);
  } }, /* @__PURE__ */ React.createElement(IconPlay, { size: 13 }), "\u64AD\u653E\u5168\u90E8"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => setListEditor({ mode: "edit", list: mine }) }, /* @__PURE__ */ React.createElement(IconSettings, { size: 13 }), "\u7F16\u8F91"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => setPage("discover") }, /* @__PURE__ */ React.createElement(IconPlus, { size: 13 }), "\u53BB\u6311\u6B4C")))), mine.tracks.length === 0 ? /* @__PURE__ */ React.createElement(
    EmptySetlist,
    {
      title: "\u8FD9\u5F20\u6B4C\u5355\u8FD8\u7A7A\u7740\u3002",
      sub: "\u5728\u4EFB\u610F\u4E00\u9996\u6B4C\u7684\u300C\u22EF\u300D\u91CC\u9009\u300C\u6536\u85CF\u5230\u6B4C\u5355\u300D\uFF0C\u5C31\u80FD\u4E22\u8FDB\u6765\u3002",
      cta: "\u53BB\u53D1\u73B0\u9875\u6311\u6B4C",
      onGo: () => setPage("discover")
    }
  ) : /* @__PURE__ */ React.createElement(TrackTable, { ids: mine.tracks, onRemove: (id) => {
    removeFromMyList(mine.id, id);
    toast("\u62FF\u6389\u4E86\uFF0C\u6B4C\u8FD8\u5728\u5E93\u91CC", { hand: true });
  } })) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "pl__detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "pl__cover" }, /* @__PURE__ */ React.createElement(TrackArt, { id: source + sel.id, size: 104, radius: 14 }), /* @__PURE__ */ React.createElement("span", { className: "pl__cover-tag" }, src.short)), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0, flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, src.name, " \xB7 \u8D26\u53F7\u6B4C\u5355"), /* @__PURE__ */ React.createElement("h2", { className: "pl__name" }, sel.name), /* @__PURE__ */ React.createElement("div", { className: "meta" }, sel.tracks.length, " \u9996 \xB7 \u5BFC\u5165\u4E8E 11 \u6708 \xB7 ", /* @__PURE__ */ React.createElement("span", { className: "hand" }, sel.note)), /* @__PURE__ */ React.createElement("div", { className: "row gap8", style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: () => playAll(sel.tracks) }, /* @__PURE__ */ React.createElement(IconPlay, { size: 13 }), "\u64AD\u653E\u5168\u90E8"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => {
    saveList(source + sel.id, sel.name);
    onoma("\u30DD\u30F3\u30C3", { tone: "coral", x: window.innerWidth * 0.5, y: 240 });
  } }, savedLists.includes(source + sel.id) ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(IconCheck, { size: 13 }), "\u5DF2\u6536\u85CF") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(IconPlus, { size: 13 }), "\u6536\u85CF\u8FD9\u5F20\u6B4C\u5355"))))), sel.tracks.length === 0 ? /* @__PURE__ */ React.createElement(EmptySetlist, { title: "\u8FD9\u5F20 setlist \u8FD8\u7A7A\u7740\u3002", sub: "\u4ECE\u97F3\u6E90\u90A3\u8FB9\u91CD\u65B0\u5BFC\u5165\u4E00\u6B21\u8BD5\u8BD5\u3002", onGo: reload }) : /* @__PURE__ */ React.createElement(TrackTable, { ids: sel.tracks, source: src.name })))), /* @__PURE__ */ React.createElement("div", { className: "row gap8", style: { marginTop: 20 } }, /* @__PURE__ */ React.createElement(IconCloud, { size: 13, style: { color: "var(--text-3)" } }), /* @__PURE__ */ React.createElement("span", { className: "hand", style: { fontSize: 11.5, color: "var(--text-3)" } }, "\u6B4C\u5355\u6765\u81EA\u4F60\u5728 ", src.name, " \u7684\u8D26\u53F7\uFF1B\u672C\u5730\u53EA\u7F13\u5B58\u5217\u8868\uFF0C\u4E0D\u5B58\u97F3\u9891\u6587\u4EF6\u3002")));
}
function PLATFORMS_FIRST(source) {
  const list = PLAYLISTS[source] || [];
  return list[0] ? list[0].id : "__likes";
}
Object.assign(window, { Playlists });
