import { useEffect, useRef } from "react";
import type { TrackId } from "../../../../../contracts/index.js";
import { dispatch } from "../../../../kernel/index.js";
import { onTick } from "../../../compositor.js";
import { PLAY_MODE_LABEL } from "../../../play-mode.js";
import { fmt, pad2 } from "../types.js";
import { Cover, SkinTop, Tape, upNextRows, useTape } from "./shared.js";
import type { SkinProps } from "./registry.js";

const BARS = 32;
const QUEUE_ROWS = 6;

/**
 * C · 转播台（2026-11-10）。
 *
 * 版式：一张仪表台。左栏时间码 + 真频谱柱阵 + 读数，中栏提词，右栏封面与队列，
 * 底部一条带刻度的走带。全部由线与数字构成，不靠图片撑场面。
 * 读数只摆**真拿得到**的量（来源 / 队列 / 模式 / 频谱状态），不编 BPM 与码率。
 */
export function Desk(props: SkinProps) {
  const { state, data, lyric } = props;
  const tape = useTape(props.durationMs, data.nowDuration);
  const doc = lyric.doc;
  const at = lyric.lineIndex;
  const clockRef = useRef<HTMLElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const specRef = useRef(props.spectrum);
  specRef.current = props.spectrum;

  // 时间码：60Hz 直接写文本，不进 React
  useEffect(() => onTick((time) => {
    const el = clockRef.current;
    if (!el) return;
    const total = Math.max(0, time);
    const text = `${pad2(Math.floor(total / 60000))}:${pad2(Math.floor((total % 60000) / 1000))}.${pad2(Math.floor((total % 1000) / 10))}`;
    if (el.textContent !== text) el.textContent = text;
  }), []);

  // 频谱柱阵：与 canvas 那份同源（同一 analyser），只是画成 DOM
  useEffect(() => {
    const host = barsRef.current;
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
      for (let i = 0; i < BARS; i += 1) {
        const v = Math.min(1, Math.max(0, bins[i] ?? 0));
        // 静音就是 0（A-07），不画地板线
        cols[i].style.setProperty("--h", v <= 0.004 ? "0" : v.toFixed(3));
      }
    });
  }, []);

  const lines = doc ? doc.lines.slice(Math.max(0, at - 2), Math.max(0, at - 2) + 5) : [];
  const startIndex = Math.max(0, at - 2);
  const queue = state.queue;
  const order = data.playOrder;
  const cursor = data.cursorPosition;
  // playOrder 是"队列下标序列"，不是 id 序列：这里必须映射回 items
  const rest: TrackId[] = (cursor >= 0
    ? order.slice(cursor + 1, cursor + 1 + QUEUE_ROWS)
    : order.slice(0, QUEUE_ROWS))
    .map((index) => queue.items[index])
    .filter((id): id is TrackId => Boolean(id));
  const restRows = upNextRows(rest, data.tracksMap, data.queueRemote);

  return (
    <div className="sk sk-dk" data-tone={props.tone}>
      <SkinTop
        live={props.live}
        queue={`QUEUE ${queue.items.length ? `${pad2(Math.max(1, cursor + 1))}/${queue.items.length}` : "—"}`}
        line={doc && at >= 0 ? `LINE ${pad2(at + 1)}/${doc.lines.length}` : "LINE —"}
        codec={PLAY_MODE_LABEL[queue.mode]}
        shelfOpen={props.shelfOpen}
        viewOpen={props.viewOpen}
        onShelf={props.onShelf}
        onView={props.onView}
      />

      <div className="sk-dk-grid">
        <section className="sk-dk-col l">
          <span className="sk-lbl">ELAPSED · 已播</span>
          <div className="sk-dk-tc">
            <b className="mono" ref={clockRef}>00:00.00</b>
            <span className="mono">/ {data.nowDuration > 0 ? fmt(data.nowDuration) : "--:--"}</span>
          </div>

          <div className="sk-dk-spec">
            <div className="hd">
              <span className="sk-lbl">SPECTRUM · {BARS} BAND</span>
              <span className="sk-lbl live">LIVE</span>
            </div>
            <div className="bars" ref={barsRef} />
          </div>

          <div className="sk-dk-ro">
            <div><span className="sk-lbl">SOURCE</span><b>{data.sourceName}</b></div>
            <div><span className="sk-lbl">MODE</span><b>{PLAY_MODE_LABEL[queue.mode]}</b></div>
            <div><span className="sk-lbl">QUEUE</span><b className="mono">{queue.items.length ? `${pad2(Math.max(1, cursor + 1))} / ${queue.items.length}` : "EMPTY"}</b></div>
            <div><span className="sk-lbl">LYRICS</span><b>{doc ? `${doc.lines.length} 行` : "无"}</b></div>
          </div>
        </section>

        <section className="sk-dk-col c">
          <div className="sk-dk-hd">
            <span className="sk-lbl">LYRIC · 提词</span>
            <span className="sk-lbl mono">{doc && at >= 0 ? `${pad2(at + 1)} / ${doc.lines.length}` : "—"}</span>
          </div>
          <div className="sk-dk-lyr">
            {lines.length ? lines.map((line, index) => {
              const absolute = startIndex + index;
              const isNow = absolute === at;
              const isPast = absolute < at;
              return (
                <button
                  key={`${line.startMs}-${absolute}`}
                  type="button"
                  className={`${isNow ? "now" : ""}${isPast ? " past" : ""}`}
                  title="跳到这句"
                  onClick={() => dispatch({ type: "player/seek", positionMs: line.startMs })}
                >
                  {line.text}
                </button>
              );
            }) : <p className="sk-dk-empty">{props.lyricOn ? lyric.note || "正在读取歌词…" : "歌词层已关闭"}</p>}
          </div>
          {props.lyricOn && state.stage.translation && lyric.currentLine?.translations?.zh
            ? <p className="sk-dk-zh">{lyric.currentLine.translations.zh}</p>
            : null}
        </section>

        <section className="sk-dk-col r">
          <Cover url={data.coverUrl} className="hero" />
          <div className="sk-dk-rk">
            <b title={data.nowTitle}>{data.nowTitle}</b>
            <span>{[data.nowArtist, data.nowAlbum].filter(Boolean).join(" · ") || "—"}</span>
          </div>
          <div className="sk-dk-queue">
            <div className="hd"><span className="sk-lbl">UP NEXT</span><span className="sk-lbl mono">{restRows.length} / {queue.items.length}</span></div>
            <ul>
              {restRows.map((row, index) => (
                <li key={`${row.id}-${index}`}>
                  <button type="button" title={`播放 ${row.title}`} onClick={() => dispatch({ type: "player/play", trackId: row.id, trackTitle: row.title })}>
                    <i className="mono">{pad2(cursor + 2 + index)}</i>
                    <span>{row.title}</span>
                    <small>{row.artist}</small>
                  </button>
                </li>
              ))}
              {restRows.length === 0 ? <li className="empty">队列里没有下一首</li> : null}
            </ul>
          </div>
        </section>
      </div>

      <footer className="sk-dk-deck">
        <span className="sk-dk-deckside mono">{props.playing ? "● PLAY" : "‖ PAUSE"} · {queue.items.length} TRACKS</span>
        <Tape api={tape} />
      </footer>
    </div>
  );
}
