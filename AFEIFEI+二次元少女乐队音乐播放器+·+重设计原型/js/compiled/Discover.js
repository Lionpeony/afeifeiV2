function Discover() {
  const { source, accounts, goTo, playAll, playAt, setPage, openPlayer, onoma, setPlaying } = useApp();
  const [mixSeed, setMixSeed] = React.useState(0);
  const [topId, setTopId] = React.useState("L1");
  const [sheer, setSheer] = React.useState(false);
  const [previewAll, setPreviewAll] = React.useState(false);
  const src = SOURCES[source] || SOURCES.netease;
  const mixIds = React.useMemo(() => {
    const n = DAILY_MIX.length;
    if (!mixSeed) return DAILY_MIX;
    return DAILY_MIX.slice(mixSeed % n).concat(DAILY_MIX.slice(0, mixSeed % n));
  }, [mixSeed]);
  const reshuffle = () => {
    if (sheer) return;
    setSheer(true);
    setMixSeed((s) => s + 7);
    setTimeout(() => setSheer(false), 420);
  };
  const top = TOPLISTS.find((t) => t.id === topId) || TOPLISTS[0];
  const today = /* @__PURE__ */ new Date();
  const dayNum = String(today.getDate()).padStart(2, "0");
  const monStr = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][today.getMonth()];
  const weekday = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"][today.getDay()];
  const hot = ["t18", "t22", "t4", "t20", "t9", "t26", "t15", "t30"];
  return /* @__PURE__ */ React.createElement("div", { className: "page disc", "data-screen-label": "\u53D1\u73B0" }, /* @__PURE__ */ React.createElement("div", { className: "disc__head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow disc__eyebrow" }, "DISCOVER \xB7 ", src.name, accounts[source] ? " \xB7 \u5DF2\u767B\u5F55" : " \xB7 \u6F14\u793A\u6570\u636E"), /* @__PURE__ */ React.createElement("h1", { className: "display" }, "\u53D1\u73B0")), /* @__PURE__ */ React.createElement("div", { className: "disc__date", title: "\u4ECA\u5929\u7684\u65E5\u671F" }, /* @__PURE__ */ React.createElement("b", null, dayNum), /* @__PURE__ */ React.createElement("span", null, monStr, /* @__PURE__ */ React.createElement("br", null), weekday))), /* @__PURE__ */ React.createElement("section", { className: "mix" + (sheer ? " is-sheering" : "") }, /* @__PURE__ */ React.createElement("div", { className: "mix__cover" }, /* @__PURE__ */ React.createElement("img", { src: COVER.amp, alt: "" }), /* @__PURE__ */ React.createElement("span", { className: "mix__tag" }, "DAILY MIX"), /* @__PURE__ */ React.createElement("span", { className: "mix__stamp" }, "33")), /* @__PURE__ */ React.createElement("div", { className: "mix__body" }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "DAILY MIX \xB7 \u4ECA\u65E5\u53D1\u884C"), /* @__PURE__ */ React.createElement("h2", { className: "mix__title" }, "\u6BCF\u65E5\u63A8\u8350"), /* @__PURE__ */ React.createElement("div", { className: "mix__meta" }, "\u6765\u81EA ", src.name, " \u8D26\u53F7 \xB7 33 \u9996 \xB7 \u6BCF\u5929 06:00 \u6362\u65B0"), /* @__PURE__ */ React.createElement("div", { className: "row gap10", style: { marginTop: 16 } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: () => {
    playAll(mixIds.slice(0, 12));
    openPlayer();
  } }, /* @__PURE__ */ React.createElement(IconPlay, { size: 14 }), "\u4ECA\u65E5\u5F00\u64AD"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost", onClick: reshuffle }, /* @__PURE__ */ React.createElement(IconRefresh, { size: 14 }), "\u6362\u4E00\u6279")), /* @__PURE__ */ React.createElement("div", { className: "mix__list" }, mixIds.slice(0, 4).map((id, i) => {
    const t = TRACK_MAP[id];
    return /* @__PURE__ */ React.createElement("button", { key: id, className: "mix-row", onClick: () => playAt(mixIds, i) }, /* @__PURE__ */ React.createElement("span", { className: "mix-row__no num" }, String(i + 1).padStart(2, "0")), /* @__PURE__ */ React.createElement("span", { className: "mix-row__title truncate" }, t.title), /* @__PURE__ */ React.createElement("span", { className: "mix-row__artist truncate" }, t.artist), /* @__PURE__ */ React.createElement("span", { className: "mix-row__dur num" }, fmt(t.dur)));
  }))), /* @__PURE__ */ React.createElement("div", { className: "mix__bigdate" }, /* @__PURE__ */ React.createElement("b", null, dayNum), /* @__PURE__ */ React.createElement("span", null, monStr))), /* @__PURE__ */ React.createElement("div", { className: "disc__sect" }, /* @__PURE__ */ React.createElement("h2", { className: "sect-title" }, "\u699C\u5355", /* @__PURE__ */ React.createElement("span", null, "TOPLISTS")), /* @__PURE__ */ React.createElement("div", { className: "row gap10" }, /* @__PURE__ */ React.createElement("span", { className: "meta" }, TOPLISTS.length, " \u4E2A\u699C\u5355"), /* @__PURE__ */ React.createElement("button", { className: "icon-btn", title: "\u5237\u65B0\u699C\u5355", onClick: () => setTopId("L" + (1 + Math.floor(Math.random() * TOPLISTS.length))) }, /* @__PURE__ */ React.createElement(IconRefresh, { size: 15 })))), /* @__PURE__ */ React.createElement("div", { className: "toplists scroll-x" }, TOPLISTS.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      className: "top-card" + (t.id === topId ? " is-active" : ""),
      onClick: () => setTopId(t.id)
    },
    /* @__PURE__ */ React.createElement("span", { className: "top-card__art", style: { background: "linear-gradient(150deg," + t.grad[0] + "," + t.grad[1] + ")" } }, /* @__PURE__ */ React.createElement(IconPick, { size: 15, style: { opacity: 0.5, color: "#fff", position: "relative", zIndex: 1 } }), /* @__PURE__ */ React.createElement("b", null, t.name), /* @__PURE__ */ React.createElement("span", { className: "top-card__no" }, String(TOPLISTS.indexOf(t) + 1).padStart(2, "0"))),
    /* @__PURE__ */ React.createElement("span", { className: "top-card__name" }, t.name),
    /* @__PURE__ */ React.createElement("span", { className: "top-card__count num" }, t.count, " \u9996")
  ))), /* @__PURE__ */ React.createElement("div", { className: "top-preview paper" }, /* @__PURE__ */ React.createElement(Tape, { w: 64, rot: -2, style: { top: -9, left: 26 } }), /* @__PURE__ */ React.createElement("div", { className: "top-preview__head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "h2" }, top.name), /* @__PURE__ */ React.createElement("div", { className: "meta" }, top.count, " \u9996 \xB7 \u6BCF\u6B21\u5237\u65B0\u987A\u5E8F\u90FD\u4F1A\u53D8")), /* @__PURE__ */ React.createElement("button", { className: "btn btn-soft btn-sm", onClick: () => playAll(top.tracks) }, /* @__PURE__ */ React.createElement(IconPlay, { size: 13 }), "\u64AD\u653E\u8FD9\u4E2A\u699C")), /* @__PURE__ */ React.createElement(TrackTable, { ids: previewAll ? top.tracks : top.tracks.slice(0, 6), dense: true }), top.tracks.length > 6 && /* @__PURE__ */ React.createElement("button", { className: "top-preview__more", onClick: () => setPreviewAll((v) => !v) }, previewAll ? "\u6536\u8D77\u8FD9\u4E2A\u699C" : `\u5C55\u5F00\u5168\u90E8 ${top.tracks.length} \u9996`, /* @__PURE__ */ React.createElement(IconArrowRight, { size: 13, style: { transform: previewAll ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform .22s var(--ease)" } }))), /* @__PURE__ */ React.createElement("div", { className: "disc__sect" }, /* @__PURE__ */ React.createElement("h2", { className: "sect-title" }, "\u70ED\u95E8\u63A8\u8350", /* @__PURE__ */ React.createElement("span", null, "HOT TRACKS")), /* @__PURE__ */ React.createElement("span", { className: "hand", style: { fontSize: 11.5, color: "var(--text-3)" } }, "\u8FD9\u5468\u88AB\u641C\u5F97\u6700\u591A\u7684\u51E0\u9996")), /* @__PURE__ */ React.createElement("div", { className: "hot-cards" }, ["t18", "t22"].map((id, i) => {
    const t = TRACK_MAP[id];
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: id,
        className: "hot-card",
        onClick: () => {
          goTo(id);
          openPlayer();
        },
        style: enterStyle(i, 50)
      },
      /* @__PURE__ */ React.createElement("img", { className: "hot-card__img", src: t.cover, alt: "" }),
      /* @__PURE__ */ React.createElement("span", { className: "hot-card__body" }, /* @__PURE__ */ React.createElement("span", { className: "hot-card__kicker" }, "HOT \xB7 ", String(i + 1).padStart(2, "0")), /* @__PURE__ */ React.createElement("span", { className: "hot-card__title" }, t.title), /* @__PURE__ */ React.createElement("span", { className: "hot-card__meta" }, t.artist, " \xB7 ", t.album)),
      /* @__PURE__ */ React.createElement("span", { className: "hot-card__play" }, /* @__PURE__ */ React.createElement(IconPlay, { size: 14 }))
    );
  })), /* @__PURE__ */ React.createElement(TrackTable, { ids: hot, source: src.name }), /* @__PURE__ */ React.createElement("div", { className: "disc__sect" }, /* @__PURE__ */ React.createElement("h2", { className: "sect-title" }, "\u4F20\u5355\u5899", /* @__PURE__ */ React.createElement("span", null, "FLYERS")), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => setPage("archive") }, "\u5168\u90E8\u6F14\u51FA", /* @__PURE__ */ React.createElement(IconArrowRight, { size: 14 }))), /* @__PURE__ */ React.createElement("div", { className: "flyers flyers--compact" }, FLYERS.map((f, fi) => {
    const first = TRACKS.find((t) => t.band === f.band);
    return /* @__PURE__ */ React.createElement("div", { key: f.id, style: { position: "relative", ...enterStyle(fi + 1, 55) } }, /* @__PURE__ */ React.createElement(Tape, { w: 60, rot: -3, style: { top: -9, left: "50%", marginLeft: -30 } }), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "flyer flyer__rot",
        style: { "--rot": f.rot },
        onClick: () => {
          if (first) goTo(first.id);
          openPlayer();
        }
      },
      /* @__PURE__ */ React.createElement("img", { className: "flyer__img", src: f.img, alt: "" }),
      /* @__PURE__ */ React.createElement("span", { className: "flyer__scrim" }),
      /* @__PURE__ */ React.createElement("span", { className: "flyer__halftone" }),
      /* @__PURE__ */ React.createElement("span", { className: "flyer__tag" }, f.tag),
      /* @__PURE__ */ React.createElement("span", { className: "flyer__body" }, /* @__PURE__ */ React.createElement("span", { className: "flyer__kicker", style: { display: "block" } }, f.kicker), /* @__PURE__ */ React.createElement("span", { className: "flyer__title", style: { display: "block", whiteSpace: "pre-line" } }, f.title), /* @__PURE__ */ React.createElement("span", { className: "flyer__meta" }, /* @__PURE__ */ React.createElement("span", null, f.meta[0]), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.5 } }, "/"), /* @__PURE__ */ React.createElement("span", null, f.meta[1])))
    ));
  })), /* @__PURE__ */ React.createElement("div", { className: "row gap8", style: { marginTop: 24 } }, /* @__PURE__ */ React.createElement(IconSparkle, { size: 13, style: { color: "var(--pink-400)" } }), /* @__PURE__ */ React.createElement("span", { className: "hand", style: { fontSize: 11.5, color: "var(--text-3)" } }, "\u63A8\u8350\u4E0E\u699C\u5355\u90FD\u7531\u8D26\u53F7\u90A3\u8FB9\u7684\u6570\u636E\u7B97\uFF0C\u8FD9\u91CC\u53EA\u8D1F\u8D23\u6446\u5F97\u597D\u770B\u3002")));
}
Object.assign(window, { Discover });
