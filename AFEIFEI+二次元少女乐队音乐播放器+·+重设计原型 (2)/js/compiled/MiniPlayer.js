function MiniPlayer() {
  const {
    track,
    playing,
    setPlaying,
    pos,
    setPos,
    userSkip,
    shuffle,
    toggleShuffle,
    repeat,
    setRepeat,
    liked,
    toggleLike,
    volume,
    setVolume,
    openPlayer,
    onomaAt,
    setPage,
    lyricsBar,
    setLyricsBar,
    setMiniMode,
    source,
    quality,
    setStudio,
    sleep,
    sleepLeft,
    muted,
    toggleMute,
    setDock,
    setDockPin
  } = useApp();
  const [stampTick, setStampTick] = React.useState(0);
  const [flipping, setFlipping] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const seekRef = React.useRef(null);
  const pct = Math.min(100, pos / track.dur * 100);
  const isLiked = liked.includes(track.id);
  const lit = Math.round(volume * 5);
  const seekTo = (e) => {
    const r = seekRef.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * track.dur);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "bar" }, /* @__PURE__ */ React.createElement("div", { className: "bar__left" }, /* @__PURE__ */ React.createElement("button", { className: "bar__cover-btn", onClick: openPlayer, title: "\u5C55\u5F00\u64AD\u653E\u9875" }, /* @__PURE__ */ React.createElement("img", { className: "bar__cover", src: track.cover, alt: "" }), playing && /* @__PURE__ */ React.createElement("span", { className: "bar__cover-glow" })), /* @__PURE__ */ React.createElement("div", { className: "bar__meta" }, /* @__PURE__ */ React.createElement("span", { className: "bar__title truncate" }, track.title), /* @__PURE__ */ React.createElement("span", { className: "bar__artist truncate" }, track.artist, /* @__PURE__ */ React.createElement("span", { className: "bar__src", style: { color: SOURCES[source].tone } }, SOURCES[source].short))), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__heart" + (isLiked ? " is-on" : "") + (flipping ? " is-flipping" : ""),
      onClick: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onomaAt(e.currentTarget, "\u30DD\u30F3\u30C3", "coral");
        if (isLiked) {
          setFlipping(true);
          setTimeout(() => setFlipping(false), 320);
        } else {
          setStampTick((t) => t + 1);
          const mark = document.createElement("span");
          mark.className = "stamp-mark";
          mark.style.left = r.left + r.width / 2 + "px";
          mark.style.top = r.top + r.height / 2 + "px";
          mark.style.position = "fixed";
          mark.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6c4 0 7.8 3.3 7.8 7.4 0 4.6-4.2 8.4-6.6 10.6-.7.6-1.7.6-2.4 0C8.4 18.4 4.2 14.6 4.2 10 4.2 5.9 8 2.6 12 2.6z"/></svg>';
          document.body.appendChild(mark);
          setTimeout(() => mark.remove(), 460);
        }
        toggleLike(track.id);
      },
      title: isLiked ? "\u53D6\u6D88\u559C\u6B22" : "\u559C\u6B22"
    },
    stampTick > 0 && /* @__PURE__ */ React.createElement("span", { key: stampTick, className: "ink-ring" }),
    isLiked ? /* @__PURE__ */ React.createElement(IconHeartFill, { size: 16 }) : /* @__PURE__ */ React.createElement(IconHeart, { size: 16 })
  )), /* @__PURE__ */ React.createElement("div", { className: "bar__center" }, /* @__PURE__ */ React.createElement("div", { className: "bar__ctrls" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__icon" + (shuffle ? " is-on" : ""),
      onClick: (e) => {
        onomaAt(e.currentTarget, "\u30B7\u30E3\u30C3", "mint");
        toggleShuffle();
      },
      title: "\u968F\u673A\u64AD\u653E"
    },
    /* @__PURE__ */ React.createElement(IconShuffle, { size: 16 })
  ), /* @__PURE__ */ React.createElement("button", { className: "bar__icon", onClick: () => userSkip("prev"), title: "\u4E0A\u4E00\u9996" }, /* @__PURE__ */ React.createElement(IconPrev, { size: 17 })), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__play" + (playing ? " is-playing" : ""),
      onClick: () => {
        setPlaying((p) => !p);
        if (window.Sound) Sound.pluck();
      },
      title: playing ? "\u6682\u505C" : "\u64AD\u653E",
      "aria-label": playing ? "\u6682\u505C" : "\u64AD\u653E"
    },
    /* @__PURE__ */ React.createElement(PlayGlyph, { playing, size: 20 })
  ), /* @__PURE__ */ React.createElement("button", { className: "bar__icon", onClick: () => userSkip("next"), title: "\u4E0B\u4E00\u9996" }, /* @__PURE__ */ React.createElement(IconNext, { size: 17 })), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__icon" + (repeat !== "off" ? " is-on" : ""),
      onClick: () => setRepeat((r) => r === "off" ? "all" : r === "all" ? "one" : "off"),
      title: repeat === "off" ? "\u5217\u8868\u5FAA\u73AF" : repeat === "all" ? "\u5355\u66F2\u5FAA\u73AF" : "\u4E0D\u5FAA\u73AF"
    },
    repeat === "one" ? /* @__PURE__ */ React.createElement(IconRepeatOne, { size: 16 }) : /* @__PURE__ */ React.createElement(IconRepeat, { size: 16 })
  )), /* @__PURE__ */ React.createElement("div", { className: "bar__seek" }, /* @__PURE__ */ React.createElement("span", { className: "num bar__time", key: track.id + "-cur" }, fmt(pos)), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "bar__seek-track" + (dragging ? " is-dragging" : ""),
      ref: seekRef,
      onPointerDown: (e) => {
        setDragging(true);
        seekTo(e);
      },
      onPointerMove: (e) => {
        if (dragging) seekTo(e);
      },
      onPointerUp: () => setDragging(false),
      onPointerLeave: () => setDragging(false),
      role: "slider",
      "aria-label": "\u64AD\u653E\u8FDB\u5EA6",
      "aria-valuenow": Math.round(pct)
    },
    /* @__PURE__ */ React.createElement("b", { className: "bar__seek-buffer", style: { width: Math.min(100, pct + (playing ? 14 : 0)) + "%" } }),
    /* @__PURE__ */ React.createElement("i", { style: { width: pct + "%" } }),
    /* @__PURE__ */ React.createElement("span", { className: "bar__seek-knob", style: { left: pct + "%" } })
  ), /* @__PURE__ */ React.createElement("span", { className: "num bar__time bar__time--dim" }, fmt(track.dur)), /* @__PURE__ */ React.createElement("div", { className: "bar__chips" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__chip" + (quality !== "standard" ? " is-hi" : ""),
      onClick: () => setStudio({ tab: "quality" }),
      title: "\u64AD\u653E\u97F3\u8D28\uFF08Q\uFF09"
    },
    (QUALITY_LEVELS.find((q) => q.id === quality) || QUALITY_LEVELS[1]).short
  ), sleep.mode !== "off" && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__chip is-live",
      onClick: () => setStudio({ tab: "sleep" }),
      title: "\u5B9A\u65F6\u5173\u95ED\uFF08T\uFF09"
    },
    /* @__PURE__ */ React.createElement(IconMoon, { size: 10 }),
    sleep.mode === "song" ? "\u66F2\u7EC8" : Math.floor(sleepLeft / 60) + ":" + String(sleepLeft % 60).padStart(2, "0")
  )))), /* @__PURE__ */ React.createElement("div", { className: "bar__right" }, /* @__PURE__ */ React.createElement("div", { className: "vol", title: "\u97F3\u91CF " + Math.round(volume * 100) + "% \xB7 \u6309 M \u9759\u97F3" }, [0, 1, 2, 3, 4].map((i) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: i,
      className: "vol__pick" + (i < lit ? " is-lit" : ""),
      onClick: () => setVolume((i + 1) / 5),
      "aria-label": "\u97F3\u91CF " + (i + 1) * 20 + "%"
    },
    /* @__PURE__ */ React.createElement(IconPick, { size: 11 })
  ))), /* @__PURE__ */ React.createElement("span", { className: "bar__sep" }), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__icon" + (lyricsBar ? " is-on" : ""),
      onClick: () => setLyricsBar((v) => !v),
      title: "\u684C\u9762\u6B4C\u8BCD",
      "aria-pressed": lyricsBar
    },
    /* @__PURE__ */ React.createElement(IconNote, { size: 17 })
  ), /* @__PURE__ */ React.createElement("button", { className: "bar__icon", onClick: () => setMiniMode(true), title: "\u8FF7\u4F60\u6A21\u5F0F" }, /* @__PURE__ */ React.createElement(IconMin, { size: 17 })), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__icon",
      onClick: () => setStudio({ tab: "eq" }),
      title: "\u6392\u7EC3\u5BA4 \xB7 \u5B9A\u65F6 / \u97F3\u8D28 / EQ\uFF08E\uFF09"
    },
    /* @__PURE__ */ React.createElement(IconSettings, { size: 17 })
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "bar__icon",
      onClick: () => {
        setDock((v) => !v);
        setDockPin(true);
      },
      title: "\u5A92\u4F53\u952E\u60AC\u6D6E\u63A7\u5236\uFF08K\uFF09"
    },
    /* @__PURE__ */ React.createElement(IconMax, { size: 16 })
  )));
}
Object.assign(window, { MiniPlayer });
