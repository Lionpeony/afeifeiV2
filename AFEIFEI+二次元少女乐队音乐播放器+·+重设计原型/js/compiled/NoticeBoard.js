function NoticeBoard() {
  const { goTo, currentId, playing, struckId, setPage, openPlayer, plays } = useApp();
  const total = SETLIST_TODAY.reduce((s, id) => s + TRACK_MAP[id].dur, 0);
  return /* @__PURE__ */ React.createElement("div", { className: "page", "data-screen-label": "\u516C\u544A\u5899" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 10 } }, "\u6392\u7EC3\u5BA4 B1 \xB7 \u90A3\u5757\u767D\u677F"), /* @__PURE__ */ React.createElement("h1", { className: "display" }, "\u4ECA\u665A\u7684 ", /* @__PURE__ */ React.createElement("span", { className: "marker" }, "setlist")), /* @__PURE__ */ React.createElement("p", { className: "body", style: { marginTop: 10, maxWidth: 440 } }, "\u4E09\u4E2A\u4EBA\uFF0C\u56DB\u5341\u5206\u949F\uFF0C\u5148\u8FD9\u6837\u6392\u5427\u3002\u7B2C\u56DB\u9996\u8FD8\u6CA1\u5B9A\uFF0C\u770B\u73B0\u573A\u3002")), /* @__PURE__ */ React.createElement("div", { className: "page-head__aside" }, /* @__PURE__ */ React.createElement("div", { className: "row gap8" }, /* @__PURE__ */ React.createElement("span", { className: "chip chip--tag" }, "5 \u9996"), /* @__PURE__ */ React.createElement("span", { className: "chip chip--tag" }, Math.round(total / 60), " \u5206\u949F"), /* @__PURE__ */ React.createElement("span", { className: "chip chip--tag", style: { color: "var(--coral)", borderColor: "rgba(198,42,63,.3)" } }, "\u672A\u5B8C\u6210 2")), /* @__PURE__ */ React.createElement("span", { className: "hand", style: { fontSize: 12, color: "var(--text-3)" } }, "\u4ECA\u5929\u5DF2\u7ECF\u542C\u4E86 ", Object.values(plays).reduce((a, b) => a + b, 0), " \u904D"))), /* @__PURE__ */ React.createElement("div", { className: "board-grid" }, /* @__PURE__ */ React.createElement("div", { className: "setlist-sheet" }, /* @__PURE__ */ React.createElement(Tape, { style: { top: -11, left: "50%", marginLeft: -46 }, w: 92, rot: -2 }), /* @__PURE__ */ React.createElement("div", { className: "setlist-sheet__top" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 6 } }, "SETLIST \xB7 11 / 16"), /* @__PURE__ */ React.createElement("div", { className: "setlist-sheet__title" }, "\u4ECA\u5929\u7684\u987A\u5E8F")), /* @__PURE__ */ React.createElement("div", { className: "setlist-sheet__stamp" }, "\u5185\u90E8\u7528")), /* @__PURE__ */ React.createElement("div", { className: "setlist-col-head" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "#"), /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "\u66F2\u76EE"), /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", { className: "eyebrow", style: { textAlign: "right" } }, "\u65F6\u957F")), SETLIST_TODAY.map((id, i) => {
    const t = TRACK_MAP[id];
    const isCurrent = id === currentId;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: id,
        className: "setlist-row" + (isCurrent ? " is-current" : "") + (struckId === id ? " is-struck" : ""),
        style: enterStyle(i, 40),
        onClick: () => goTo(id)
      },
      /* @__PURE__ */ React.createElement("span", { className: "setlist-row__no" }, String(i + 1).padStart(2, "0")),
      /* @__PURE__ */ React.createElement("span", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { className: "setlist-row__title" }, t.title), /* @__PURE__ */ React.createElement("span", { className: "setlist-row__band" }, t.band, t.note && /* @__PURE__ */ React.createElement("span", { className: "hand", style: { color: "var(--text-3)" } }, " \xB7 ", t.note))),
      /* @__PURE__ */ React.createElement("span", { style: { display: "flex", justifyContent: "flex-end" } }, isCurrent && playing ? /* @__PURE__ */ React.createElement(Bars, null) : /* @__PURE__ */ React.createElement(IconPlay, { size: 13, style: { color: "var(--text-3)" } })),
      /* @__PURE__ */ React.createElement("span", { className: "setlist-row__dur" }, fmt(t.dur)),
      struckId === id && /* @__PURE__ */ React.createElement(Strike, null)
    );
  }), /* @__PURE__ */ React.createElement("div", { className: "setlist-note" }, /* @__PURE__ */ React.createElement("span", { className: "hand" }, "\u2191 \u6309\u8FD9\u4E2A\u987A\u5E8F\uFF0C\u7B2C\u56DB\u9996\u8BB0\u5F97\u7559\u767D\u516B\u5C0F\u8282"), /* @__PURE__ */ React.createElement("i", null))), /* @__PURE__ */ React.createElement("div", { className: "notes-col" }, /* @__PURE__ */ React.createElement("div", { className: "note note--yellow", style: { transform: "rotate(1.2deg)" } }, /* @__PURE__ */ React.createElement("span", { className: "note__pin" }), "\u5F55\u97F3\u7B14\u53C8\u6CA1\u7535\u4E86\u3002", /* @__PURE__ */ React.createElement("br", null), "\u4E0B\u6B21\u6392\u7EC3\u5E26\u4E24\u8282\u7535\u6C60\u3002", /* @__PURE__ */ React.createElement("div", { className: "note__meta" }, "\u2014 \u5468\u4E09 21:40")), /* @__PURE__ */ React.createElement("div", { className: "note note--pink", style: { transform: "rotate(-1.6deg)" } }, "\u8FD9\u4E00\u7248\u526F\u6B4C\u2026\u2026\u518D\u60F3\u60F3\u3002", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { textDecoration: "line-through", textDecorationColor: "rgba(198,42,63,.55)", textDecorationThickness: "2px" } }, "\u592A\u9AD8\u4E86\u5531\u4E0D\u4E0A\u53BB"), /* @__PURE__ */ React.createElement("div", { className: "note__meta" }, "\u2014 \u8D34\u5728\u97F3\u7BB1\u4E0A")), /* @__PURE__ */ React.createElement("div", { className: "note note--mint", style: { transform: "rotate(.8deg)" } }, "\u6563\u573A\u540E\u53BB\u5403\u5173\u4E1C\u716E\u3002", /* @__PURE__ */ React.createElement("br", null), "\u8C01\u5148\u8D70\u8C01\u8BF7\u5BA2\u3002", /* @__PURE__ */ React.createElement("div", { className: "note__meta" }, "\u2014 \u5168\u5458\u540C\u610F")))), /* @__PURE__ */ React.createElement(SectionHead, { note: "\u80F6\u5E26\u8D34\u7684\uFF0C\u522B\u6495", right: /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => setPage("archive") }, "\u5168\u90E8\u6F14\u51FA", /* @__PURE__ */ React.createElement(IconArrowRight, { size: 14 })) }, "\u8D34\u4E0A\u53BB\u7684\u6F14\u51FA\u4F20\u5355"), /* @__PURE__ */ React.createElement("div", { className: "flyers" }, FLYERS.map((f, fi) => {
    const first = TRACKS.find((t) => t.band === f.band);
    return /* @__PURE__ */ React.createElement("div", { key: f.id, style: { position: "relative", ...enterStyle(fi + 2, 55) } }, /* @__PURE__ */ React.createElement(Tape, { w: 64, rot: -3, style: { top: -10, left: "50%", marginLeft: -32 } }), /* @__PURE__ */ React.createElement(
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
  })), /* @__PURE__ */ React.createElement("div", { className: "row gap12", style: { marginTop: 30, justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { className: "hand", style: { fontSize: 12, color: "var(--text-3)" } }, "\u4F20\u5355\u662F\u624B\u7ED8\u7684\uFF0C\u5B57\u6709\u70B9\u6B6A\uFF0C\u522B\u4ECB\u610F\u3002"), /* @__PURE__ */ React.createElement("div", { className: "row gap8" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "\u672C\u5468\u5FAA\u73AF"), /* @__PURE__ */ React.createElement("div", { className: "row gap6" }, TRACKS.slice(0, 3).map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      onClick: () => goTo(t.id),
      title: t.title,
      style: { width: 34, height: 34, borderRadius: 9, overflow: "hidden", boxShadow: "0 2px 8px rgba(61,43,57,.14)" }
    },
    /* @__PURE__ */ React.createElement("img", { src: t.cover, alt: t.title, style: { width: "100%", height: "100%", objectFit: "cover" } })
  ))))));
}
Object.assign(window, { NoticeBoard });
