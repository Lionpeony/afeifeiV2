function PerfHUD() {
  const qp = React.useMemo(() => new URLSearchParams(location.search), []);
  const [open, setOpen] = React.useState(() => qp.get("perf") === "1");
  const [stat, setStat] = React.useState({ fps: 0, worst: 0, jank: 0 });
  const acc = React.useRef({ last: 0, win: [], worst: 0, jank: 0 });
  React.useEffect(() => {
    const fn = (e) => {
      if (e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  React.useEffect(() => {
    if (!open) return;
    const a = acc.current;
    let raf = 0;
    const loop = (t) => {
      if (a.last) {
        const d = t - a.last;
        a.win.push(d);
        if (a.win.length > 120) a.win.shift();
        if (d > 24) a.jank += 1;
        if (d > a.worst) a.worst = d;
      }
      a.last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const iv = setInterval(() => {
      const w = a.win;
      const avg = w.reduce((x, y) => x + y, 0) / Math.max(1, w.length);
      setStat({
        fps: Math.round(1e3 / Math.max(avg, 1)),
        worst: Math.round(a.worst),
        jank: a.jank
      });
      a.worst = 0;
      a.jank = 0;
    }, 700);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [open]);
  if (!open) return null;
  const tone = stat.fps >= 55 ? "#1E8E5A" : stat.fps >= 40 ? "#B8860B" : "#C62A3F";
  return /* @__PURE__ */ React.createElement("div", { className: "perfhud", role: "status", "aria-live": "off" }, /* @__PURE__ */ React.createElement("span", { className: "perfhud__fps", style: { color: tone } }, stat.fps, /* @__PURE__ */ React.createElement("i", null, "fps")), /* @__PURE__ */ React.createElement("span", { className: "perfhud__row" }, "\u6700\u6162\u5E27 ", /* @__PURE__ */ React.createElement("b", null, stat.worst, "ms")), /* @__PURE__ */ React.createElement("span", { className: "perfhud__row" }, "\u6389\u5E27 ", /* @__PURE__ */ React.createElement("b", null, stat.jank), " / \u6700\u8FD1 2 \u79D2"), /* @__PURE__ */ React.createElement("button", { className: "perfhud__x", onClick: () => setOpen(false), "aria-label": "\u6536\u8D77\u5E27\u7387\u8868" }, /* @__PURE__ */ React.createElement(IconX, { size: 11 })));
}
Object.assign(window, { PerfHUD });
