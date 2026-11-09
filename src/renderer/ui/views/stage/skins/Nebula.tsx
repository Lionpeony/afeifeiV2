import { useEffect, useRef } from "react";
import { onTick } from "../../../compositor.js";
import { dispatch } from "../../../../kernel/index.js";
import { pad2 } from "../types.js";
import { Cover, SkinTop, Tape, upNextRows, useTape } from "./shared.js";
import type { SkinProps } from "./registry.js";

const W = 1400;
const H = 170;
const BINS = 64;

/**
 * B · 声云（2026-11-10）。
 *
 * 版式：不摆物件，只摆光。歌词是主视觉，封面退成 dock 上的小方片。
 * 底部那条"地平线"是**真频谱**（A-07：静音就是平线，绝不画假波），
 * 三条 path 用同一份 analyser 数据的不同衰减，做出水面的层次。
 */
export function Nebula(props: SkinProps) {
  const { state, data, lyric, playing } = props;
  const tape = useTape(props.durationMs, data.nowDuration);
  const doc = lyric.doc;
  const at = lyric.lineIndex;
  const curText = !props.lyricOn
    ? "歌词层已关闭"
    : lyric.currentLine?.text ?? (doc ? "前奏 · 歌词即将开始" : lyric.note || "正在读取歌词…");
  const nextText = props.lyricOn && doc && at >= 0 && at + 1 < doc.lines.length ? doc.lines[at + 1]?.text ?? "" : "";
  const zh = props.lyricOn && state.stage.translation ? lyric.currentLine?.translations?.zh ?? "" : "";
  const rows = upNextRows(data.upNext, data.tracksMap, data.queueRemote);

  const mainRef = useRef<SVGPathElement>(null);
  const echoRef = useRef<SVGPathElement>(null);
  const ghostRef = useRef<SVGPathElement>(null);
  // spectrum 的引用每帧都可能换（props 内联箭头），用 ref 兜住，避免把 rAF 反复重建
  const specRef = useRef(props.spectrum);
  specRef.current = props.spectrum;

  useEffect(() => {
    let frame = 0;
    // 走全应用唯一的心跳（lint 规则 4）：隔帧画一次 ≈30fps，波形不需要 60
    return onTick(() => {
      frame += 1;
      if (frame % 2 !== 0) return;
      const bins = specRef.current(BINS) ?? [];
      const main: string[] = [];
      const echo: string[] = [];
      const ghost: string[] = [];
      const mid = H / 2;
      for (let i = 0; i <= BINS; i += 1) {
        const p = i / BINS;
        const x = (p * W).toFixed(1);
        const v = Math.min(1, Math.max(0, bins[Math.min(BINS - 1, i)] ?? 0));
        // 两端收口：地平线在画面边缘归零，不然会像被切断
        const env = Math.sin(p * Math.PI) ** 0.7;
        const amp = v * env * mid * 0.92;
        main.push(`${i ? "L" : "M"}${x} ${(mid - amp).toFixed(1)}`);
        echo.push(`${i ? "L" : "M"}${x} ${(mid + amp * 0.62).toFixed(1)}`);
        ghost.push(`${i ? "L" : "M"}${x} ${(mid - amp * 0.34).toFixed(1)}`);
      }
      mainRef.current?.setAttribute("d", main.join(""));
      echoRef.current?.setAttribute("d", echo.join(""));
      ghostRef.current?.setAttribute("d", ghost.join(""));
    });
  }, []);

  return (
    <div className="sk sk-nb" data-tone={props.tone}>
      <i className="sk-nb-fog f1" aria-hidden="true" />
      <i className="sk-nb-fog f2" aria-hidden="true" />
      <i className="sk-nb-fog f3" aria-hidden="true" />
      <i className="sk-nb-stars" aria-hidden="true" />

      <SkinTop
        live={props.live}
        queue={`QUEUE ${state.queue.items.length ? `${pad2(Math.max(1, data.cursorPosition + 1))}/${state.queue.items.length}` : "—"}`}
        line={doc && at >= 0 ? `LINE ${pad2(at + 1)}/${doc.lines.length}` : "LINE —"}
        codec="44.1 kHz"
        shelfOpen={props.shelfOpen}
        viewOpen={props.viewOpen}
        onShelf={props.onShelf}
        onView={props.onView}
      />

      <div className="sk-nb-body">
        <p className="sk-nb-kicker mono">{playing ? "正在播放" : "已暂停"} · {data.sourceName}</p>
        <h1 className="sk-nb-lyr" key={at} title={curText}>{curText}</h1>
        {zh ? <p className="sk-nb-zh">{zh}</p> : null}
        {nextText ? <p className="sk-nb-next">{nextText}</p> : null}

        <div className="sk-nb-dock">
          <div className="sk-nb-track">
            <Cover url={data.coverUrl} className="dock" />
            <div className="tx">
              <b title={data.nowTitle}>{data.nowTitle}</b>
              <span>{[data.nowArtist, data.nowAlbum].filter(Boolean).join(" · ") || "—"}</span>
            </div>
          </div>
          <Tape api={tape} />
          {rows.length ? (
            <div className="sk-nb-up mono">
              <span>接下来</span>
              {rows.map((row, index) => (
                <button
                  key={`${row.id}-${index}`}
                  type="button"
                  title={`播放 ${row.title}`}
                  onClick={() => dispatch({ type: "player/play", trackId: row.id, trackTitle: row.title })}
                >
                  {row.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="sk-nb-horizon" aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path className="w3" ref={ghostRef} d={`M0 ${H / 2} L${W} ${H / 2}`} />
          <path className="w2" ref={echoRef} d={`M0 ${H / 2} L${W} ${H / 2}`} />
          <path className="w1" ref={mainRef} d={`M0 ${H / 2} L${W} ${H / 2}`} />
        </svg>
      </div>
    </div>
  );
}
