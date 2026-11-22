/* 换源 = 一次「换景」：和页面/主题同一套纸幕，不再堆拨片、光束、印章。 */
import { useAf } from "./context.js";
import { SceneSwitch, type ScenePhase } from "./SceneSwitch.js";

const PHASE: Record<string, ScenePhase> = { close: "close", hold: "hold", open: "open", sync: "open" };

export function SourceSwap({ stage = false }: { stage?: boolean }) {
  const { srcSwap, sources, reduce } = useAf();
  if (!srcSwap || reduce) return null;
  if (srcSwap.scope === "pill") return null;
  const source = sources.find((x) => x.id === srcSwap.id);
  const tone = source?.tone ?? "var(--pink-600)";
  return (
    <SceneSwitch
      scene={{
        kind: stage ? "stage" : "source",
        phase: PHASE[srcSwap.phase] ?? "close",
        label: source?.name ?? srcSwap.id,
        sub: stage ? "换台 · SOURCE SWAP" : "换台 · 正在接入",
        tone,
        dir: srcSwap.dir,
        /* 顶栏换源只盖主内容区：保留顶栏台标、侧栏和底栏，动效看得见但不打断窗户控制。
           舞台页例外：舞台是整屏场景，换台仍铺满。 */
        inset: srcSwap.scope === "content" && !stage ? "content" : "full",
      }}
    />
  );
}

/** 顶栏/歌单页的小换台：不遮住两个台标，只用音源色的扫描光 + 一层淡色洗幕，
    让「白纸片滑到新台」和「光扫过去」同时发生；不再泛白盖住整个控件。 */
export function PillWipe() {
  const { srcSwap, sources, reduce } = useAf();
  if (!srcSwap || reduce) return null;
  if (srcSwap.scope !== "pill" && srcSwap.scope !== "content") return null;
  if (srcSwap.phase !== "close" && srcSwap.phase !== "hold" && srcSwap.phase !== "open") return null;
  const source = sources.find((x) => x.id === srcSwap.id);
  return (
    <span
      className={"src-wipe src-wipe--" + srcSwap.phase}
      style={{
        ["--src-tone" as string]: source?.tone ?? "var(--pink-600)",
        ["--src-scan-dir" as string]: srcSwap.dir === "l" ? "reverse" : "normal",
      }}
      aria-hidden="true"
    >
      <span className="src-wipe__wash" />
      <i className="src-wipe__scan" />
    </span>
  );
}
