/* ---------- 共享小组件 ---------- */
const Tape = ({ style, w = 64, rot = -2 }) => (
  <span className="tape" style={{ width: w, transform: `rotate(${rot}deg)`, ...style }} />
);

const SectionHead = ({ children, right, note }) => (
  <div className="section-head">
    <h2 className="h2">{children}</h2>
    {note && <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{note}</span>}
    <span className="section-head__line" />
    {right}
  </div>
);

const Toasts = ({ items }) => (
  <div className="toasts" aria-live="polite">
    {items.map(t => (
      <div key={t.id} className={"toast" + (t.hand ? " toast--hand" : "")} style={t.style}>
        {t.icon === "pick" && <IconPick size={15} className="toast__pick" />}
        {t.icon === "check" && <IconCheck size={15} style={{ color: "var(--pink-600)" }} />}
        <span>{t.text}</span>
        {t.action && (
          <button className="toast__act" onClick={t.action.onClick}>{t.action.label}</button>
        )}
      </div>
    ))}
  </div>
);

/* E02 空状态便签 */
const EmptySetlist = ({ onGo, title = "今天还没写 setlist。", sub = "空的。先去发现页转转吧。", cta = "去发现看看" }) => (
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

/* 播放中的三根小柱子 */
const Bars = () => <span className="bars"><i></i><i></i><i></i></span>;

Object.assign(window, { Tape, SectionHead, Toasts, EmptySetlist, Bars });

/* 播放键图标交叉旋转 */
const PlayGlyph = ({ playing, size = 19 }) => (
  <span className="glyph" style={{ fontSize: size }}>
    <span key={playing ? "p" : "s"} className="glyph__i">
      {playing ? <IconPause size={size} /> : <IconPlay size={size} />}
    </span>
  </span>
);

/* 马克笔划掉（SVG 写出） */
const Strike = () => (
  <svg className="strike-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
    <path d="M1 6 C18 3.4 38 8.2 56 5.2 S84 3.6 99 6" />
  </svg>
);

/* 入场 stagger：最多前 6 项，间隔 45ms */
const enterStyle = (i, step = 45) => ({
  animation: "fadeUp .42s var(--ease-out-soft) both",
  animationDelay: Math.min(i, 6) * step + "ms"
});

Object.assign(window, { PlayGlyph, Strike, enterStyle });
