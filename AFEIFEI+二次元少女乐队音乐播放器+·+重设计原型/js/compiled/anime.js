function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const ART_BG = [
  ["#FFE3EC", "#FFC2D6", "#D9CDF6"],
  ["#E6F0FF", "#C9DDF7", "#BFE8E0"],
  ["#FFF3D6", "#FFD9A8", "#F7C7D8"],
  ["#EBE3FF", "#CDBFF2", "#FFD3E2"],
  ["#E2F6EF", "#BFE9DB", "#CFE0FA"]
];
const ART_MOTIF = {
  guitar: /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("path", { d: "M11.6 21.4c0-3.1 2.2-5.4 5.1-5.4 1.7 0 3.2.8 4.1 2.1l8.4-8.4 1.9 1.9-8.4 8.4c.3.9.5 1.8.5 2.8 0 3.1-2.3 5.4-5.2 5.4s-6.4-3.7-6.4-6.8z" }), /* @__PURE__ */ React.createElement("rect", { x: "27.4", y: "6.2", width: "4.6", height: "3", rx: "1.2", transform: "rotate(45 29.7 7.7)" })),
  pick: /* @__PURE__ */ React.createElement("path", { d: "M20 8.5c5 0 9 4.2 9 9.2 0 5.5-5.1 10-8 12.2-.6.4-1.4.4-2 0-2.9-2.2-8-6.7-8-12.2 0-5 4-9.2 9-9.2z" }),
  star: /* @__PURE__ */ React.createElement("path", { d: "M20 7l3.6 7.6 8.4 1-6.2 5.8 1.6 8.3L20 25.8l-7.4 3.9 1.6-8.3L8 15.6l8.4-1z" }),
  note: /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { x: "21.5", y: "7", width: "2.4", height: "18", rx: "1.2" }), /* @__PURE__ */ React.createElement("path", { d: "M23.9 7.4l8.2-2.6v4.4l-8.2 2.6z" }), /* @__PURE__ */ React.createElement("ellipse", { cx: "17.6", cy: "25.4", rx: "4.6", ry: "3.5", transform: "rotate(-18 17.6 25.4)" })),
  tape: /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { x: "6", y: "14", width: "28", height: "10", rx: "2" }), /* @__PURE__ */ React.createElement("rect", { x: "6", y: "16.4", width: "28", height: "1.4", opacity: ".45" }), /* @__PURE__ */ React.createElement("rect", { x: "6", y: "20.4", width: "28", height: "1.4", opacity: ".45" }))
};
const ART_KEYS = ["guitar", "pick", "star", "note", "tape"];
const TrackArt = ({ id, size = 40, radius = 6, className = "" }) => {
  const h = hashStr(id || "x");
  const bg = ART_BG[h % ART_BG.length];
  const gid = "ag" + h % 9973;
  const a = ART_KEYS[(h >>> 3) % 5];
  const b = ART_KEYS[(h >>> 7) % 5];
  const rot = (h >> 5) % 40 - 20;
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      className: "trk-art " + className,
      width: size,
      height: size,
      viewBox: "0 0 40 40",
      style: { borderRadius: radius },
      "aria-hidden": "true"
    },
    /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: gid, x1: "0", y1: "0", x2: "1", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: bg[0] }), /* @__PURE__ */ React.createElement("stop", { offset: "58%", stopColor: bg[1] }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: bg[2] }))),
    /* @__PURE__ */ React.createElement("rect", { width: "40", height: "40", fill: "url(#" + gid + ")" }),
    /* @__PURE__ */ React.createElement("g", { transform: "translate(20 20) rotate(" + rot + ") scale(.92) translate(-20 -20)", fill: "#3D2B39", opacity: ".58" }, ART_MOTIF[a]),
    /* @__PURE__ */ React.createElement("g", { transform: "translate(9 26) scale(.34)", fill: "#3D2B39", opacity: ".34" }, ART_MOTIF[b]),
    /* @__PURE__ */ React.createElement("circle", { cx: "33", cy: "9", r: "3.4", fill: "#fff", opacity: ".5" })
  );
};
const OnomaLayer = ({ items }) => /* @__PURE__ */ React.createElement("div", { className: "onoma-layer", "aria-hidden": "true" }, items.map((o) => /* @__PURE__ */ React.createElement(
  "span",
  {
    key: o.id,
    className: "onoma onoma--" + o.tone,
    style: { left: o.x + "px", top: o.y + "px", "--rot": o.rot + "deg" }
  },
  o.text
)));
const FocusLines = () => /* @__PURE__ */ React.createElement("div", { className: "focus-lines", "aria-hidden": "true" });
const MascotWalk = ({ onEnd, cover }) => {
  React.useEffect(() => {
    const t = setTimeout(onEnd, 9e3);
    return () => clearTimeout(t);
  }, []);
  return /* @__PURE__ */ React.createElement("div", { className: "mascot", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("div", { className: "mascot__fig", title: "\u597D\u50CF\u6709\u4EBA\u8DEF\u8FC7" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 130 132", width: "130", height: "132" }, /* @__PURE__ */ React.createElement("ellipse", { className: "mascot__shadow", cx: "64", cy: "124", rx: "30", ry: "5" }), /* @__PURE__ */ React.createElement("g", { className: "mascot__legs" }, /* @__PURE__ */ React.createElement("rect", { className: "mascot__leg mascot__leg--a", x: "54", y: "96", width: "7", height: "24", rx: "3.5" }), /* @__PURE__ */ React.createElement("rect", { className: "mascot__leg mascot__leg--b", x: "66", y: "96", width: "7", height: "24", rx: "3.5" })), /* @__PURE__ */ React.createElement("path", { className: "mascot__body", d: "M48 76c0-8 7-14 16-14s16 6 16 14v16c0 6-5 10-11 10H59c-6 0-11-4-11-10z" }), /* @__PURE__ */ React.createElement("g", { className: "mascot__arm" }, /* @__PURE__ */ React.createElement("rect", { x: "41", y: "80", width: "6", height: "20", rx: "3", transform: "rotate(14 44 90)" })), /* @__PURE__ */ React.createElement("g", { className: "mascot__head" }, /* @__PURE__ */ React.createElement("circle", { cx: "65", cy: "46", r: "19" }), /* @__PURE__ */ React.createElement("path", { d: "M46 43c1-11 9-18 19-18s18 7 19 18c-4-4-9-6-14-6-6 0-10 2-14 6-3 3-6 4-10 3z" }), /* @__PURE__ */ React.createElement("path", { d: "M47 40c-4 1-7 6-8 12 3 1 6 0 8-2z" })), /* @__PURE__ */ React.createElement("g", { className: "mascot__guitar" }, /* @__PURE__ */ React.createElement("path", { d: "M92 62c7 0 12 5 12 11s-5 11-12 11-12-5-12-11 5-11 12-11z" }), /* @__PURE__ */ React.createElement("rect", { x: "96", y: "34", width: "5", height: "30", rx: "2.5", transform: "rotate(17 98 49)" }), /* @__PURE__ */ React.createElement("rect", { x: "100", y: "28", width: "9", height: "7", rx: "2", transform: "rotate(17 104 31)" })))), /* @__PURE__ */ React.createElement("span", { className: "mascot__tag hand" }, "\u2026\u8DEF\u8FC7"));
};
const LYRIC_SETS = [
  [
    "\u526F\u6B4C\u8FD8\u6CA1\u5199\uFF0C\u5148\u54FC\u7740\u5427",
    "\u548C\u5F26\u7ED5\u4E86\u4E09\u5708\u624D\u6562\u843D\u4E0B",
    "\u7B2C\u4E09\u6392\u6709\u4EBA\u8DDF\u7740\u6253\u62CD\u5B50",
    "\u9EA6\u514B\u98CE\u628A\u6211\u7684\u547C\u5438\u4E5F\u6536\u8FDB\u53BB",
    "\u6563\u573A\u4EE5\u540E\u518D\u7B97\u4ECA\u5929\u7684\u8D26"
  ],
  [
    "\u96E8\u70B9\u6BD4\u9F13\u70B9\u5FEB\u4E86\u534A\u62CD",
    "\u62E8\u7247\u6389\u8FDB\u97F3\u7BB1\u7F1D\u91CC\u6CA1\u627E\u5230",
    "\u8D70\u5ECA\u5C3D\u5934\u7684\u548C\u58F0\u8FD8\u4EAE\u7740",
    "\u5148\u628A\u8FD9\u4E00\u6BB5\u5531\u5B8C\u518D\u8BF4",
    "\u4FBF\u5229\u5E97\u7684\u95E8\u94C3\u66FF\u6211\u6570\u62CD"
  ],
  [
    "\u6392\u7EC3\u5BA4\u7684\u706F\u7184\u4E86\u7B2C\u4E09\u6B21",
    "\u53F0\u8BCD\u5199\u5230\u4E00\u534A\u53C8\u5212\u6389",
    "\u53F0\u4E0B\u6CA1\u6709\u4EBA\u4E5F\u7167\u5E38\u5F00\u573A",
    "\u53CD\u6B63\u660E\u5929\u8FD8\u8981\u518D\u6765\u4E00\u8D9F",
    "\u8FD9\u4E00\u5C0F\u8282\u5148\u7A7A\u7740\u5427"
  ],
  [
    "\u81EA\u52A8\u8D29\u5356\u673A\u4EAE\u7740\u4E0D\u80AF\u7761",
    "\u6CB3\u5824\u7684\u98CE\u628A\u548C\u5F26\u5439\u6563",
    "\u6CA1\u5199\u5B8C\u7684\u90A3\u53E5\u7559\u7ED9\u4ECA\u665A",
    "\u706F\u706D\u4E4B\u524D\u518D\u8BF4\u4E00\u6B21",
    "\u5B89\u53EF\u4E4B\u540E\u8BB0\u5F97\u5173\u706F"
  ]
];
const LYRIC_EN = [
  [
    "Chorus isn't written yet \u2014 humming it first",
    "The chord circled three times before it landed",
    "Someone in the third row keeps the beat",
    "The mic picks up my breathing too",
    "We'll settle today's tab after the lights"
  ],
  [
    "The rain runs half a beat ahead of the drums",
    "A pick slipped into the amp and never came back",
    "The harmony at the end of the hall is still lit",
    "Let's finish this section first",
    "The convenience-store chime counts for me"
  ],
  [
    "The practice-room lights went out a third time",
    "Half a line written, then crossed out",
    "No one in the seats, we open anyway",
    "We'll be back tomorrow regardless",
    "Leave this bar empty for now"
  ],
  [
    "The vending machine stays lit, refusing sleep",
    "The river wind scatters the chords",
    "The unfinished line is saved for tonight",
    "Say it once more before the lights die",
    "Remember to turn off after the encore"
  ]
];
function lyricsFor(track) {
  return LYRIC_SETS[hashStr(track.title + track.band) % LYRIC_SETS.length];
}
function lyricEnFor(track) {
  return LYRIC_EN[hashStr(track.title + track.band) % LYRIC_EN.length];
}
Object.assign(window, { hashStr, TrackArt, OnomaLayer, FocusLines, MascotWalk, lyricsFor, lyricEnFor });
