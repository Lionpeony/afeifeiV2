const QRCode = ({ seed = "afeifei", size = 208 }) => {
  const n = 21;
  const h1 = hashStr(seed);
  const h2 = hashStr(seed + "\xB7afeifei");
  const inFinder = (x, y) => x < 8 && y < 8 || x > n - 9 && y < 8 || x < 8 && y > n - 9;
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue;
      if (x === 6 || y === 6) {
        if ((x + y) % 2 === 0) cells.push([x, y]);
        continue;
      }
      const a = h1 >>> (x * 7 + y * 11) % 31 & 1;
      const b = h2 >>> (x * 13 + y * 5) % 29 & 1;
      if (a ^ b) cells.push([x, y]);
    }
  }
  const Finder = ({ fx, fy }) => /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { x: fx, y: fy, width: "7", height: "7", rx: "1.6" }), /* @__PURE__ */ React.createElement("rect", { x: fx + 1, y: fy + 1, width: "5", height: "5", fill: "#fff" }), /* @__PURE__ */ React.createElement("rect", { x: fx + 2, y: fy + 2, width: "3", height: "3" }));
  return /* @__PURE__ */ React.createElement("svg", { className: "qr", width: size, height: size, viewBox: "-2 -2 25 25", role: "img", "aria-label": "\u6A21\u62DF\u4E8C\u7EF4\u7801" }, /* @__PURE__ */ React.createElement("rect", { x: "-2", y: "-2", width: "25", height: "25", fill: "#fff" }), /* @__PURE__ */ React.createElement("g", { fill: "#2E2028" }, cells.map(([x, y], i) => /* @__PURE__ */ React.createElement("rect", { key: i, x, y, width: "1", height: "1" })), /* @__PURE__ */ React.createElement(Finder, { fx: 0, fy: 0 }), /* @__PURE__ */ React.createElement(Finder, { fx: n - 7, fy: 0 }), /* @__PURE__ */ React.createElement(Finder, { fx: 0, fy: n - 7 })));
};
const SCAN_QP = new URLSearchParams(location.search);
const SCAN_STEPS = [
  { key: "wait", label: "\u6253\u5F00\u624B\u673A\u626B\u4E00\u626B", hint: "\u626B\u5DE6\u8FB9\u8FD9\u5F20\u7968\u4E0A\u7684\u7801" },
  { key: "scanned", label: "\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u767B\u5F55", hint: "\u624B\u673A\u4E0A\u4F1A\u5F39\u4E00\u4E2A\u786E\u8BA4" },
  { key: "ok", label: "\u6B4C\u5355\u548C\u63A8\u8350\u540C\u6B65\u8FC7\u6765", hint: "\u5927\u6982\u4E24\u79D2\u949F" }
];
function ScanLogin() {
  const { loginSrc, closeScan, linkAccount, accounts, reduce, onoma, toast } = useApp();
  const src = loginSrc ? SOURCES[loginSrc] : null;
  const forced = SCAN_QP.get("scanstate");
  const [state, setState] = React.useState(forced || "wait");
  const [mode, setMode] = React.useState(SCAN_QP.get("scanmode") === "code" ? "code" : "qr");
  const [code, setCode] = React.useState("");
  const timers = React.useRef([]);
  React.useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState(forced || "wait");
    setMode(SCAN_QP.get("scanmode") === "code" ? "code" : "qr");
    setCode("");
    if (!loginSrc || forced) return;
    if (accounts[loginSrc]) return;
    timers.current.push(setTimeout(() => {
      setState((s) => s === "wait" ? "scanned" : s);
      if (window.Sound) Sound.pluck();
    }, 2e3));
    return () => timers.current.forEach(clearTimeout);
  }, [loginSrc]);
  React.useEffect(() => {
    if (state !== "ok" || SCAN_QP.get("scanstate")) return;
    const t = setTimeout(() => closeScan(), 1500);
    return () => clearTimeout(t);
  }, [state, closeScan]);
  if (!loginSrc) return null;
  const confirm = () => {
    setState("ok");
    linkAccount(loginSrc);
    onoma("\u30DD\u30F3\u30C3", { tone: "coral", x: window.innerWidth / 2 + 120, y: window.innerHeight / 2 - 60 });
  };
  const stepIndex = state === "wait" ? 0 : state === "scanned" ? 1 : 3;
  return /* @__PURE__ */ React.createElement("div", { className: "scan-ov", role: "dialog", "aria-modal": "true", "aria-label": "\u767B\u5F55" + src.name, onClick: closeScan }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "scan" + (state === "ok" ? " is-ok" : "") + (mode === "code" ? " is-code" : ""),
      onClick: (e) => e.stopPropagation()
    },
    /* @__PURE__ */ React.createElement("span", { className: "scan__strip", "aria-hidden": "true" }),
    /* @__PURE__ */ React.createElement("span", { className: "scan__hole", "aria-hidden": "true" }),
    /* @__PURE__ */ React.createElement("div", { className: "scan__head" }, /* @__PURE__ */ React.createElement("span", { className: "scan__brand" }, /* @__PURE__ */ React.createElement("b", null, "AFEIFEI"), /* @__PURE__ */ React.createElement("span", null, "FAN CLUB \xB7 \u4F1A\u5458\u767B\u8BB0")), /* @__PURE__ */ React.createElement("span", { className: "scan__no" }, "No.", String(hashStr(src.id + "no") % 9e3 + 1e3))),
    /* @__PURE__ */ React.createElement("div", { className: "scan__body" + (mode === "code" ? " is-code" : "") }, /* @__PURE__ */ React.createElement("div", { className: "scan__qrbox" }, /* @__PURE__ */ React.createElement("div", { className: "scan__qr" + (state === "ok" ? " is-done" : "") }, /* @__PURE__ */ React.createElement("div", { className: "scan__corners", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null)), /* @__PURE__ */ React.createElement(QRCode, { seed: src.id + "\xB7" + src.account + "\xB7afeifei", size: 196 }), state !== "ok" && /* @__PURE__ */ React.createElement("span", { className: "scan__laser", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "scan__mark", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(IconPick, { size: 34 }))), state === "ok" && /* @__PURE__ */ React.createElement("span", { className: "scan__stamp" }, "\u5DF2\u767B\u8BB0"), /* @__PURE__ */ React.createElement("span", { className: "scan__qrfoot hand" }, state === "ok" ? "\u767B\u8BB0\u5B8C\u6210 \xB7 \u7535\u5B50\u7968\u5DF2\u5B58" : "\u626B\u4E0D\u51FA\u4E1C\u897F\uFF0C\u5B83\u662F\u753B\u51FA\u6765\u7684")), /* @__PURE__ */ React.createElement("div", { className: "scan__side" }, /* @__PURE__ */ React.createElement("span", { className: "scan__eyebrow" }, mode === "qr" ? "\u626B\u7801\u767B\u5F55" : "\u9A8C\u8BC1\u7801\u767B\u5F55"), /* @__PURE__ */ React.createElement("h2", { className: "scan__title", style: { color: src.tone } }, src.name), /* @__PURE__ */ React.createElement("span", { className: "scan__account" }, src.account), mode === "qr" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("ol", { className: "scan__steps" }, SCAN_STEPS.map((st, i) => /* @__PURE__ */ React.createElement(
      "li",
      {
        key: st.key,
        className: "scan__step" + (i < stepIndex ? " is-done" : i === stepIndex ? " is-now" : "")
      },
      /* @__PURE__ */ React.createElement("span", { className: "scan__step-no" }, i < stepIndex ? /* @__PURE__ */ React.createElement(IconCheck, { size: 11 }) : i + 1),
      /* @__PURE__ */ React.createElement("span", { className: "scan__step-text" }, /* @__PURE__ */ React.createElement("b", null, st.label), /* @__PURE__ */ React.createElement("span", null, st.hint))
    ))), /* @__PURE__ */ React.createElement("div", { className: "scan__foot" }, state === "ok" ? /* @__PURE__ */ React.createElement("span", { className: "scan__ok" }, /* @__PURE__ */ React.createElement(IconCheck, { size: 14 }), "\u540C\u6B65\u5B8C\u6210 \xB7 \u6B4C\u5355 5 \u4E2A / \u6BCF\u65E5\u63A8\u8350 33 \u9996") : state === "scanned" ? /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm scan__confirm", onClick: confirm }, /* @__PURE__ */ React.createElement(IconCheck, { size: 13 }), "\u6A21\u62DF\u5728\u624B\u673A\u4E0A\u786E\u8BA4") : /* @__PURE__ */ React.createElement("span", { className: "scan__waiting" }, /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("span", { className: "hand" }, "\u7B49\u7740\u624B\u673A\u626B\u8FC7\u53BB\u2026")))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", { className: "scan__tip" }, "\u6536\u4E00\u6761\u77ED\u4FE1\u9A8C\u8BC1\u7801\uFF0C\u4F5C\u7528\u8DDF\u626B\u7801\u4E00\u6837\uFF0C\u53EA\u662F\u5C11\u4E86\u90A3\u5F20\u7968\u3002"), /* @__PURE__ */ React.createElement("div", { className: "scan__code" }, [0, 1, 2, 3].map((i) => /* @__PURE__ */ React.createElement("span", { key: i, className: "scan__cell" + (code.length === i ? " is-focus" : "") + (code[i] ? " is-fill" : "") }, code[i] || "")), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "scan__codeinput",
        value: code,
        inputMode: "numeric",
        autoFocus: true,
        onChange: (e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
          setCode(v);
          if (v.length === 4) setTimeout(confirm, 220);
        },
        "aria-label": "\u56DB\u4F4D\u9A8C\u8BC1\u7801"
      }
    )), /* @__PURE__ */ React.createElement("span", { className: "scan__tip hand" }, "\u968F\u4FBF\u6309\u56DB\u4E2A\u6570\u5B57\u5C31\u5F53\u4F60\u6536\u5230\u4E86")), /* @__PURE__ */ React.createElement("div", { className: "scan__switch" }, /* @__PURE__ */ React.createElement("button", { className: "scan__link", onClick: () => setMode((m) => m === "qr" ? "code" : "qr") }, mode === "qr" ? "\u626B\u7801\u4E0D\u65B9\u4FBF\uFF1F\u7528\u9A8C\u8BC1\u7801" : "\u8FD8\u662F\u626B\u7801\u5427")))),
    /* @__PURE__ */ React.createElement("div", { className: "scan__perf", "aria-hidden": "true" }),
    /* @__PURE__ */ React.createElement("div", { className: "scan__footbar" }, /* @__PURE__ */ React.createElement("span", { className: "scan__note" }, "\u539F\u578B\u5185\u7684\u767B\u5F55\u662F\u6A21\u62DF\u7684\uFF0C\u4E0D\u4F1A\u8FDE\u5230\u5E73\u53F0\u3002"), /* @__PURE__ */ React.createElement("button", { className: "scan__close", onClick: closeScan }, "\u6536\u8D77", /* @__PURE__ */ React.createElement(IconX, { size: 12 })))
  ));
}
Object.assign(window, { QRCode, ScanLogin });
