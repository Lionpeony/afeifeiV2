import type { AppState, StageLayer } from "../../../../contracts/index.js";
import type { StageViewProps } from "./types.js";
import { LAYER_KEYS, PRESETS, VISUAL_MODES, VISUAL_MODE_NAMES } from "./presets.js";
import { dispatch } from "../../../kernel/index.js";

export function StageSettings({
  state,
  exportTheme,
  importTheme,
  findLyric,
}: Pick<StageViewProps, "exportTheme" | "importTheme" | "findLyric"> & { state: AppState }) {
  const { player, stage } = state;
  const offset = state.lyrics.offsets[player.trackId ?? ""] ?? 0;
  const relayer = (layer: StageLayer): void => dispatch({ type: "stage/toggleLayer", layer });
  return <div className="st-menu" role="dialog" aria-label="播放页视图设置">
    <div className="st-menu-row"><span className="lbl">预设</span><div className="st-presets">
      {PRESETS.map((preset) => <button key={preset.id} type="button" className={preset.id === stage.preset ? "on" : ""} onClick={() => {
        dispatch({ type: "stage/setPreset", preset: preset.id });
        dispatch({ type: "stage/setLyricRenderer", renderer: preset.lyricRenderer });
      }}>{preset.name}</button>)}
    </div></div>
    <div className="st-menu-row"><span className="lbl">歌词</span><select value={stage.lyricRenderer} onChange={(event) => dispatch({ type: "stage/setLyricRenderer", renderer: event.target.value as typeof stage.lyricRenderer })}>
      <option value="press">印刷</option><option value="karaoke">逐字</option><option value="minimal">单行</option><option value="theatrical">剧场</option>
    </select></div>
    <div className="st-menu-row"><span className="lbl">校准</span>
      <button type="button" title="歌词整体提前 0.25 秒" disabled={!player.trackId} onClick={() => player.trackId && dispatch({ type: "lyric/nudgeOffset", trackId: player.trackId, deltaMs: -250 })}>−0.25s</button>
      <button type="button" title="重置这一首的校准" disabled={!player.trackId || offset === 0} onClick={() => player.trackId && dispatch({ type: "lyric/resetOffset", trackId: player.trackId })}>{offset === 0 ? "对齐" : `${offset > 0 ? "+" : "−"}${(Math.abs(offset) / 1000).toFixed(2)}s`}</button>
      <button type="button" title="歌词整体延后 0.25 秒" disabled={!player.trackId} onClick={() => player.trackId && dispatch({ type: "lyric/nudgeOffset", trackId: player.trackId, deltaMs: 250 })}>+0.25s</button>
    </div>
    <div className="st-menu-row"><span className="lbl">时间轴</span><input type="range" min={-10000} max={10000} step={250} value={offset} disabled={!player.trackId} aria-label="歌词时间轴整体偏移" onChange={(event) => {
      if (player.trackId) dispatch({ type: "lyric/nudgeOffset", trackId: player.trackId, deltaMs: Number(event.target.value) - offset });
    }} /></div>
    <div className="st-menu-row"><span className="lbl">词源</span><button type="button" title="搜一版别的歌词" disabled={!player.trackId} onClick={findLyric}>换一份…</button></div>
    <div className="st-menu-row"><span className="lbl">译文</span><label><input type="checkbox" checked={stage.translation} onChange={() => dispatch({ type: "stage/setTranslation", on: !stage.translation })} />双语并排</label></div>
    <div className="st-menu-row"><span className="lbl">图层</span>{LAYER_KEYS.filter((key) => key !== "cover" && key !== "controls").map((key) => <label key={key}><input type="checkbox" checked={stage.layers[key]} onChange={() => relayer(key)} />{key === "wallpaper" ? "壁纸" : key === "visual" ? "频谱" : "歌词"}</label>)}</div>
    <div className="st-menu-row"><span className="lbl">视觉</span><div className="st-presets">{VISUAL_MODES.map((mode) => <button key={mode} type="button" className={mode === stage.visualMode ? "on" : ""} disabled={!stage.layers.visual} onClick={() => dispatch({ type: "stage/setVisualMode", mode })}>{VISUAL_MODE_NAMES[mode]}</button>)}</div></div>
    <div className="st-menu-row"><span className="lbl">封面</span><label><input type="checkbox" checked={stage.coverCarousel} onChange={() => dispatch({ type: "stage/setCarousel", on: !stage.coverCarousel })} />3D 轮播</label></div>
    <div className="st-menu-row"><span className="lbl">动效</span><select value={stage.intensity} onChange={(event) => dispatch({ type: "stage/setIntensity", intensity: Number(event.target.value) as 0 | 1 | 2 })}><option value={0}>关</option><option value={1}>标准</option><option value={2}>全部</option></select></div>
    <div className="st-menu-row"><span className="lbl">主题包</span><button type="button" onClick={() => void importTheme().catch(() => undefined)}>导入</button><button type="button" onClick={() => void exportTheme()}>导出</button>{stage.customTokens ? <button type="button" className="on" onClick={() => dispatch({ type: "stage/setTheme", tokens: null })}>清除导入</button> : null}</div>
  </div>;
}
