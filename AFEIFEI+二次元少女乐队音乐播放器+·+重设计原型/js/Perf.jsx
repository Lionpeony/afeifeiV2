/* ---------- 帧率表（?perf=1 打开，Ctrl+Shift+F 切换） ---------- */
function PerfHUD() {
  const qp = React.useMemo(() => new URLSearchParams(location.search), []);
  const [open, setOpen] = React.useState(() => qp.get("perf") === "1");
  const [stat, setStat] = React.useState({ fps: 0, worst: 0, jank: 0 });
  const acc = React.useRef({ last: 0, win: [], worst: 0, jank: 0 });

  React.useEffect(() => {
    const fn = e => {
      if (e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const a = acc.current;
    let raf = 0;
    const loop = t => {
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
    /* 每 700ms 汇总一次，避免自己造成重渲染压力 */
    const iv = setInterval(() => {
      const w = a.win;
      const avg = w.reduce((x, y) => x + y, 0) / Math.max(1, w.length);
      setStat({
        fps: Math.round(1000 / Math.max(avg, 1)),
        worst: Math.round(a.worst),
        jank: a.jank
      });
      a.worst = 0;
      a.jank = 0;
    }, 700);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); };
  }, [open]);

  if (!open) return null;
  const tone = stat.fps >= 55 ? "#1E8E5A" : stat.fps >= 40 ? "#B8860B" : "#C62A3F";

  return (
    <div className="perfhud" role="status" aria-live="off">
      <span className="perfhud__fps" style={{ color: tone }}>{stat.fps}<i>fps</i></span>
      <span className="perfhud__row">最慢帧 <b>{stat.worst}ms</b></span>
      <span className="perfhud__row">掉帧 <b>{stat.jank}</b> / 最近 2 秒</span>
      <button className="perfhud__x" onClick={() => setOpen(false)} aria-label="收起帧率表">
        <IconX size={11} />
      </button>
    </div>
  );
}

Object.assign(window, { PerfHUD });
