/* 换音源：幕间（幕布 + 印章）与顶栏/歌单页的缩微幕帘。 */
import { useAf } from "./context.js";

export function SourceSwap() {
  const { srcSwap, sources } = useAf();
  if (!srcSwap || srcSwap.scope === "pill") return null;
  const s = sources.find((x) => x.id === srcSwap.id);
  const phase = srcSwap.phase;
  return (
    <div className={"swap swap--" + phase} aria-hidden="true">
      <span className="swap__half swap__half--l"></span>
      <span className="swap__half swap__half--r"></span>

      <div className="swap__caption">
        <span className="swap__eyebrow">幕间 · INTERLUDE</span>
        <span className="swap__name">
          <i style={{ background: s?.tone ?? "var(--pink-600)" }}></i>
          {s?.name ?? srcSwap.id}
        </span>
        <span className="swap__state">{phase === "close" ? "换台中…" : "已经换到这边了"}</span>
      </div>
      {(phase === "hold" || phase === "open") && <span className="swap__stamp">切り替え</span>}
    </div>
  );
}

export function PillWipe() {
  const { srcSwap } = useAf();
  if (!srcSwap || srcSwap.scope !== "pill") return null;
  return (
    <span className={"src-wipe src-wipe--" + srcSwap.phase} aria-hidden="true">
      <i className="src-wipe__l"></i>
      <i className="src-wipe__r"></i>
    </span>
  );
}
