const QUALITY_LEVELS = [
  { id: "standard", short: "\u6807\u51C6", label: "\u6807\u51C6\u97F3\u8D28", spec: "128 kbps \xB7 MP3", note: "\u6D41\u91CF\u7701\u7740\u70B9\uFF0C\u6392\u7EC3\u5BA4\u91CC\u4E5F\u591F\u7528" },
  { id: "hq", short: "HQ", label: "\u9AD8\u54C1\u8D28", spec: "320 kbps \xB7 MP3", note: "\u9ED8\u8BA4\u6863\uFF0C\u5E95\u9F13\u548C\u8D1D\u65AF\u4E0D\u7CCA\u5728\u4E00\u8D77" },
  { id: "lossless", short: "SQ", label: "\u65E0\u635F", spec: "1411 kbps \xB7 FLAC", note: "\u8033\u8FD4\u91CC\u80FD\u542C\u51FA\u6362\u5F26\u7684\u624B\u611F" },
  { id: "hires", short: "HR", label: "Hi-Res", spec: "24bit / 96kHz", note: "\u53F0\u4FA7\u76D1\u542C\u624D\u7528\u5F97\u4E0A\uFF0C\u6BD4\u8F83\u8D39\u5E26\u5BBD" }
];
const EQ_FREQS = ["60", "240", "1k", "4k", "12k"];
const EQ_PRESETS = [
  { id: "flat", name: "\u5E73\u76F4", bands: [0, 0, 0, 0, 0] },
  { id: "night", name: "\u591C\u7EC3", bands: [-2, -1, 0, 1, 2] },
  { id: "vocal", name: "\u4E3B\u5531", bands: [-1, 0, 2, 1, 0] },
  { id: "bass", name: "\u8D1D\u65AF\u624B", bands: [4, 2, 0, -1, 0] },
  { id: "phones", name: "\u8033\u673A", bands: [1, 0, -1, 1, 2] }
];
const sleepLabel = (mode, minutes) => {
  if (mode === "song") return "\u64AD\u5B8C\u8FD9\u9996\u5C31\u5173\u706F";
  if (mode === "timer") return `${minutes} \u5206\u949F\u540E\u5173\u706F`;
  return "\u6CA1\u6709\u5728\u5012\u8BA1\u65F6";
};
const fmtLeft = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
function EqBand({ value, label, onChange }) {
  const ref = React.useRef(null);
  const drag = React.useRef(false);
  const val = Math.max(-6, Math.min(6, value));
  const pct = (val + 6) / 12 * 100;
  const apply = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const k = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    onChange(Math.round((k * 12 - 6) * 2) / 2);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "eqband" }, /* @__PURE__ */ React.createElement("span", { className: "eqband__val", style: val === 0 ? void 0 : void 0 }, val > 0 ? "+" + val : val), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "eqband__track",
      ref,
      role: "slider",
      tabIndex: 0,
      "aria-label": "\u9891\u6BB5 " + label + " \u8D6B\u5179",
      "aria-valuemin": -6,
      "aria-valuemax": 6,
      "aria-valuenow": val,
      onPointerDown: (e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        apply(e);
      },
      onPointerMove: (e) => {
        if (drag.current) apply(e);
      },
      onPointerUp: () => {
        drag.current = false;
      },
      onPointerCancel: () => {
        drag.current = false;
      },
      onKeyDown: (e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(6, val + 0.5));
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(-6, val - 0.5));
        }
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "eqband__mid" }),
    val >= 0 ? /* @__PURE__ */ React.createElement("span", { className: "eqband__fill", style: { bottom: "50%", height: pct / 2 + "%" } }) : /* @__PURE__ */ React.createElement("span", { className: "eqband__fill", style: { top: "50%", height: (100 - pct) / 2 + "%" } }),
    /* @__PURE__ */ React.createElement("span", { className: "eqband__knob", style: { top: 100 - pct + "%" } })
  ), /* @__PURE__ */ React.createElement("span", { className: "eqband__label" }, label));
}
function StudioDrawer() {
  const {
    studio,
    setStudio,
    sleep,
    startSleep,
    stopSleep,
    sleepLeft,
    quality,
    setQuality,
    eq,
    setEq,
    playing,
    source,
    toast
  } = useApp();
  const [tab, setTab] = React.useState(studio && studio.tab ? studio.tab : "sleep");
  React.useEffect(() => {
    if (studio && studio.tab) setTab(studio.tab);
  }, [studio]);
  React.useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") setStudio(null);
    };
    if (studio) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [studio, setStudio]);
  if (!studio) return null;
  const total = (sleep.minutes || 30) * 60;
  const ratio = sleep.mode === "timer" && total ? Math.max(0, Math.min(100, (1 - sleepLeft / total) * 100)) : 0;
  const setBand = (i) => (v) => {
    const bands = eq.bands.slice();
    bands[i] = v;
    setEq({ preset: "custom", bands });
  };
  const pickPreset = (p) => setEq({ preset: p.id, bands: p.bands.slice() });
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "studio-mask", onClick: () => setStudio(null) }), /* @__PURE__ */ React.createElement("aside", { className: "studio", role: "dialog", "aria-modal": "true", "aria-label": "\u6392\u7EC3\u5BA4" }, /* @__PURE__ */ React.createElement("div", { className: "studio__head" }, /* @__PURE__ */ React.createElement("div", { className: "studio__kicker" }, "STUDIO \xB7 \u53F0\u4FA7\u8C03\u97F3"), /* @__PURE__ */ React.createElement("h2", { className: "studio__title" }, "\u6392\u7EC3\u5BA4"), /* @__PURE__ */ React.createElement("button", { className: "icon-btn studio__close", onClick: () => setStudio(null), title: "\u6536\u8D77", "aria-label": "\u6536\u8D77\u6392\u7EC3\u5BA4" }, /* @__PURE__ */ React.createElement(IconX, { size: 16 }))), /* @__PURE__ */ React.createElement("div", { className: "studio__tabs", role: "tablist" }, [["sleep", "\u5B9A\u65F6\u5173\u95ED"], ["quality", "\u97F3\u8D28"], ["eq", "\u5747\u8861\u5668"]].map(([id, label]) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: id,
      role: "tab",
      "aria-selected": tab === id,
      className: "studio__tab" + (tab === id ? " is-on" : ""),
      onClick: () => setTab(id)
    },
    label
  ))), /* @__PURE__ */ React.createElement("div", { className: "studio__body" }, tab === "sleep" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "sleep-now" }, /* @__PURE__ */ React.createElement("div", { className: "sleep-now__ring", style: { "--p": ratio + "%" } }, /* @__PURE__ */ React.createElement("b", null, sleep.mode === "off" ? "--:--" : sleep.mode === "song" ? "\u66F2\u7EC8" : fmtLeft(sleepLeft))), /* @__PURE__ */ React.createElement("div", { className: "sleep-now__text" }, /* @__PURE__ */ React.createElement("b", null, sleepLabel(sleep.mode, sleep.minutes)), /* @__PURE__ */ React.createElement("span", null, sleep.mode === "off" ? "\u6311\u4E00\u4E2A\u65F6\u957F\uFF0C\u5230\u70B9\u6211\u4F1A\u628A\u706F\u5173\u6389\u3002" : "\u8FD8\u5269 " + fmtLeft(sleepLeft) + "\uFF0C\u5230\u70B9\u97F3\u91CF\u5148\u6E10\u5F31\u518D\u6682\u505C\u3002"))), /* @__PURE__ */ React.createElement("div", { className: "studio__label" }, "\u5012\u8BA1\u65F6"), /* @__PURE__ */ React.createElement("div", { className: "sleep-opts" }, [15, 30, 60].map((m) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: m,
      className: "sleep-opt" + (sleep.mode === "timer" && sleep.minutes === m ? " is-on" : ""),
      onClick: () => startSleep(m)
    },
    /* @__PURE__ */ React.createElement("b", null, m, " \u5206\u949F"),
    /* @__PURE__ */ React.createElement("span", null, m === 15 ? "\u7761\u524D\u4E00\u8282" : m === 30 ? "\u4E00\u5F20\u4E13\u8F91" : "\u6574\u573A\u6392\u7EC3")
  )), /* @__PURE__ */ React.createElement("button", { className: "sleep-opt" + (sleep.mode === "song" ? " is-on" : ""), onClick: () => startSleep("song") }, /* @__PURE__ */ React.createElement("b", null, "\u64AD\u5B8C\u8FD9\u9996"), /* @__PURE__ */ React.createElement("span", null, "\u5531\u5B8C\u518D\u5173"))), /* @__PURE__ */ React.createElement("div", { className: "studio__label" }, "\u5F53\u524D"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn btn-sm " + (sleep.mode === "off" ? "btn-ghost" : "btn-soft"),
      onClick: stopSleep,
      disabled: sleep.mode === "off"
    },
    sleep.mode === "off" ? "\u6CA1\u6709\u5728\u5012\u8BA1\u65F6" : "\u53D6\u6D88\u5B9A\u65F6"
  ), /* @__PURE__ */ React.createElement("div", { className: "studio__note" }, /* @__PURE__ */ React.createElement(IconMoon, { size: 13 }), /* @__PURE__ */ React.createElement("span", null, "\u539F\u578B\u5185\u4E0D\u4F1A\u771F\u7684\u5173\u6389\u7CFB\u7EDF\uFF0C\u53EA\u628A\u64AD\u653E\u6682\u505C\u4E00\u6B21\u3002\u771F\u5B9E\u5BA2\u6237\u7AEF\u53EF\u4EE5\u914D\u5408\u7CFB\u7EDF\u7761\u7720\u3002"))), tab === "quality" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "studio__label" }, "\u64AD\u653E\u97F3\u8D28 \xB7 ", SOURCES[source].name), /* @__PURE__ */ React.createElement("div", { className: "q-list" }, QUALITY_LEVELS.map((q) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: q.id,
      className: "q-opt" + (quality === q.id ? " is-on" : ""),
      onClick: () => {
        setQuality(q.id);
        toast(`\u97F3\u8D28\u5207\u5230\u300C${q.label}\u300D`, { icon: "check" });
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "q-opt__badge" }, q.short),
    /* @__PURE__ */ React.createElement("span", { className: "q-opt__text" }, /* @__PURE__ */ React.createElement("b", null, q.label), /* @__PURE__ */ React.createElement("span", null, q.spec, " \xB7 ", q.note)),
    quality === q.id && /* @__PURE__ */ React.createElement(IconCheck, { size: 15, className: "q-opt__tick" })
  ))), /* @__PURE__ */ React.createElement("div", { className: "studio__note" }, /* @__PURE__ */ React.createElement(IconCloud, { size: 13 }), /* @__PURE__ */ React.createElement("span", null, "\u97F3\u8D28\u8DDF\u7740\u97F3\u6E90\u8D70\u3002\u5207\u5230\u6CA1\u767B\u5F55\u7684\u97F3\u6E90\u65F6\uFF0C\u4F1A\u9000\u56DE\u6807\u51C6\u6863\uFF1B\u79BB\u7EBF\u5305\u91CC\u7684\u66F2\u76EE\u6309\u5DF2\u4E0B\u8F7D\u7684\u97F3\u8D28\u64AD\u653E\u3002"))), tab === "eq" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "studio__label" }, "\u9884\u8BBE"), /* @__PURE__ */ React.createElement("div", { className: "eq__presets" }, EQ_PRESETS.map((p) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: p.id,
      className: "eq__preset" + (eq.preset === p.id ? " is-on" : ""),
      onClick: () => pickPreset(p)
    },
    p.name
  ))), /* @__PURE__ */ React.createElement("div", { className: "studio__label" }, "\u9891\u6BB5 \xB7 \u589E\u76CA"), /* @__PURE__ */ React.createElement("div", { className: "eq__stage" }, /* @__PURE__ */ React.createElement("div", { className: "eq__bands" }, EQ_FREQS.map((f, i) => /* @__PURE__ */ React.createElement(EqBand, { key: f, label: f, value: eq.bands[i], onChange: setBand(i) }))), /* @__PURE__ */ React.createElement("div", { className: "eq__meter" + (playing ? " is-live" : ""), "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => /* @__PURE__ */ React.createElement("i", { key: i, style: {
    animationDelay: i * 90 + "ms",
    height: 16 + i * 37 % 60 + "%"
  } })))), /* @__PURE__ */ React.createElement("div", { className: "eq__foot" }, /* @__PURE__ */ React.createElement("span", { className: "hand", style: { fontSize: 12, color: "var(--text-3)" } }, eq.preset === "custom" ? "\u624B\u8C03\u4E2D \xB7 \u53F0\u4FA7\u542C\u89C1\u7684\u4F4E\u97F3\u6BD4\u524D\u6392\u591A\u4E00\u683C" : "\u9884\u8BBE\uFF1A" + (EQ_PRESETS.find((p) => p.id === eq.preset) || {}).name), /* @__PURE__ */ React.createElement("button", { className: "eq__reset", onClick: () => pickPreset(EQ_PRESETS[0]) }, /* @__PURE__ */ React.createElement(IconRefresh, { size: 12 }), "\u91CD\u7F6E")), /* @__PURE__ */ React.createElement("div", { className: "studio__note" }, /* @__PURE__ */ React.createElement(IconVolume, { size: 13 }), /* @__PURE__ */ React.createElement("span", null, "\u539F\u578B\u6CA1\u6709\u771F\u5B9E\u97F3\u9891\u5185\u6838\uFF0C\u63A8\u5B50\u4E0D\u4F1A\u6539\u53D8\u58F0\u97F3\uFF1B\u63A5\u7EBF\u540E\u8FD9\u91CC\u4F1A\u6302\u5230 Web Audio \u7684 BiquadFilter \u94FE\u4E0A\u3002"))))));
}
Object.assign(window, { StudioDrawer, QUALITY_LEVELS, EQ_PRESETS, EQ_FREQS });
