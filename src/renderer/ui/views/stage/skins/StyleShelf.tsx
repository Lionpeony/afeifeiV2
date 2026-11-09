import type { StageSkin, StageTone } from "../../../../../contracts/index.js";
import { dispatch } from "../../../../kernel/index.js";
import { SKINS } from "./registry.js";

/**
 * 样式库（2026-11-10）：像换播放器皮肤一样换版式。
 *
 * 缩略图全部用 CSS 渐变画（th-* 那几个 class），不加载任何图片：
 * 面板要能在一帧里打开，不能等缩略图解码。选中项打勾，明暗单独一档开关。
 */
export function StyleShelf({
  skin,
  tone,
  onClose,
}: {
  skin: StageSkin;
  tone: StageTone;
  onClose(): void;
}) {
  return (
    <div className="sk-shelf" role="dialog" aria-label="播放器样式">
      <button type="button" className="sk-shelf-mask" aria-label="关闭样式库" onClick={onClose} />
      <div className="sk-shelf-panel">
        <header className="sk-shelf-hd">
          <div>
            <b>播放器样式</b>
            <span className="mono">{SKINS.length} PLAYER LOOKS</span>
          </div>
          <button type="button" className="sk-shelf-x" aria-label="关闭" onClick={onClose}>✕</button>
        </header>

        <div className="sk-shelf-grid">
          {SKINS.map((def) => {
            const on = def.id === skin;
            return (
              <button
                key={def.id}
                type="button"
                className={`sk-opt${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => dispatch({ type: "stage/setSkin", skin: def.id })}
              >
                <span className={`sk-thumb ${def.thumb} tone-${tone}`} aria-hidden="true">
                  <i /><i /><i /><i />
                </span>
                <span className="sk-opt-tx">
                  <b>{def.name}<em className="mono">{def.en}</em></b>
                  <small>{def.desc}</small>
                </span>
                {on ? <span className="sk-check" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2 6.4l2.6 2.6L10 3.4" /></svg></span> : null}
              </button>
            );
          })}
        </div>

        <footer className="sk-shelf-foot">
          <span className="sk-lbl">明暗</span>
          <div className="sk-seg" role="group" aria-label="明暗">
            {/* 点这里 = 用户明确表态：锁成手动档（toneAuto=false），
                之后舞台明暗不再跟随全局主题 */}
            <button type="button" aria-pressed={tone === "dark"} data-on={tone === "dark"} onClick={() => {
              dispatch({ type: "stage/setToneAuto", on: false });
              dispatch({ type: "stage/setTone", tone: "dark" });
            }}>深色</button>
            <button type="button" aria-pressed={tone === "light"} data-on={tone === "light"} onClick={() => {
              dispatch({ type: "stage/setToneAuto", on: false });
              dispatch({ type: "stage/setTone", tone: "light" });
            }}>浅色</button>
          </div>
          <span className="sk-shelf-hint">外壳（站尺 / 控制台）跟着翻纸，全局主题设置不变</span>
        </footer>
      </div>
    </div>
  );
}
