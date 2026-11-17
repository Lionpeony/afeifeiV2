function SourceSwap() {
  const { srcSwap } = useApp();
  if (!srcSwap || srcSwap.scope === "pill") return null;
  const s = SOURCES[srcSwap.id];
  const phase = srcSwap.phase;
  return /* @__PURE__ */ React.createElement("div", { className: "swap swap--" + phase, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { className: "swap__half swap__half--l" }), /* @__PURE__ */ React.createElement("span", { className: "swap__half swap__half--r" }), /* @__PURE__ */ React.createElement("span", { className: "swap__lines" }), /* @__PURE__ */ React.createElement("div", { className: "swap__caption" }, /* @__PURE__ */ React.createElement("span", { className: "swap__eyebrow" }, "\u5E55\u95F4 \xB7 INTERLUDE"), /* @__PURE__ */ React.createElement("span", { className: "swap__name" }, /* @__PURE__ */ React.createElement("i", { style: { background: s.tone } }), s.name), /* @__PURE__ */ React.createElement("span", { className: "swap__state" }, phase === "open" ? "\u5DF2\u7ECF\u6362\u5230\u8FD9\u8FB9\u4E86" : "\u6362\u53F0\u4E2D\u2026")), (phase === "hold" || phase === "open") && /* @__PURE__ */ React.createElement("span", { className: "swap__stamp" }, "\u5207\u308A\u66FF\u3048"));
}
function PillWipe() {
  const { srcSwap } = useApp();
  if (!srcSwap || srcSwap.scope !== "pill") return null;
  return /* @__PURE__ */ React.createElement("span", { className: "src-wipe src-wipe--" + srcSwap.phase, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: "src-wipe__l" }), /* @__PURE__ */ React.createElement("i", { className: "src-wipe__r" }));
}
Object.assign(window, { SourceSwap, PillWipe });
