function LyricWall() {
  const {
    track,
    pos,
    setPos,
    lyricsOn,
    setLyricsOn,
    showTr,
    setShowTr,
    lyricsBar,
    setLyricsBar,
    lyricsFull,
    setLyricsFull,
    reduce
  } = useApp();
  const lines = React.useMemo(() => lyricsFor(track), [track.id]);
  const en = React.useMemo(() => lyricEnFor(track), [track.id]);
  const per = track.dur / lines.length;
  const cur = Math.max(0, Math.min(lines.length - 1, Math.floor(pos / per)));
  const p = Math.max(0, Math.min(1, (pos - cur * per) / per)) * 100;
  const full = !!lyricsFull;
  const rowH = full ? 92 : 58;
  const viewRef = React.useRef(null);
  const [viewH, setViewH] = React.useState(full ? 520 : 272);
  React.useEffect(() => {
    const measure = () => {
      if (viewRef.current) setViewH(viewRef.current.clientHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [full]);
  const totalH = lines.length * rowH;
  const blockMode = totalH <= viewH + rowH * 0.9;
  const offset = blockMode ? Math.round((viewH - totalH) / 2) : viewH / 2 - (cur * rowH + rowH / 2);
  if (!lyricsOn) {
    return /* @__PURE__ */ React.createElement("div", { className: "lw lw--off" }, /* @__PURE__ */ React.createElement("span", { className: "lw--off__text hand" }, "\u5B57\u5E55\u5173\u4E86\uFF0C\u53EA\u5269\u9F13\u70B9\u3002"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-soft btn-sm", onClick: () => setLyricsOn(true) }, /* @__PURE__ */ React.createElement(IconNote, { size: 13 }), "\u6253\u5F00\u6B4C\u8BCD"));
  }
  return /* @__PURE__ */ React.createElement("div", { className: "lw" + (full ? " lw--full" : ""), style: { "--row-h": rowH + "px" } }, /* @__PURE__ */ React.createElement("div", { className: "lw__rail", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { className: "lw__rail-jp" }, "\u53F0\u4FA7\u5B57\u5E55"), /* @__PURE__ */ React.createElement("span", { className: "lw__rail-line" }), /* @__PURE__ */ React.createElement("span", { className: "lw__rail-latin" }, "ED\xA0SUBTITLE")), /* @__PURE__ */ React.createElement("div", { className: "lw__main" }, /* @__PURE__ */ React.createElement("div", { className: "lw__head" }, /* @__PURE__ */ React.createElement("span", { className: "lw__head-title" }, /* @__PURE__ */ React.createElement("b", null, "\u6B4C\u8BCD"), /* @__PURE__ */ React.createElement("span", { className: "lw__head-sub" }, "\u9010\u884C \xB7 \u865A\u6784\u6F14\u793A")), /* @__PURE__ */ React.createElement("div", { className: "lw__tools" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "lw__tool" + (showTr ? " is-on" : ""),
      onClick: () => setShowTr((v) => !v),
      title: "\u8BD1\u6587\u5F00\u5173\uFF08\u6B4C\u8BCD\u4E0B\u9762\u90A3\u884C\u82F1\u6587\uFF09",
      "aria-pressed": showTr
    },
    "\u8BD1"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "lw__tool" + (lyricsBar ? " is-on" : ""),
      onClick: () => setLyricsBar((v) => !v),
      title: "\u684C\u9762\u6B4C\u8BCD",
      "aria-pressed": lyricsBar
    },
    "\u684C\u9762"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "lw__tool" + (full ? " is-on" : ""),
      onClick: () => setLyricsFull(!full),
      title: full ? "\u6536\u8D77\u5927\u6B4C\u8BCD\uFF08Esc\uFF09" : "\u5C55\u5F00\u6210\u5927\u6B4C\u8BCD"
    },
    full ? /* @__PURE__ */ React.createElement(IconMin, { size: 13 }) : /* @__PURE__ */ React.createElement(IconMax, { size: 13 })
  ), /* @__PURE__ */ React.createElement("button", { className: "lw__tool", onClick: () => setLyricsOn(false), title: "\u5173\u6389\u6B4C\u8BCD" }, /* @__PURE__ */ React.createElement(IconX, { size: 13 })))), full && /* @__PURE__ */ React.createElement("div", { className: "lw__fullhead" }, /* @__PURE__ */ React.createElement("img", { src: track.cover, alt: "" }), /* @__PURE__ */ React.createElement("span", { className: "lw__fullhead-text" }, /* @__PURE__ */ React.createElement("b", null, track.title), /* @__PURE__ */ React.createElement("span", null, track.artist, " \xB7 \u53F0\u4FA7\u5B57\u5E55 \xB7 \u7B2C ", cur + 1, " \u53E5")), /* @__PURE__ */ React.createElement("span", { className: "lw__fullhead-hint hand" }, "\u5BF9\u7740\u5B57\u5E55\u5531\uFF0C\u8DD1\u8C03\u4E5F\u6CA1\u4EBA\u7BA1")), /* @__PURE__ */ React.createElement("div", { className: "lw__view", ref: viewRef }, /* @__PURE__ */ React.createElement("span", { className: "lw__spot", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "lw__scroll",
      style: { transform: `translate3d(0,${offset}px,0)`, transition: reduce ? "none" : void 0 }
    },
    lines.map((l, i) => {
      const d = i - cur;
      const isCur = d === 0;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: i,
          className: "lw-line" + (isCur ? " is-cur" : d < 0 ? " is-past" : " is-next"),
          style: { height: rowH + "px" },
          onClick: () => setPos(i * per + 0.1),
          title: "\u4ECE\u8FD9\u91CC\u5F00\u59CB\uFF1A" + l
        },
        /* @__PURE__ */ React.createElement("span", { className: "lw-line__body" }, /* @__PURE__ */ React.createElement("span", { className: "lw-line__jp" }, l, isCur && /* @__PURE__ */ React.createElement("span", { className: "lw-line__fill", style: { "--p": p + "%" }, "aria-hidden": "true" }, l)), showTr && /* @__PURE__ */ React.createElement("span", { className: "lw-line__tr" }, en[i])),
        isCur && /* @__PURE__ */ React.createElement("span", { className: "lw-line__mark", "aria-hidden": "true" }, "\u25C0")
      );
    })
  ), /* @__PURE__ */ React.createElement("span", { className: "lw__mask lw__mask--top", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "lw__mask lw__mask--bottom", "aria-hidden": "true" })), /* @__PURE__ */ React.createElement("div", { className: "lw__foot" }, /* @__PURE__ */ React.createElement("span", { className: "lw__foot-progress" }, /* @__PURE__ */ React.createElement("i", { style: { width: (cur + p / 100) / lines.length * 100 + "%" } })), /* @__PURE__ */ React.createElement("span", { className: "lw__foot-num num" }, cur + 1, " / ", lines.length), /* @__PURE__ */ React.createElement("span", { className: "hand lw__foot-hint" }, "\u70B9\u4E00\u884C\u5C31\u8DF3\u5230\u90A3\u53E5"))));
}
Object.assign(window, { LyricWall });
