/* ---------- 换音源：幕间（幕布 + 印章） ---------- */
function SourceSwap() {
  const { srcSwap } = useApp();
  if (!srcSwap || srcSwap.scope === "pill") return null;
  const s = SOURCES[srcSwap.id];
  const phase = srcSwap.phase;

  return (
    <div className={"swap swap--" + phase} aria-hidden="true">
      <span className="swap__half swap__half--l"></span>
      <span className="swap__half swap__half--r"></span>
      <span className="swap__lines"></span>

      <div className="swap__caption">
        <span className="swap__eyebrow">幕间 · INTERLUDE</span>
        <span className="swap__name">
          <i style={{ background: s.tone }}></i>{s.name}
        </span>
        <span className="swap__state">{phase === "open" ? "已经换到这边了" : "换台中…"}</span>
      </div>

      {(phase === "hold" || phase === "open") && (
        <span className="swap__stamp">切り替え</span>
      )}
    </div>
  );
}

/* 顶栏 / 歌单页：同一套幕布语言的缩微版（只盖住胶囊本身） */
function PillWipe() {
  const { srcSwap } = useApp();
  if (!srcSwap || srcSwap.scope !== "pill") return null;
  return (
    <span className={"src-wipe src-wipe--" + srcSwap.phase} aria-hidden="true">
      <i className="src-wipe__l"></i>
      <i className="src-wipe__r"></i>
    </span>
  );
}

Object.assign(window, { SourceSwap, PillWipe });
