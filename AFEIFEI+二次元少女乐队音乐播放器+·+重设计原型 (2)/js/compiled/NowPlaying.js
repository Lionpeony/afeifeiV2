function NowPlaying() {
  const {
    track,
    playing,
    setPlaying,
    pos,
    setPos,
    userSkip,
    prevTrack,
    shuffle,
    toggleShuffle,
    repeat,
    setRepeat,
    liked,
    toggleLike,
    queueIds,
    goTo,
    setPlayerOpen,
    chorusAt,
    markChorus,
    struckId,
    reduce,
    currentId,
    sheerSide,
    closePlayer,
    playerClosing,
    onoma,
    onomaAt,
    lyricsOn,
    setLyricsOn,
    lyricsFull,
    setKeysOpen,
    keysHintSeen,
    dismissKeysHint
  } = useApp();
  const barRef = React.useRef(null);
  const pressTimer = React.useRef(null);
  const longPressed = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);
  const ratioFromEvent = (e) => {
    const r = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const seek = (e) => {
    const r = ratioFromEvent(e);
    setPos(r * track.dur);
  };
  const onDown = (e) => {
    longPressed.current = false;
    setDragging(true);
    clearTimeout(pressTimer.current);
    const r = ratioFromEvent(e);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      markChorus(r * track.dur);
      if (window.Sound) Sound.ding();
    }, 550);
  };
  const onUp = (e) => {
    clearTimeout(pressTimer.current);
    if (!longPressed.current) seek(e);
    setDragging(false);
  };
  const chorusPct = chorusAt != null ? chorusAt / track.dur * 100 : null;
  const showChorusHint = chorusAt != null && pos >= chorusAt - 8 && pos < chorusAt;
  const acts = React.useMemo(() => {
    if (queueIds.length <= 12) return [queueIds];
    const out = [];
    for (let i = 0; i < queueIds.length; i += 4) out.push(queueIds.slice(i, i + 4));
    return out;
  }, [queueIds]);
  const totalDur = queueIds.reduce((s, id) => s + TRACK_MAP[id].dur, 0);
  const idx = queueIds.indexOf(currentId);
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "np" + (playerClosing ? " np--closing" : "") + (lyricsFull && lyricsOn ? " np--lyrics-full" : ""),
      "data-screen-label": "\u64AD\u653E\u9875",
      role: "dialog",
      "aria-label": "\u64AD\u653E\u9875"
    },
    !reduce && !playerClosing && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "curtain curtain--l" }), /* @__PURE__ */ React.createElement("div", { className: "curtain curtain--r" })),
    !reduce && playerClosing && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "curtain curtain--close curtain--close-l" }), /* @__PURE__ */ React.createElement("div", { className: "curtain curtain--close curtain--close-r" })),
    /* @__PURE__ */ React.createElement("div", { className: "np__top" }, /* @__PURE__ */ React.createElement("button", { className: "np__close", onClick: closePlayer }, /* @__PURE__ */ React.createElement(IconChevronDown, { size: 17 }), "\u6536\u8D77"), /* @__PURE__ */ React.createElement("span", { style: { width: 1, height: 16, background: "var(--line)" } }), /* @__PURE__ */ React.createElement("span", { className: "np__top-label" }, /* @__PURE__ */ React.createElement(IconNote, { size: 13 }), "\u6B63\u5728\u6F14\u51FA \xB7 SETLIST ", String(idx + 1).padStart(2, "0"), " / ", String(queueIds.length).padStart(2, "0")), /* @__PURE__ */ React.createElement("span", { className: "spacer" }), /* @__PURE__ */ React.createElement("button", { className: "np__keysbtn", onClick: () => setKeysOpen(true), title: "\u952E\u76D8\u5FEB\u6377\u952E\u6E05\u5355" }, "\u5FEB\u6377\u952E ", /* @__PURE__ */ React.createElement("kbd", null, "?")), /* @__PURE__ */ React.createElement("span", { className: "meta hand", style: { fontSize: 12 } }, Math.round(totalDur / 60), " \u5206\u949F\u5C31\u6563\u573A")),
    /* @__PURE__ */ React.createElement("div", { className: "np__main" }, /* @__PURE__ */ React.createElement("div", { className: "np__stage" }, /* @__PURE__ */ React.createElement("div", { className: "np__stage-top" }, /* @__PURE__ */ React.createElement("div", { className: "np__art" + (playing ? " loop is-breathing" : "") }, /* @__PURE__ */ React.createElement(Tape, { w: 78, rot: -4, style: { top: -11, left: 34 } }), /* @__PURE__ */ React.createElement("img", { key: track.id, className: "np__art-img", src: track.cover, alt: track.releaseTitle }), /* @__PURE__ */ React.createElement("span", { className: "np__art-badge" }, /* @__PURE__ */ React.createElement(IconPick, { size: 40, style: { position: "absolute", opacity: 0.16 } }), /* @__PURE__ */ React.createElement("b", { style: { position: "relative" } }, String(queueIds.indexOf(currentId) + 1).padStart(2, "0"))), struckId && /* @__PURE__ */ React.createElement("span", { className: "sheer is-on sheer--" + (sheerSide || "r") })), /* @__PURE__ */ React.createElement("div", { className: "np__info" }, /* @__PURE__ */ React.createElement("div", { className: "np__kicker" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, track.band), /* @__PURE__ */ React.createElement("span", { style: { width: 12, height: 1, background: "var(--line-strong)" } }), /* @__PURE__ */ React.createElement("span", { className: "meta" }, track.releaseTitle, " \xB7 ", (/* @__PURE__ */ new Date()).getFullYear())), /* @__PURE__ */ React.createElement("h1", { key: track.id, className: "np__title" }, track.title), /* @__PURE__ */ React.createElement("span", { key: track.id + "-sw", className: "np__title-sweep", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("div", { className: "np__band jp" }, /* @__PURE__ */ React.createElement("span", null, track.band), /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-3)" } }, track.note || "\u4ECA\u665A\u7684\u7B2C\u4E00\u9996")), /* @__PURE__ */ React.createElement("div", { className: "np__progress-wrap" }, showChorusHint && /* @__PURE__ */ React.createElement("span", { className: "np__chorus-hint" }, "\u8981\u6765\u4E86\u2661"), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "np__progress" + (dragging ? " is-dragging" : ""),
        ref: barRef,
        onPointerDown: onDown,
        onPointerUp: onUp,
        onPointerLeave: () => {
          clearTimeout(pressTimer.current);
          setDragging(false);
        },
        onPointerMove: (e) => {
          if (dragging) setPos(ratioFromEvent(e) * track.dur);
        },
        title: "\u70B9\u51FB\u8DF3\u8F6C\uFF0C\u957F\u6309\u6807\u8BB0\u526F\u6B4C\u70B9"
      },
      /* @__PURE__ */ React.createElement("div", { className: "np__progress-track" }, /* @__PURE__ */ React.createElement("div", { className: "np__progress-fill", style: { width: pos / track.dur * 100 + "%" } }), chorusPct != null && /* @__PURE__ */ React.createElement("span", { className: "np__chorus-mark", style: { left: chorusPct + "%" } }, /* @__PURE__ */ React.createElement(IconPick, { size: 13 })), /* @__PURE__ */ React.createElement("span", { className: "np__progress-knob", style: { left: pos / track.dur * 100 + "%" } }))
    ), /* @__PURE__ */ React.createElement("div", { className: "np__times" }, /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--text-2)" } }, fmt(pos)), /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--text-3)" } }, "-", fmt(track.dur - pos)))), /* @__PURE__ */ React.createElement("div", { className: "np__controls" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "np__ctrl" + (shuffle ? " is-on" : ""),
        onClick: (e) => {
          onomaAt(e.currentTarget, "\u30B7\u30E3\u30C3", "mint");
          toggleShuffle();
        },
        title: "\u968F\u673A\uFF08\u7ED5\u8DEF\uFF09"
      },
      /* @__PURE__ */ React.createElement(IconShuffle, { size: 18 })
    ), /* @__PURE__ */ React.createElement("button", { className: "np__ctrl", onClick: () => userSkip("prev"), title: "\u4E0A\u4E00\u9996" }, /* @__PURE__ */ React.createElement(IconPrev, { size: 20 })), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "np__ctrl np__ctrl--main" + (playing ? " is-playing" : ""),
        onClick: () => {
          setPlaying((p) => !p);
          if (window.Sound) Sound.pluck();
        },
        title: playing ? "\u6682\u505C" : "\u64AD\u653E"
      },
      /* @__PURE__ */ React.createElement(PlayGlyph, { playing, size: 22 })
    ), /* @__PURE__ */ React.createElement("button", { className: "np__ctrl", onClick: () => userSkip("next"), title: "\u4E0B\u4E00\u9996" }, /* @__PURE__ */ React.createElement(IconNext, { size: 20 })), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "np__ctrl" + (repeat !== "off" ? " is-on" : ""),
        onClick: () => setRepeat((r) => r === "off" ? "all" : r === "all" ? "one" : "off"),
        title: "\u5FAA\u73AF"
      },
      repeat === "one" ? /* @__PURE__ */ React.createElement(IconRepeatOne, { size: 18 }) : /* @__PURE__ */ React.createElement(IconRepeat, { size: 18 })
    ), /* @__PURE__ */ React.createElement("span", { className: "np__ctrl-sep" }), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "np__ctrl like-btn" + (liked.includes(track.id) ? " is-liked" : ""),
        onClick: (e) => {
          onomaAt(e.currentTarget, "\u30DD\u30F3\u30C3", "coral");
          toggleLike(track.id);
        },
        title: "\u559C\u6B22\uFF08\u76D6\u4E00\u679A\u62E8\u7247\uFF09"
      },
      liked.includes(track.id) ? /* @__PURE__ */ React.createElement(IconPick, { size: 19 }) : /* @__PURE__ */ React.createElement(IconPickOutline, { size: 19 })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "np__ctrl" + (lyricsOn ? " is-on" : ""),
        onClick: () => setLyricsOn((v) => !v),
        title: "\u6B4C\u8BCD\u5B57\u5E55\uFF08ED \u98CE\uFF09",
        "aria-pressed": lyricsOn
      },
      /* @__PURE__ */ React.createElement(IconNote, { size: 18 })
    ), /* @__PURE__ */ React.createElement("span", { className: "meta", style: { marginLeft: 6, color: "var(--text-3)", whiteSpace: "nowrap" } }, "\u957F\u6309\u8FDB\u5EA6\u6761\u6807\u8BB0\u526F\u6B4C")), /* @__PURE__ */ React.createElement("div", { className: "np__stage-note" }, /* @__PURE__ */ React.createElement("span", { className: "hand" }, "\u53F0\u4FA7\u89C6\u89D2 \xB7 \u7B2C\u4E09\u6392\u6709\u4EBA\u5728\u8DDF\u7740\u6253\u62CD\u5B50"), /* @__PURE__ */ React.createElement("span", { className: "np__stage-note__line" })))), /* @__PURE__ */ React.createElement(LyricWall, null)), /* @__PURE__ */ React.createElement("aside", { className: "np__queue" }, /* @__PURE__ */ React.createElement("div", { className: "np__queue-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "np__queue-title" }, "\u4ECA\u665A\u7684\u987A\u5E8F"), /* @__PURE__ */ React.createElement("div", { className: "np__queue-sub" }, acts.length > 1 ? `\u5206 ${acts.length} \u5E55 \xB7 \u6BCF\u5E55\u56DB\u9996` : `${queueIds.length} \u9996 \xB7 \u4E00\u53E3\u6C14\u542C\u5B8C`)), /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--text-3)", marginTop: 4 } }, queueIds.length, " \u9996")), /* @__PURE__ */ React.createElement("div", { className: "np__queue-list scroll" }, /* @__PURE__ */ React.createElement("svg", { className: "qpath", width: "18", height: "100%", viewBox: "0 0 18 600", preserveAspectRatio: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { className: "qpath__straight", d: "M9 0 V600", vectorEffect: "non-scaling-stroke" }), /* @__PURE__ */ React.createElement(
      "path",
      {
        className: "qpath__detour" + (shuffle ? " is-on" : ""),
        d: "M9 0 C-4 40, 22 70, 9 110 S -3 170, 9 210 S 21 280, 9 320 S -3 380, 9 420 S 21 490, 9 530 S -2 580, 9 600",
        vectorEffect: "non-scaling-stroke"
      }
    )), acts.map((group, gi) => /* @__PURE__ */ React.createElement(React.Fragment, { key: gi }, acts.length > 1 && /* @__PURE__ */ React.createElement("div", { className: "act-sep" }, /* @__PURE__ */ React.createElement("span", { className: "act-sep__num" }, ["\u2160", "\u2161", "\u2162", "\u2163", "\u2164", "\u2165"][gi]), /* @__PURE__ */ React.createElement("span", { className: "act-sep__bar act-sep__bar--" + (gi % 3 + 1) })), group.map((id) => {
      const t = TRACK_MAP[id];
      const isCur = id === currentId;
      return /* @__PURE__ */ React.createElement("button", { key: id, className: "qrow" + (isCur ? " is-current" : "") + (struckId === id ? " is-struck" : ""), onClick: () => goTo(id) }, isCur && playing && /* @__PURE__ */ React.createElement("span", { className: "qrow__playing" }, /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null)), !(isCur && playing) && /* @__PURE__ */ React.createElement("span", { className: "qrow__no" }, String(queueIds.indexOf(id) + 1).padStart(2, "0")), /* @__PURE__ */ React.createElement("span", { className: "qrow__title" }, t.title), /* @__PURE__ */ React.createElement("span", { className: "qrow__dur" }, fmt(t.dur)), struckId === id && /* @__PURE__ */ React.createElement(Strike, null));
    })))), /* @__PURE__ */ React.createElement("div", { className: "np__queue-foot" }, /* @__PURE__ */ React.createElement("span", { className: "hand" }, "\u5212\u6389\u7684\u90A3\u9996\u5C31\u522B\u8FD4\u573A\u4E86"), /* @__PURE__ */ React.createElement(IconPickOutline, { size: 13, style: { color: "var(--coral)", opacity: 0.6 } })))),
    !keysHintSeen && !lyricsFull && /* @__PURE__ */ React.createElement("div", { className: "np-hint", role: "status" }, /* @__PURE__ */ React.createElement("span", { className: "np-hint__text" }, /* @__PURE__ */ React.createElement("b", null, "\u952E\u76D8\u4E5F\u5F39\u5F97\u4E86"), /* @__PURE__ */ React.createElement("span", null, "\u64AD\u653E\u9875\u91CC\u8FD9\u4E9B\u952E\u4E00\u76F4\u6709\u6548")), /* @__PURE__ */ React.createElement("span", { className: "np-hint__keys" }, /* @__PURE__ */ React.createElement("kbd", null, "\u7A7A\u683C"), /* @__PURE__ */ React.createElement("kbd", null, "\u2190 \u2192"), /* @__PURE__ */ React.createElement("kbd", null, "Shift+\u2190 \u2192"), /* @__PURE__ */ React.createElement("kbd", null, "?")), /* @__PURE__ */ React.createElement("button", { className: "np-hint__go", onClick: () => {
      setKeysOpen(true);
      dismissKeysHint();
    } }, "\u770B\u5168\u90E8"), /* @__PURE__ */ React.createElement("button", { className: "np-hint__close", onClick: dismissKeysHint, title: "\u77E5\u9053\u4E86", "aria-label": "\u77E5\u9053\u4E86" }, /* @__PURE__ */ React.createElement(IconX, { size: 12 }))),
    /* @__PURE__ */ React.createElement("div", { className: "np__timeline" }, /* @__PURE__ */ React.createElement("span", { className: "np__timeline-label" }, "\u6F14\u51FA\u65F6\u95F4\u7EBF"), /* @__PURE__ */ React.createElement("div", { className: "np__timeline-track" }, queueIds.map((id) => {
      const t = TRACK_MAP[id];
      const isCur = id === currentId;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: id,
          className: "tl-seg" + (isCur ? " is-current" : ""),
          style: { flexGrow: t.dur / 60 },
          onClick: () => goTo(id),
          title: t.title,
          "aria-label": t.title
        }
      );
    })), /* @__PURE__ */ React.createElement("span", { className: "np__timeline-time" }, fmt(pos), " / ", fmt(track.dur)))
  );
}
Object.assign(window, { NowPlaying });
