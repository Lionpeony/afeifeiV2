/* 帧率表 · ?perf=1 或 Ctrl+Shift+F（只读合成器帧，不自己开 rAF） */
import { useEffect, useMemo, useRef, useState } from "react";

import { onFrame } from "../compositor.js";
import { IconX } from "./icons.js";

export function PerfHUD() {
  const qp = useMemo(() => new URLSearchParams(location.search), []);
  const [open, setOpen] = useState(() => qp.get("perf") === "1");
  const [stat, setStat] = useState({ fps: 0, worst: 0, jank: 0 });
  const acc = useRef({ win: [] as number[], last: 0, worst: 0, jank: 0 });

  useEffect(() => {
    const fn = (e: KeyboardEvent): void => {
      if (e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  useEffect(() => {
    if (!open) return;
    const a = acc.current;
    a.win = [];
    a.worst = 0;
    a.jank = 0;
    a.last = 0;
    const off = onFrame(() => {
      const t = performance.now();
      if (a.last) {
        const d = t - a.last;
        a.win.push(d);
        if (a.win.length > 120) a.win.shift();
        if (d > 24) a.jank += 1;
        if (d > a.worst) a.worst = d;
      }
      a.last = t;
    });
    let timer = 0;
    const summarize = (): void => {
      const w = a.win;
      const avg = w.reduce((x, y) => x + y, 0) / Math.max(1, w.length);
      setStat({ fps: Math.round(1000 / Math.max(avg, 1)), worst: Math.round(a.worst), jank: a.jank });
      a.worst = 0;
      a.jank = 0;
      timer = window.setTimeout(summarize, 700);
    };
    timer = window.setTimeout(summarize, 700);
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;
  const tone = stat.fps >= 55 ? "#1E8E5A" : stat.fps >= 40 ? "#B8860B" : "#C62A3F";
  return (
    <div className="perfhud" role="status" aria-live="off">
      <span className="perfhud__fps" style={{ color: tone }}>{stat.fps}<i>fps</i></span>
      <span className="perfhud__row">最慢帧 <b>{stat.worst}ms</b></span>
      <span className="perfhud__row">掉帧 <b>{stat.jank}</b> / 最近 2 秒</span>
      <button className="perfhud__x" onClick={() => setOpen(false)} aria-label="收起帧率表"><IconX size={11} /></button>
    </div>
  );
}
