import { useEffect, useRef } from "react";
import { onTick } from "../../../compositor.js";
import { pad2 } from "../types.js";
import type { SkinProps } from "./registry.js";
import { Cover, KaraokeLine, SkinTop, Tape, fitScale, usePulse, useTape } from "./shared.js";

/**
 * B · 唱机（2026-11-10 新增）。
 *
 * 播放页 = 一台唱机：唱臂、盘、标签、电源灯。
 * "正在演出"由两件真事证明：盘在转、唱臂落下来；右侧 VU 表跟着频谱跳。
 * 不靠发光，也不靠光柱。
 */
export function Turntable(props: SkinProps) {
  const { state, data, lyric, playing } = props;
  const tape = useTape(props.durationMs, data.nowDuration);
  const doc = lyric.doc;
  const at = lyric.lineIndex;
  const cur = !props.lyricOn
    ? "歌词层已关闭"
    : lyric.currentLine?.text ?? (doc ? "前奏 · 歌词即将开始" : lyric.note || "正在读取歌词…");
  const next = props.lyricOn && doc && at >= 0 && at + 1 < doc.lines.length ? doc.lines[at + 1]?.text ?? "" : "";

  const rootRef = useRef<HTMLDivElement>(null);
  usePulse(rootRef, props.spectrum);
  const specRef = useRef(props.spectrum);
  specRef.current = props.spectrum;
  const lRef = useRef<HTMLElement>(null);
  const rRef = useRef<HTMLElement>(null);
  const lvRef = useRef<HTMLElement>(null);
  const rvRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const avg = (bins: number[], from: number, to: number): number => {
      let sum = 0;
      let n = 0;
      for (let i = from; i < to; i += 1) {
        sum += Math.max(0, Math.min(1, bins[i] ?? 0));
        n += 1;
      }
      return n ? sum / n : 0;
    };
    let frame = 0;
    // 走全应用唯一心跳，隔帧更新 ≈30fps：电平表不需要 60
    return onTick(() => {
      frame += 1;
      if (frame % 2 !== 0) return;
      const bins = specRef.current(64) ?? [];
      const l = avg(bins, 2, 16);
      const r = avg(bins, 16, 44);
      // 表条按 dB 感压一下，不然小音量永远贴底、大音量直接满格
      const toPct = (v: number): string => `${Math.round(Math.min(1, Math.pow(v, 0.62)) * 96)}%`;
      lRef.current?.style.setProperty("--v", toPct(l));
      rRef.current?.style.setProperty("--v", toPct(r));
      if (lvRef.current) lvRef.current.textContent = l <= 0.004 ? "-∞" : String(Math.round(-24 + Math.pow(l, 0.6) * 24));
      if (rvRef.current) rvRef.current.textContent = r <= 0.004 ? "-∞" : String(Math.round(-24 + Math.pow(r, 0.6) * 24));
    });
  }, []);

  return (
    <div className="sk sk-tt" data-tone={props.tone} data-playing={playing ? "on" : "off"} ref={rootRef}>
      <SkinTop
        live={props.live}
        playing={props.playing}
        queue={`QUEUE ${state.queue.items.length ? `${pad2(Math.max(1, data.cursorPosition + 1))}/${state.queue.items.length}` : "—"}`}
        line={doc && at >= 0 ? `LINE ${pad2(at + 1)}/${doc.lines.length}` : "LINE —"}
        codec="33⅓ RPM"
        shelfOpen={props.shelfOpen}
        viewOpen={props.viewOpen}
        onShelf={props.onShelf}
        onView={props.onView}
      />

      <div className="tt-grid">
        <div className="tt-deck">
          <div className="tt-plinth" aria-hidden="true" />
          <div className="tt-platter">
            <div className="tt-rotor">
              <i className="g" aria-hidden="true" />
            </div>
            <div className="tt-label">
              <Cover url={data.coverUrl} />
            </div>
          </div>
          {/* 唱臂：播放时落针、暂停时抬起（真唱机的第一动作）。
              viewBox 与样式里的 transform-origin 必须同一坐标系（392,86 = 轴心）。 */}
          <svg className="tt-arm" viewBox="0 0 400 400" aria-hidden="true">
            <g>
              <circle cx="330" cy="70" r="15" fill="none" stroke="var(--tt-rod)" strokeWidth="1.4" />
              <circle cx="330" cy="70" r="19" fill="none" stroke="var(--sk-line)" strokeWidth="1" />
              <line x1="330" y1="70" x2="128" y2="272" stroke="var(--tt-rod)" strokeWidth="4.6" strokeLinecap="round" />
              <line x1="330" y1="70" x2="128" y2="272" stroke="var(--tt-rod-hi)" strokeWidth="1.2" strokeLinecap="round" />
              {/* 头壳 + 针尖：原来是一个黑方块，读不出"针落在盘上" */}
              <g transform="rotate(40 128 272)">
                <path d="M100 266 L128 262 L132 276 L104 280 Z" fill="var(--sk-bg)" stroke="var(--sk-line)" strokeWidth="1.2" />
                <line x1="126" y1="274" x2="133" y2="282" stroke="var(--tt-rod-hi)" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="134" cy="284" r="1.5" fill="var(--tt-rod-hi)" />
              </g>
              <circle cx="330" cy="70" r="2.6" fill="var(--tt-rod-hi)" />
            </g>
          </svg>
          <span className="tt-mark mono">33⅓ · STEREO</span>
          <span className="tt-power mono"><i aria-hidden="true" />PLAY</span>
        </div>

        <section className="tt-info">
          <div className="tt-kick mono">
            <span className="side">{playing ? "NOW PLAYING" : "PAUSED"}</span>
            <span>TRACK {pad2(data.cursorPosition + 1)}</span>
          </div>
          <h1
            className="tt-title"
            title={data.nowTitle}
            style={{ "--fit": fitScale(data.nowTitle) } as React.CSSProperties}
          >{data.nowTitle}</h1>
          <p className="tt-artist">{[data.nowArtist, data.nowAlbum].filter(Boolean).join(" · ") || "—"}</p>

          <div className="tt-vu" role="img" aria-label="电平表">
            <div className="row"><span>L</span><span className="bar"><i ref={lRef} /></span><span ref={lvRef}>-∞</span></div>
            <div className="row"><span>R</span><span className="bar"><i ref={rRef} /></span><span ref={rvRef}>-∞</span></div>
            <div className="scale mono"><span>-20</span><span>-10</span><span>-6</span><span>-3</span><span>0</span></div>
          </div>

          <div className="tt-lyr" aria-live="polite">
            {doc && at >= 0
              ? <KaraokeLine key={`k-${at}`} doc={doc} at={at} className="cur" />
              : <p className="cur" key={cur}>{cur}</p>}
            {next ? <p className="next">{next}</p> : null}
          </div>

          <div className="tt-meta mono">
            <span>{data.sourceName}</span>
            <span>44.1 kHz · 16 bit</span>
          </div>
        </section>
      </div>

      <Tape api={tape} />
    </div>
  );
}
