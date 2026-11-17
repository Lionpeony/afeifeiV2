function Wander() {
  const { track, currentId, playing, setPlaying, userSkip, toggleLike, liked, queueIds, goTo, shuffle, toggleShuffle, source, playAll, setPage } = useApp();
  const [copyIdx, setCopyIdx] = React.useState(0);
  const copies = ["\u8FD8\u5728\u627E\u4ECA\u665A\u7684\u90A3\u9996\u6B4C\uFF1F\u2661", "\u4E0D\u77E5\u9053\u542C\u4EC0\u4E48\u7684\u8BDD\uFF0C\u5C31\u8BA9\u5B83\u81EA\u5DF1\u8D70\u3002", "\u5207\u6B4C\u4E5F\u7B97\u4E00\u79CD\u8D70\u8DEF\u65B9\u5F0F\u3002"];
  React.useEffect(() => {
    setCopyIdx((i) => (i + 1) % copies.length);
  }, [currentId]);
  const idx = queueIds.indexOf(currentId);
  const upcoming = [1, 2, 3].map((k) => queueIds[(idx + k) % queueIds.length]).filter(Boolean).map((id) => TRACK_MAP[id]);
  const isLiked = liked.includes(track.id);
  return /* @__PURE__ */ React.createElement("div", { className: "wander", "data-screen-label": "\u8FF7\u8DEF\u6F2B\u6E38" }, /* @__PURE__ */ React.createElement("span", { className: "wander__glow wander__glow--a" }), /* @__PURE__ */ React.createElement("span", { className: "wander__glow wander__glow--b" }), /* @__PURE__ */ React.createElement("div", { className: "wander__inner" }, /* @__PURE__ */ React.createElement("div", { className: "wander__eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "\u8FF7\u8DEF\u6F2B\u6E38"), /* @__PURE__ */ React.createElement("span", { style: { width: 14, height: 1, background: "var(--line-strong)" } }), /* @__PURE__ */ React.createElement("span", { className: "meta" }, "\u7B2C ", String(idx + 1).padStart(2, "0"), " \u9996 / \u5171 ", queueIds.length, " \u9996")), /* @__PURE__ */ React.createElement("div", { className: "wander__cover-wrap" + (playing ? " loop is-breathing" : "") }, /* @__PURE__ */ React.createElement(Tape, { w: 86, rot: -2.5, style: { top: -11, left: "50%", marginLeft: -43 } }), /* @__PURE__ */ React.createElement(
    "img",
    {
      key: track.id,
      className: "wander__cover",
      src: track.cover,
      alt: track.releaseTitle,
      style: { animation: "artIn .5s var(--ease) both" }
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "wander__badge", title: "\u5F53\u524D\u66F2\u76EE\u7F16\u53F7" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "44", height: "44", fill: "currentColor", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M12 2.6c4 0 7.8 3.3 7.8 7.4 0 4.6-4.2 8.4-6.6 10.6-.7.6-1.7.6-2.4 0C8.4 18.4 4.2 14.6 4.2 10 4.2 5.9 8 2.6 12 2.6z", opacity: ".18" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2.6c4 0 7.8 3.3 7.8 7.4 0 4.6-4.2 8.4-6.6 10.6-.7.6-1.7.6-2.4 0C8.4 18.4 4.2 14.6 4.2 10 4.2 5.9 8 2.6 12 2.6z", fill: "none", stroke: "currentColor", strokeWidth: "1.4" })), /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--coral)" } }, String(idx + 1).padStart(2, "0"))), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "icon-btn",
      onClick: () => setPlaying((p) => !p),
      title: playing ? "\u6682\u505C" : "\u64AD\u653E",
      style: {
        position: "absolute",
        left: "50%",
        bottom: -18,
        transform: "translateX(-50%)",
        width: 44,
        height: 44,
        background: "var(--card)",
        boxShadow: "0 8px 20px rgba(61,43,57,.18)",
        color: "var(--pink-600)"
      }
    },
    playing ? /* @__PURE__ */ React.createElement(IconPause, { size: 18 }) : /* @__PURE__ */ React.createElement(IconPlay, { size: 18 })
  )), /* @__PURE__ */ React.createElement("h1", { key: track.id, className: "wander__title", style: { marginTop: 16, animation: "fadeUp .4s var(--ease) both" } }, track.title), /* @__PURE__ */ React.createElement("div", { className: "wander__band jp" }, track.band, " ", /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.4, margin: "0 4px" } }, "\xB7"), " ", track.releaseTitle), /* @__PURE__ */ React.createElement("div", { className: "wander__actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost", onClick: () => userSkip("next") }, /* @__PURE__ */ React.createElement(IconSkip, { size: 15 }), "\u8DF3\u8FC7\u8FD9\u9996"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn btn-ghost" + (isLiked ? " is-liked" : ""),
      onClick: () => toggleLike(track.id),
      style: isLiked ? { color: "var(--coral)", borderColor: "rgba(198,42,63,.4)" } : void 0
    },
    /* @__PURE__ */ React.createElement(IconPick, { size: 14 }),
    isLiked ? "\u8BB0\u4E0B\u4E86" : "\u8BB0\u4E0B\u6765"
  ), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: () => setPlaying(true) }, /* @__PURE__ */ React.createElement(IconPlay, { size: 14 }), "\u7EE7\u7EED\u542C"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn btn-ghost",
      onClick: () => playAll(queueIds.filter((id) => id !== currentId).slice(0, 12))
    },
    /* @__PURE__ */ React.createElement(IconRefresh, { size: 14 }),
    "\u6362\u4E00\u6279"
  )), /* @__PURE__ */ React.createElement("p", { className: "wander__copy" }, copies[copyIdx]), /* @__PURE__ */ React.createElement("div", { className: "wander__src" }, /* @__PURE__ */ React.createElement(IconCloud, { size: 12 }), /* @__PURE__ */ React.createElement("span", null, "\u6F2B\u6E38\u6765\u6E90\uFF1A", SOURCES[source].name, " \xD7 \u8D26\u53F7\u6B4C\u5355\u4E0E\u6BCF\u65E5\u63A8\u8350")), /* @__PURE__ */ React.createElement("div", { className: "wander__queue" }, /* @__PURE__ */ React.createElement("div", { className: "wander__queue-label" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "\u63A5\u4E0B\u6765"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "chip chip--tag" + (shuffle ? " is-on" : ""),
      style: { marginLeft: 6, cursor: "pointer" },
      onClick: toggleShuffle
    },
    shuffle ? "\u7ED5\u8DEF\u4E2D" : "\u76F4\u7740\u8D70"
  )), /* @__PURE__ */ React.createElement("div", { className: "wander__queue-rows" }, upcoming.map((t, i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: track.id + t.id + i,
      className: "wander__qrow",
      onClick: () => goTo(t.id),
      style: { animationDelay: i * 50 + "ms" }
    },
    /* @__PURE__ */ React.createElement("span", null, String((idx + i + 2) % 100).padStart(2, "0")),
    /* @__PURE__ */ React.createElement("span", { className: "truncate", style: { textAlign: "left" } }, t.title),
    /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--text-3)", fontSize: 10 } }, fmt(t.dur))
  ))))));
}
Object.assign(window, { Wander });
