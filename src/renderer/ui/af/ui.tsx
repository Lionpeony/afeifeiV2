/* AFEIFEI 共享小组件 · 从 offline_single/js/ui.jsx 移植 */
import type { CSSProperties, ReactNode } from "react";
import { IconArrowRight, IconCheck, IconPick, IconPickOutline, IconPlay, IconPause } from "./icons.js";

export const Tape = ({ style, w = 64, rot = -2 }: { style?: CSSProperties; w?: number; rot?: number }) => (
  <span className="tape" style={{ width: w, transform: `rotate(${rot}deg)`, ...style }} />
);

export const SectionHead = ({ children, right, note }: { children: ReactNode; right?: ReactNode; note?: string }) => (
  <div className="section-head">
    <h2 className="h2">{children}</h2>
    {note ? <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>{note}</span> : null}
    <span className="section-head__line" />
    {right}
  </div>
);

export const EmptySetlist = ({
  onGo,
  title = "今天还没写 setlist。",
  sub = "空的。先去发现页转转吧。",
  cta = "去发现看看",
}: {
  onGo: () => void;
  title?: string;
  sub?: string;
  cta?: string;
}) => (
  <div className="empty-sheet loop">
    <Tape style={{ top: -9, left: "50%", marginLeft: -36 }} w={72} rot={-3} />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <IconPickOutline size={34} style={{ color: "var(--pink-400)" }} />
      <p>{title}</p>
      <span className="meta">{sub}</span>
      <button className="btn btn-soft btn-sm" onClick={onGo} style={{ marginTop: 4 }}>
        {cta}
        <IconArrowRight size={14} />
      </button>
    </div>
  </div>
);

export const Bars = () => (
  <span className="bars"><i></i><i></i><i></i></span>
);

export const PlayGlyph = ({ playing, size = 19 }: { playing: boolean; size?: number }) => (
  <span className="glyph" style={{ fontSize: size }}>
    <span key={playing ? "p" : "s"} className="glyph__i">
      {playing ? <IconPause size={size} /> : <IconPlay size={size} />}
    </span>
  </span>
);

export const Strike = () => (
  <svg className="strike-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
    <path d="M1 6 C18 3.4 38 8.2 56 5.2 S84 3.6 99 6" />
  </svg>
);

/** 入场 stagger：最多前 6 项，间隔 45ms */
export const enterStyle = (i: number, step = 45): CSSProperties => ({
  animation: "fadeUp .42s var(--ease-out-soft) both",
  animationDelay: Math.min(i, 6) * step + "ms",
});

export const ToastCheck = () => <IconCheck size={15} style={{ color: "var(--pink-600)" }} />;
export const ToastPick = () => <IconPick size={15} className="toast__pick" />;
