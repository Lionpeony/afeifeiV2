import { useEffect, useRef } from "react";
import { onTick } from "../../../compositor.js";
import type { SkinProps } from "./registry.js";
import { KaraokeLine, SkinTop, Tape, fitScale, usePulse, useTape } from "./shared.js";

const BARS = 96;

/**
 * D · 棱镜（2026-11-10 重做，替代"声云"）。
 *
 * 播放页 = 一束白光穿过棱镜：左边一道白光，中间一条玻璃边，右边散成五道色。
 * 这是"不摆物件只摆光"的物理版本 —— 光有方向、有分解、有落点，
 * 而不是上一版那种把整页糊住的极光雾。
 * 演出感由两处实时数据支撑：光束亮度随低频呼吸、底部镜像发丝声浪。
 */
export function Prism(props: SkinProps) {
  const { data, lyric, playing } = props;
  const tape = useTape(props.durationMs, data.nowDuration);
  const doc = lyric.doc;
  const at = lyric.lineIndex;
  const cur = !props.lyricOn
    ? "歌词层已关闭"
    : lyric.currentLine?.text ?? (doc ? "前奏 · 歌词即将开始" : lyric.note || "正在读取歌词…");
  const note = props.lyricOn && props.state.stage.translation ? lyric.currentLine?.translations?.zh ?? "" : "";

  const rootRef = useRef<HTMLDivElement>(null);
  usePulse(rootRef, props.spectrum);
  const waveRef = useRef<HTMLDivElement>(null);
  const specRef = useRef(props.spectrum);
  specRef.current = props.spectrum;

  useEffect(() => {
    const host = waveRef.current;
    if (!host) return;
    const cols: HTMLElement[] = [];
    for (let i = 0; i < BARS; i += 1) {
      const col = document.createElement("i");
      host.appendChild(col);
      cols.push(col);
    }
    let frame = 0;
    return onTick(() => {
      frame += 1;
      if (frame % 2 !== 0) return;
      const bins = specRef.current(BARS) ?? [];
      let bass = 0;
      for (let i = 0; i < 6; i += 1) bass += Math.max(0, Math.min(1, bins[i] ?? 0));
      bass /= 6;
      // 光束亮度 = 低频包络：安静时几乎是暗线，鼓点一来整束亮起
      rootRef.current?.style.setProperty("--bass", bass.toFixed(3));
      for (let i = 0; i < BARS; i += 1) {
        const v = Math.max(0, Math.min(1, bins[i] ?? 0));
        // 两端包络归零：否则声浪会被画布右缘"切一刀"（评审指出的裁断感）
        const env = Math.sin((i / (BARS - 1)) * Math.PI) ** 0.55;
        // 静音就是一条基线（A-07），不画假波
        const h = v <= 0.004 ? 1 : Math.max(1, Math.round((3 + Math.pow(v, 0.6) * 52) * env));
        cols[i].style.height = `${h}px`;
        cols[i].style.opacity = String(v <= 0.004 ? 0.25 : 0.35 + v * 0.6);
      }
    });
  }, []);

  return (
    <div className="sk sk-pr" data-tone={props.tone} data-playing={playing ? "on" : "off"} ref={rootRef}>
      <SkinTop
        live={props.live}
        queue={`QUEUE ${doc && at >= 0 ? `${Math.min(doc.lines.length, at + 1)}/${doc.lines.length}` : "—"}`}
        line={doc && at >= 0 ? `LINE ${String(at + 1).padStart(2, "0")}/${doc.lines.length}` : "LINE —"}
        codec="44.1 kHz"
        shelfOpen={props.shelfOpen}
        viewOpen={props.viewOpen}
        onShelf={props.onShelf}
        onView={props.onView}
      />

      <i className="pr-beam" aria-hidden="true" />
      <i className="pr-prism" aria-hidden="true" />
      <div className="pr-fan" aria-hidden="true"><i /><i /><i /><i /><i /></div>

      <div className="pr-body">
        <div className="pr-meta mono">
          <span>{data.sourceName}</span>
          <span>{playing ? "PLAYING" : "PAUSED"}</span>
        </div>
        <div className="pr-lyr" aria-live="polite" style={{ "--fit": fitScale(cur) } as React.CSSProperties}>
          {doc && at >= 0
            ? <KaraokeLine key={`k-${at}`} doc={doc} at={at} className="cur" />
            : <p className="cur" key={cur}>{cur}</p>}
          {note ? <p className="zh">{note}</p> : null}
        </div>
      </div>

      <div className="pr-wave" ref={waveRef} aria-hidden="true" />
      <Tape api={tape} />
    </div>
  );
}
