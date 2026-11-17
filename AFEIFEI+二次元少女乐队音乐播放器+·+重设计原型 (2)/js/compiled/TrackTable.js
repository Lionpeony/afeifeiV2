const TrackTable = ({ ids = [], source, dense, footer, onRemove }) => {
  const {
    currentId,
    playing,
    struckId,
    liked,
    toggleLike,
    onomaAt,
    playAt,
    tryPlay,
    openRowMenu,
    source: curSource
  } = useApp();
  const srcLabel = source || (SOURCES[curSource] ? SOURCES[curSource].name : "");
  return /* @__PURE__ */ React.createElement("div", { className: "tbl" + (dense ? " tbl--dense" : "") }, /* @__PURE__ */ React.createElement("div", { className: "tbl__head" }, /* @__PURE__ */ React.createElement("span", { className: "tbl__c-no" }, "#"), /* @__PURE__ */ React.createElement("span", { className: "tbl__c-title" }, "TITLE"), /* @__PURE__ */ React.createElement("span", { className: "tbl__c-artist" }, "ARTIST"), /* @__PURE__ */ React.createElement("span", { className: "tbl__c-album" }, "ALBUM"), /* @__PURE__ */ React.createElement("span", { className: "tbl__c-time" }, "TIME")), ids.map((id, i) => {
    const t = TRACK_MAP[id];
    if (!t) return null;
    const isCur = id === currentId;
    const isOn = liked.includes(id);
    const av = t.avail && t.avail[curSource] || "ok";
    const dim = av !== "ok";
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: id,
        className: "tbl__row" + (isCur ? " is-current" : "") + (struckId === id ? " is-struck" : "") + (dim ? " is-dim" : ""),
        style: enterStyle(i, 22),
        onClick: () => tryPlay(id, ids, i),
        role: "button",
        tabIndex: 0,
        "aria-label": t.title,
        onKeyDown: (e) => {
          if (e.key === "Enter") tryPlay(id, ids, i);
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "tbl__c-no" }, isCur && playing ? /* @__PURE__ */ React.createElement(Bars, null) : /* @__PURE__ */ React.createElement("span", { className: "num" }, String(i + 1).padStart(2, "0"))),
      /* @__PURE__ */ React.createElement("span", { className: "tbl__c-title" }, /* @__PURE__ */ React.createElement("img", { className: "tbl__cover", src: t.cover, alt: "", loading: "lazy" }), /* @__PURE__ */ React.createElement("span", { className: "tbl__title-text" }, /* @__PURE__ */ React.createElement("span", { className: "tbl__name truncate", title: t.title }, t.title), /* @__PURE__ */ React.createElement("span", { className: "tbl__sub truncate", title: t.artist }, t.artist, srcLabel ? " \xB7 " + srcLabel : "")), dim && /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "tbl__badge" + (av === "vip" ? " is-vip" : ""),
          title: av === "vip" ? "\u8FD9\u5BB6\u8981\u4F1A\u5458\u624D\u80FD\u542C" : "\u8FD9\u9996\u4E0D\u5728\u8FD9\u5BB6 live house \u7684\u66F2\u76EE\u5355\u91CC"
        },
        av === "vip" ? "VIP" : "\u672A\u6536\u5F55"
      )),
      /* @__PURE__ */ React.createElement("span", { className: "tbl__c-artist truncate", title: t.artist }, t.artist),
      /* @__PURE__ */ React.createElement("span", { className: "tbl__c-album truncate", title: t.album }, t.album),
      /* @__PURE__ */ React.createElement("span", { className: "tbl__c-time" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "tbl__heart" + (isOn ? " is-on" : ""),
          onClick: (e) => {
            e.stopPropagation();
            if (!isOn) onomaAt(e.currentTarget, "\u30DD\u30F3\u30C3", "coral");
            toggleLike(id);
          },
          title: "\u559C\u6B22"
        },
        isOn ? /* @__PURE__ */ React.createElement(IconHeartFill, { size: 14 }) : /* @__PURE__ */ React.createElement(IconHeart, { size: 14 })
      ), onRemove && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "tbl__more tbl__rm",
          title: "\u4ECE\u6B4C\u5355\u91CC\u62FF\u6389",
          onClick: (e) => {
            e.stopPropagation();
            onRemove(id);
          }
        },
        /* @__PURE__ */ React.createElement(IconX, { size: 13 })
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "tbl__more",
          title: "\u66F4\u591A\u64CD\u4F5C",
          onClick: (e) => {
            e.stopPropagation();
            openRowMenu(id, e.currentTarget.parentElement.getBoundingClientRect());
          }
        },
        /* @__PURE__ */ React.createElement(IconMore, { size: 15 })
      ), /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(t.dur))),
      struckId === id && /* @__PURE__ */ React.createElement(Strike, null)
    );
  }), footer);
};
Object.assign(window, { TrackTable });
