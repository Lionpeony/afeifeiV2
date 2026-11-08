import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../../../contracts/index.js";
import { PRESETS } from "./presets.js";
import { sampleCoverTint } from "./tint-client.js";
import { StageRoot } from "./StageRoot.js";
import { StageMainLayout } from "./StageMainLayout.js";
import { StageSettings } from "./StageSettings.js";
import { useStageData } from "./useStageData.js";
import { useStageLyrics } from "./useStageLyrics.js";
import { useStageVisuals } from "./useStageVisuals.js";
import type { StageViewProps } from "./types.js";

export type { StageViewProps } from "./types.js";

export function StageView(props: StageViewProps) {
  const { state, cover, spectrum, exportTheme, importTheme, findLyric, durationMs, positionMs, notify, onBack, live = false } = props;
  const { stage } = state;
  const preset = PRESETS.find((item) => item.id === stage.preset) ?? PRESETS[0];
  const rootRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const data = useStageData(state, cover);
  const lyric = useStageLyrics(stage.lyricRenderer);
  const visuals = useStageVisuals({
    rootRef,
    enabled: stage.layers.visual,
    mode: stage.visualMode,
    preset: stage.preset,
    intensity: stage.intensity,
    spectrum,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // 全局 keyboard.ts 已处理面板/模态/全屏并 preventDefault，这里只接住它忽略的 Esc
      if (event.key !== "Escape" || event.defaultPrevented) return;
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
  }, [menuOpen, onBack]);
  useEffect(() => {
    if (!data.coverUrl) return;
    let active = true;
    sampleCoverTint(data.coverUrl, (tint) => {
      if (active && tint) rootRef.current?.style.setProperty("--stage-tint", tint);
    });
    return () => { active = false; };
  }, [data.coverUrl]);

  return <StageRoot state={state} wallPaperUrl={data.coverUrl} rootRef={rootRef} onMouseMove={visuals.onMouseMove} live={live}>
    {stage.layers.wallpaper ? <div className={`st-wallpaper ${preset.wallpaperFromCover ? "from-cover" : ""}`} /> : null}
    {stage.layers.visual ? <canvas className="st-spectrum" width={480} height={120} data-mode={stage.visualMode} /> : null}
    <StageMainLayout state={state} data={data} lyric={lyric} live={live} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} durationMs={durationMs} positionMs={positionMs} notify={notify} />
    {menuOpen ? <StageSettings state={state} live={live} exportTheme={exportTheme} importTheme={importTheme} findLyric={findLyric} /> : null}
  </StageRoot>;
}
