import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../../../contracts/index.js";
import { dispatch } from "../../../kernel/index.js";
import { PRESETS } from "./presets.js";
import { sampleCoverTint } from "./tint-client.js";
import { StageRoot } from "./StageRoot.js";
import { StageMainLayout } from "./StageMainLayout.js";
import { StageSettings } from "./StageSettings.js";
import { ImmersiveView } from "./ImmersiveView.js";
import { useStageData } from "./useStageData.js";
import { useStageLyrics } from "./useStageLyrics.js";
import { useStageVisuals } from "./useStageVisuals.js";
import { useMachiScene } from "./useMachiScene.js";
import type { StageViewProps } from "./types.js";

export type { StageViewProps } from "./types.js";

export function StageView(props: StageViewProps) {
  const { state, cover, spectrum, exportTheme, importTheme, durationMs, findLyric } = props;
  const { player, stage } = state;
  const preset = PRESETS.find((item) => item.id === stage.preset) ?? PRESETS[0];
  const rootRef = useRef<HTMLElement>(null);
  const [immersive, setImmersive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const data = useStageData(state, cover);
  const lyric = useStageLyrics(stage.lyricRenderer);
  const machi = useMachiScene({
    enabled: stage.layers.visual && stage.visualMode === "machi",
    track: data.nowTrack ?? null,
    doc: lyric.doc,
    paused: player.status !== "playing",
    config: stage,
    coverUrl: data.coverUrl,
    spectrum,
  });
  const visuals = useStageVisuals({
    rootRef,
    enabled: stage.layers.visual,
    mode: stage.visualMode,
    preset: stage.preset,
    intensity: stage.intensity,
    spectrum,
    machi: { setTime: machi.setTime, setPower: machi.setPower },
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && immersive) setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive]);
  useEffect(() => {
    if (!data.coverUrl) return;
    let active = true;
    sampleCoverTint(data.coverUrl, (tint) => {
      if (active && tint) rootRef.current?.style.setProperty("--stage-tint", tint);
    });
    return () => { active = false; };
  }, [data.coverUrl]);

  const playTrack = (id: string): void => dispatch({ type: "player/play", trackId: id, trackTitle: data.tracksMap.get(id)?.title ?? null });
  return <StageRoot state={state} wallPaperUrl={data.coverUrl} rootRef={rootRef} onMouseMove={visuals.onMouseMove}>
    {stage.layers.wallpaper ? <div className={`st-wallpaper ${preset.wallpaperFromCover ? "from-cover" : ""}`} /> : null}
    {stage.layers.visual && stage.visualMode === "machi" ? <div ref={machi.host} className="st-machi" aria-hidden="true" /> : null}
    {stage.layers.visual && stage.visualMode !== "machi" ? <canvas className="st-spectrum" width={480} height={120} data-mode={stage.visualMode} /> : null}
    <StageMainLayout state={state} data={data} lyric={lyric} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} onImmersive={() => setImmersive(true)} />
    {menuOpen ? <StageSettings state={state} exportTheme={exportTheme} importTheme={importTheme} findLyric={findLyric} /> : null}
    {immersive ? <ImmersiveView state={state} title={data.nowTitle} artist={data.nowArtist} album={data.nowAlbum} source={data.sourceName} duration={durationMs()} playing={player.status === "playing"} coverUrl={data.coverUrl} doc={lyric.doc} lineIndex={lyric.lineIndex} lyricNote={lyric.note} tracks={data.tracksMap} covers={data.queueCovers} upNext={data.upNext} nextIndices={data.nextIndices} playOrder={data.playOrder} onExit={() => setImmersive(false)} onPlayTrack={playTrack} /> : null}
  </StageRoot>;
}
