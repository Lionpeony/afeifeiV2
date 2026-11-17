function LyricsBar() {
  const { track, pos, setLyricsBar, showTr } = useApp();
  const lines = React.useMemo(() => lyricsFor(track), [track.id]);
  const en = React.useMemo(() => lyricEnFor(track), [track.id]);
  const per = track.dur / lines.length;
  const cur = Math.max(0, Math.min(lines.length - 1, Math.floor(pos / per)));
  const p = Math.max(0, Math.min(1, (pos - cur * per) / per)) * 100;
  const KEY = "afeifei:lyricbar";
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  };
  const [box, setBox] = React.useState(() => read());
  const [scale, setScale] = React.useState(() => read().scale || 1);
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef(null);
  const persist = (next) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
    }
  };
  const onDown = (e) => {
    if (e.target.closest("button")) return;
    const r = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.max(8, Math.min(window.innerWidth - d.w - 8, e.clientX - d.dx));
    const y = Math.max(8, Math.min(window.innerHeight - d.h - 8, e.clientY - d.dy));
    setBox({ x, y });
  };
  const onUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setBox((b) => {
      persist({ ...b, scale });
      return b;
    });
  };
  const setSize = (d) => {
    const next = Math.max(0.85, Math.min(1.5, Math.round((scale + d) * 100) / 100));
    setScale(next);
    setBox((b) => {
      persist({ ...b, scale: next });
      return b;
    });
  };
  const style = {
    "--lb-fs": scale,
    left: box.x != null ? box.x + "px" : void 0,
    top: box.x != null ? box.y + "px" : void 0,
    right: box.x != null ? "auto" : void 0,
    bottom: box.x != null ? "auto" : void 0
  };
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "lyricbar" + (dragging ? " is-dragging" : ""),
      style,
      role: "status",
      "aria-label": "\u684C\u9762\u6B4C\u8BCD",
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onUp
    },
    /* @__PURE__ */ React.createElement("span", { className: "lyricbar__grip", title: "\u62D6\u52A8\u6539\u53D8\u4F4D\u7F6E" }, /* @__PURE__ */ React.createElement(IconQueue, { size: 13 })),
    /* @__PURE__ */ React.createElement("span", { className: "lyricbar__badge" }, /* @__PURE__ */ React.createElement(IconNote, { size: 12 }), "\u684C\u9762\u6B4C\u8BCD"),
    /* @__PURE__ */ React.createElement("div", { className: "lyricbar__stage" }, /* @__PURE__ */ React.createElement("span", { className: "lyricbar__cur", key: cur, style: { fontSize: 19 * scale + "px" } }, lines[cur], /* @__PURE__ */ React.createElement("span", { className: "lyricbar__fill", style: { "--p": p + "%", fontSize: 19 * scale + "px" }, "aria-hidden": "true" }, lines[cur])), showTr ? /* @__PURE__ */ React.createElement("span", { className: "lyricbar__tr" }, en[cur]) : /* @__PURE__ */ React.createElement("span", { className: "lyricbar__next" }, lines[cur + 1] || "")),
    /* @__PURE__ */ React.createElement("div", { className: "lyricbar__tools" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setSize(-0.08), title: "\u7F29\u5C0F\u5B57\u53F7" }, "A-"), /* @__PURE__ */ React.createElement("button", { onClick: () => setSize(0.08), title: "\u653E\u5927\u5B57\u53F7" }, "A+")),
    /* @__PURE__ */ React.createElement("button", { className: "lyricbar__close", onClick: () => setLyricsBar(false), title: "\u5173\u95ED\u684C\u9762\u6B4C\u8BCD", "aria-label": "\u5173\u95ED\u684C\u9762\u6B4C\u8BCD" }, /* @__PURE__ */ React.createElement(IconX, { size: 14 }))
  );
}
function MiniCard() {
  const { track, playing, setPlaying, userSkip, pos, setPos, setMiniMode, source, onoma, liked, toggleLike } = useApp();
  const pct = Math.min(100, pos / track.dur * 100);
  return /* @__PURE__ */ React.createElement("div", { className: "mini-stage", "data-screen-label": "\u8FF7\u4F60\u6A21\u5F0F" }, /* @__PURE__ */ React.createElement("div", { className: "mini-stage__wall" }, /* @__PURE__ */ React.createElement("span", { className: "mini-stage__mark" }, "AFEIFEI"), /* @__PURE__ */ React.createElement("span", { className: "mini-stage__hint hand" }, "\u7A97\u53E3\u6536\u62E2\u6210\u4E00\u5F20\u4FBF\u7B7E \xB7 \u70B9\u53F3\u4E0A\u89D2\u5C55\u5F00"), /* @__PURE__ */ React.createElement("span", { className: "mini-stage__note" }, "\u771F\u5B9E\u5BA2\u6237\u7AEF\u4F1A\u6536\u6210\u4E00\u4E2A\u65E0\u8FB9\u6846\u7F6E\u9876\u5C0F\u7A97\uFF1B\u539F\u578B\u5185\u4E3A\u6837\u5F0F\u6F14\u793A\u3002")), /* @__PURE__ */ React.createElement("div", { className: "mini-card", role: "region", "aria-label": "\u8FF7\u4F60\u64AD\u653E\u5668" }, /* @__PURE__ */ React.createElement("button", { className: "mini-card__art", onClick: () => setMiniMode(false), title: "\u5C55\u5F00\u5B8C\u6574\u7A97\u53E3" }, /* @__PURE__ */ React.createElement("img", { src: track.cover, alt: "" }), playing && /* @__PURE__ */ React.createElement("span", { className: "mini-card__glow" })), /* @__PURE__ */ React.createElement("div", { className: "mini-card__body" }, /* @__PURE__ */ React.createElement("span", { className: "mini-card__title truncate" }, track.title), /* @__PURE__ */ React.createElement("span", { className: "mini-card__artist truncate" }, track.artist, /* @__PURE__ */ React.createElement("span", { className: "mini-card__src", style: { color: SOURCES[source].tone } }, SOURCES[source].short))), /* @__PURE__ */ React.createElement("div", { className: "mini-card__ctrl" }, /* @__PURE__ */ React.createElement("button", { onClick: () => userSkip("prev"), title: "\u4E0A\u4E00\u9996", "aria-label": "\u4E0A\u4E00\u9996" }, /* @__PURE__ */ React.createElement(IconPrev, { size: 15 })), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "mini-card__play",
      onClick: () => setPlaying((p) => !p),
      title: playing ? "\u6682\u505C" : "\u64AD\u653E",
      "aria-label": playing ? "\u6682\u505C" : "\u64AD\u653E"
    },
    /* @__PURE__ */ React.createElement(PlayGlyph, { playing, size: 14 })
  ), /* @__PURE__ */ React.createElement("button", { onClick: () => userSkip("next"), title: "\u4E0B\u4E00\u9996", "aria-label": "\u4E0B\u4E00\u9996" }, /* @__PURE__ */ React.createElement(IconNext, { size: 15 })), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        onoma("\u30DD\u30F3\u30C3", { tone: "coral", x: window.innerWidth - 120, y: window.innerHeight - 120 });
        toggleLike(track.id);
      },
      className: liked.includes(track.id) ? "is-on" : "",
      title: "\u559C\u6B22",
      "aria-label": "\u559C\u6B22"
    },
    liked.includes(track.id) ? /* @__PURE__ */ React.createElement(IconHeartFill, { size: 14 }) : /* @__PURE__ */ React.createElement(IconHeart, { size: 14 })
  ), /* @__PURE__ */ React.createElement("button", { onClick: () => setMiniMode(false), title: "\u5C55\u5F00\u5B8C\u6574\u7A97\u53E3", "aria-label": "\u5C55\u5F00\u5B8C\u6574\u7A97\u53E3" }, /* @__PURE__ */ React.createElement(IconMax, { size: 13 }))), /* @__PURE__ */ React.createElement("div", { className: "mini-card__line", title: "\u64AD\u653E\u8FDB\u5EA6" }, /* @__PURE__ */ React.createElement("i", { style: { width: pct + "%" } }))));
}
Object.assign(window, { LyricsBar, MiniCard });
