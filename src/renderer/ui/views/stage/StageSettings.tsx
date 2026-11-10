import type { AppState } from "../../../../contracts/index.js";
import type { StageViewProps } from "./types.js";
import { LIVE_PRESETS, PRESETS } from "./presets.js";
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
  /** 打开样式库。 */
  onOpenShelf: () => void;
}) {
  const { player, stage } = state;
  const offset = state.lyrics.offsets[player.trackId ?? ""] ?? 0;
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
    <div className="st-menu-row"><span className="lbl">图层</span><label><input type="checkbox" checked={stage.layers.lyric} onChange={() => dispatch({ type: "stage/toggleLayer", layer: "lyric" })} />歌词</label></div>
    <div className="st-menu-row"><span className="lbl">主题包</span><button type="button" onClick={() => void importTheme().catch(() => undefined)}>导入</button><button type="button" onClick={() => void exportTheme()}>导出</button>{stage.customTokens ? <button type="button" className="on" onClick={() => dispatch({ type: "stage/setTheme", tokens: null })}>清除导入</button> : null}</div>
    <p className="st-menu-note">
      灯位预设影响播放页与浮层的场景层配色；歌词样式跟随每套版式自己的排布。
    </p>
  </div>;
}
