import type { AppState, StageLayer } from "../../../../contracts/index.js";
import type { StageViewProps } from "./types.js";
import { LAYER_KEYS, LIVE_PRESETS, PRESETS, VISUAL_MODES, VISUAL_MODE_NAMES } from "./presets.js";
import { SKINS } from "./skins/registry.js";
import { dispatch } from "../../../kernel/index.js";

export function StageSettings({
  state,
  live,
  exportTheme,
  importTheme,
  findLyric,
  onOpenShelf,
}: Pick<StageViewProps, "exportTheme" | "importTheme" | "findLyric"> & {
  state: AppState;
  live: boolean;
  /** 打开样式库。classic 皮肤没有导播条，这是唯一的换肤入口——不给就切不回去了 */
  onOpenShelf: () => void;
}) {
  const { player, stage } = state;
  const offset = state.lyrics.offsets[player.trackId ?? ""] ?? 0;
  const relayer = (layer: StageLayer): void => dispatch({ type: "stage/toggleLayer", layer });
  return <div className="st-menu" role="dialog" aria-label="播放页视图设置">
    <div className="st-menu-row"><span className="lbl">版式</span>
      <button type="button" className="on" onClick={onOpenShelf}>换样式…</button>
      <span className="st-menu-cur">{[SKINS.find((skin) => skin.id === stage.skin)?.name, stage.tone === "light" ? "浅色" : "深色"].filter(Boolean).join(" · ")}</span>
    </div>
    <div className="st-menu-row"><span className="lbl">{live ? "灯位" : "预设"}</span><div className="st-presets">
      {PRESETS.map((preset) => <button key={preset.id} type="button" className={preset.id === stage.preset ? "on" : ""} onClick={() => {
        dispatch({ type: "stage/setPreset", preset: preset.id });
        dispatch({ type: "stage/setLyricRenderer", renderer: preset.lyricRenderer });
      }}>{live ? LIVE_PRESETS[preset.id].name : preset.name}</button>)}
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
    {stage.skin === "classic" ? null : <p className="st-menu-note">
      上面几项里，灯位预设 / 歌词样式 / 视觉 / 3D 轮播 / 动效 只作用于「剧场纸面」版式——新版式的排布是写死的；图层里只有「歌词」开关对当前版式有效。
    </p>}
  </div>;
}
