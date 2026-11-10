import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../../../contracts/index.js";
import { sampleCoverTint } from "./tint-client.js";
import { StageRoot } from "./StageRoot.js";
import { StageSettings } from "./StageSettings.js";
import { Prism } from "./skins/Prism.js";
import { Proof } from "./skins/Proof.js";
import { Sleeve } from "./skins/Sleeve.js";
import { Turntable } from "./skins/Turntable.js";
import type { SkinProps } from "./skins/registry.js";
import { StyleShelf } from "./skins/StyleShelf.js";
import { useStageData } from "./useStageData.js";
import { useStageLyrics } from "./useStageLyrics.js";
import type { StageViewProps } from "./types.js";

export type { StageViewProps } from "./types.js";

export function StageView(props: StageViewProps) {
  const { state, cover, exportTheme, importTheme, findLyric, durationMs, positionMs, notify, onBack, live = false } = props;
  const { stage } = state;
  const rootRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // 样式库与视图菜单互斥：同时开两个浮层，Esc 该关谁就说不清了
  const [shelfOpen, setShelfOpen] = useState(false);
  const data = useStageData(state, cover);
  const lyric = useStageLyrics(stage.lyricRenderer);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // 全局 keyboard.ts 已处理面板/模态/全屏并 preventDefault，这里只接住它忽略的 Esc
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (shelfOpen) {
        setShelfOpen(false);
        event.preventDefault();
        return;
      }
      if (menuOpen) {
        setMenuOpen(false);
        event.preventDefault();
        return;
      }
      if (onBack) {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, shelfOpen, onBack]);
  useEffect(() => {
    if (!data.coverUrl) return;
    let active = true;
    sampleCoverTint(data.coverUrl, (tint) => {
      if (active && tint) rootRef.current?.style.setProperty("--stage-tint", tint);
    });
    return () => { active = false; };
  }, [data.coverUrl]);

  const skinProps: SkinProps = {
    state,
    data,
    lyric,
    playing: state.player.status === "playing",
    tone: stage.tone,
    lyricOn: stage.layers.lyric,
    live,
    durationMs,
    positionMs,
    spectrum: props.spectrum,
    notify,
    onShelf: () => { setShelfOpen(true); setMenuOpen(false); },
    onView: () => { setMenuOpen(true); setShelfOpen(false); },
    shelfOpen,
    viewOpen: menuOpen,
  };
  const Skin = stage.skin === "sleeve"
    ? Sleeve
    : stage.skin === "turntable"
      ? Turntable
      : stage.skin === "proof"
        ? Proof
        : Prism;

  return <StageRoot state={state} wallPaperUrl={data.coverUrl} rootRef={rootRef} live={live}>
    <Skin key={stage.skin} {...skinProps} />
    {menuOpen ? <StageSettings state={state} live={live} exportTheme={exportTheme} importTheme={importTheme} findLyric={findLyric} onOpenShelf={() => {
      setMenuOpen(false);
      setShelfOpen(true);
    }} /> : null}
    {shelfOpen ? <StyleShelf skin={stage.skin} tone={stage.tone} onClose={() => setShelfOpen(false)} /> : null}
  </StageRoot>;
}
