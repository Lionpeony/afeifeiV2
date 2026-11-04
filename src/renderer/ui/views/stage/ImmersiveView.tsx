import { useEffect, useRef, useState } from "react";
import type { AppState, TrackId } from "../../../../contracts/index.js";
import type { LyricDoc } from "../../../../contracts/lyric.js";
import { onTick } from "../../compositor.js";
import { dispatch } from "../../../kernel/index.js";
import { fmt, pad2 } from "./types.js";
import { QueueRows } from "./StageQueue.js";
import type { Track } from "../../../domain/library/schema.js";

export interface ImmersiveViewProps {
  state: AppState;
  title: string;
  artist: string;
  album: string;
  source: string;
  duration: number;
  playing: boolean;
  coverUrl: string | null;
  doc: LyricDoc | null;
  lineIndex: number;
  lyricNote: string;
  tracks: Map<string, Track>;
  covers: Record<string, string>;
  upNext: TrackId[];
  nextIndices: number[];
  playOrder: number[];
  onExit: () => void;
  onPlayTrack: (id: TrackId) => void;
}

export function ImmersiveView(props: ImmersiveViewProps) {
  const { state, title, artist, album, source, duration, playing, coverUrl, doc, lineIndex, lyricNote, tracks, covers, upNext, nextIndices, playOrder, onExit, onPlayTrack } = props;
  const timeRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const dragging = useRef(false);
  const currentTime = useRef(0);
  const [narrow, setNarrow] = useState(false);
  const [playingNow, setPlayingNow] = useState(playing);
  useEffect(() => setPlayingNow(playing), [playing]);
  useEffect(() => {
    const measure = (): void => setNarrow(window.innerWidth < 900);
    const keydown = (event: KeyboardEvent): void => { if (event.key === "Escape") onExit(); };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("keydown", keydown); };
  }, [onExit]);

  useEffect(() => onTick((time) => {
    currentTime.current = time;
    if (timeRef.current && timeRef.current.textContent !== fmt(time)) timeRef.current.textContent = fmt(time);
    if (totalRef.current && totalRef.current.textContent !== fmt(duration)) totalRef.current.textContent = fmt(duration);
    if (barRef.current && !dragging.current) {
      barRef.current.max = String(Math.max(1, Math.round(duration)));
      barRef.current.value = String(Math.round(Math.min(time, duration || time)));
      const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
      barRef.current.style.setProperty("--fill", `${pct.toFixed(2)}%`);
      const label = duration > 0 ? `已播 ${Math.round(pct)}% · 剩余 ${fmt(duration - time)} · 按 Esc 退回` : "按 Esc 退回";
      if (statusRef.current && statusRef.current.textContent !== label) statusRef.current.textContent = label;
    }
  }), [duration]);

  const line = doc && lineIndex >= 0 ? doc.lines[lineIndex] : null;
  const translation = state.stage.translation ? line?.translations?.zh : "";
  const currentQueueIndex = state.queue.cursor;
  return <div className={`st-immer${narrow ? " narrow" : ""}`} role="dialog" aria-label="沉浸播放">
    <header className="im-top"><span className="im-brand"><i />AFEIFEI<small>沉浸播放 · 按 Esc 退出</small></span><div className="st-seal im-seal"><b>第 {pad2(currentQueueIndex + 1)} 场</b><small>ADMIT ONE</small></div></header>
    <p className="im-narrow">沉浸播放需要更宽的窗口（≥ 900px）　按 Esc 退回普通播放页</p>
    <div className="im-body">
      <div className="im-lead"><h2 className={`im-title${title.length > 20 ? " long" : title.length > 10 ? " mid" : ""}`}>{title}<i className="dot" /></h2><p className="im-tech">{[artist, album].filter(Boolean).join(" · ") || "—"} · {source}</p></div>
      <div className="im-grid">
        <figure className="st-photo im-sleeve"><div className={coverUrl ? "art" : "art no-cover"} data-side={`SIDE A · ${pad2(currentQueueIndex + 1)}`}>{coverUrl ? <img className="st-cover-img" src={coverUrl} alt="" /> : null}</div><figcaption className="im-sleeve-cap"><b>{title}</b><span>{duration > 0 ? fmt(duration) : "--:--"}</span></figcaption></figure>
        <div className={`im-disc${playingNow ? "" : " stalled"}`}><div className="tone" /><div className="disc"><div className="label"><b>SIDE A · {pad2(currentQueueIndex + 1)}</b><span>{artist || "—"}</span><strong>{title}</strong><small>LYRIC IS TIME</small></div></div></div>
        <div className="im-right"><div className="st-kicker"><i /><span>{doc ? `LINE · ${pad2(lineIndex + 1)} / ${doc.lines.length}` : "LYRIC · WAITING"}</span></div>
          {line ? <div className="im-lyric"><p className="im-line im-prev">{lineIndex > 0 ? doc!.lines[lineIndex - 1].text : "—"}</p><p className="im-line im-cur">{line.text}</p>{translation ? <p className="im-line im-trans">{translation}</p> : null}<p className="im-line im-next">{lineIndex + 1 < doc!.lines.length ? doc!.lines[lineIndex + 1].text : "（本段终）"}</p></div> : <p className="im-line im-cur pure">{doc ? "—" : lyricNote || "纯音乐 · 这首歌没有歌词"}</p>}
          <div className="im-queue"><div className="st-side-h"><b>接下来</b><span>QUEUE · {upNext.length}</span></div>{upNext.length ? <QueueRows items={state.queue.items} indices={nextIndices} playOrder={playOrder} tracks={tracks} covers={covers} onPlay={onPlayTrack} onMove={(index, delta) => dispatch({ type: "queue/move", from: index, to: index + delta })} onRemove={(index) => dispatch({ type: "queue/remove", index })} dense /> : <p className="st-side-empty">队列里没有下一首</p>}</div>
        </div>
      </div>
      <span className="im-vert" aria-hidden="true">TYPE IS TIME · NO.{pad2(currentQueueIndex + 1)}</span><span className="im-no" aria-hidden="true">{pad2(currentQueueIndex + 1)}</span>
    </div>
    <footer className="im-foot"><div className="im-row"><span ref={timeRef} className="im-tm">0:00</span><div className="im-tb"><button type="button" aria-label="上一首" onClick={() => dispatch({ type: "queue/prev", atPositionMs: currentTime.current })}><i className="tb-ic ic-prev"><i /><i /></i></button><button type="button" className="main" aria-label={playingNow ? "暂停" : "播放"} onClick={() => dispatch({ type: "player/toggle" })}><i className={`tb-ic ${playingNow ? "ic-pause" : "ic-play"}`}><i />{playingNow ? <i /> : null}</i></button><button type="button" aria-label="下一首" onClick={() => dispatch({ type: "queue/next" })}><i className="tb-ic ic-next"><i /><i /></i></button></div><input ref={barRef} className="im-bar" type="range" min={0} max={1000} defaultValue={0} aria-label="播放进度" onPointerDown={() => { dragging.current = true; }} onPointerUp={() => { dragging.current = false; }} onBlur={() => { dragging.current = false; }} onChange={(event) => dispatch({ type: "player/seek", positionMs: Number(event.target.value) })} /><span ref={totalRef} className="im-tm">0:00</span></div><p ref={statusRef} className="im-stat">按 Esc 退回</p></footer>
  </div>;
}
