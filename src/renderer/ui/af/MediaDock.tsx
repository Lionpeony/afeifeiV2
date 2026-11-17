/* 媒体键悬浮控制 · 后台通行证（v5.6 原型） */
import { useRef } from "react";

import { useAf } from "./context.js";
import { hashStr } from "./art.js";
import { QUALITY_LEVELS } from "./Studio.js";
import { IconArrowRight, IconHeart, IconHeartFill, IconNext, IconPick, IconPrev, IconVolume, IconX } from "./icons.js";
import { PlayGlyph } from "./ui.js";
import { usePosition } from "./use-position.js";

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function MediaDock() {
  const af = useAf();
  const { dock, setDock, dockPin, setDockPin, track, playing, setPlaying, userSkip, volume, setVolume, isLiked, toggleLike, quality, openPlayer, flashDock, lyricsBar } = af;
  const { pos, dur } = usePosition(af, dock);
  const seekRef = useRef<HTMLDivElement>(null);
  if (!dock) return null;

  const total = track.dur || dur || 1;
  const pct = Math.min(100, (pos / total) * 100);
  const liked = isLiked(track);
  const q = (QUALITY_LEVELS.find((x) => x.id === quality) || QUALITY_LEVELS[1]).short;
  const no = String((hashStr(track.title + track.artist) % 9000) + 1000).slice(0, 4);
  const idx = af.queueIndex;

  const seek = (e: React.PointerEvent): void => {
    const r = seekRef.current?.getBoundingClientRect();
    if (!r) return;
    af.seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total);
  };

  return (
    <div className="pass" role="region" aria-label="媒体键悬浮控制 · 后台通行证" style={lyricsBar ? { bottom: 168 } : undefined}>
      <span className="pass__hole" aria-hidden="true"></span>
      <div className="pass__head">
        <span className="pass__brand"><b>AFEIFEI</b><span>BACKSTAGE PASS · STAFF</span></span>
        <span className="pass__no">No.{no}</span>
      </div>

      <div className="pass__body">
        {track.cover ? <img className="pass__art" src={track.cover} alt="" referrerPolicy="no-referrer" /> : <span className="pass__art" style={{ display: "grid", placeItems: "center" }}><IconPick size={18} /></span>}
        <span className="pass__meta">
          <span className="pass__title" title={track.title}>{track.title}</span>
          <span className="pass__artist">{track.artist}</span>
          <span className="pass__tags"><i className="pass__tag pass__tag--live">{q}</i><i className="pass__tag">SETLIST {String(idx + 1).padStart(2, "0")}/{String(af.queue.length).padStart(2, "0")}</i></span>
        </span>
      </div>

      <span className="pass__stamp" aria-hidden="true">台侧通行</span>
      <div className="pass__perf" aria-hidden="true"></div>

      <div className="pass__controls">
        <button className="pass__key" onClick={() => { userSkip("prev"); flashDock(); }} title="上一首（Shift + ←）"><IconPrev size={16} /></button>
        <button className="pass__play" onClick={() => { setPlaying(!playing); flashDock(); }} aria-label={playing ? "暂停" : "播放"}><PlayGlyph playing={playing} size={18} /></button>
        <button className="pass__key" onClick={() => { userSkip("next"); flashDock(); }} title="下一首（Shift + →）"><IconNext size={16} /></button>
        <button className={"pass__key" + (liked ? " is-liked" : "")} onClick={() => toggleLike(track)} title={liked ? "取消喜欢（L）" : "喜欢（L）"}>{liked ? <IconHeartFill size={15} /> : <IconHeart size={15} />}</button>
        <button className="pass__key" onClick={() => { setVolume(volume > 0 ? 0 : 0.7); flashDock(); }} title={volume > 0 ? "静音（M）" : "恢复音量（M）"}><IconVolume size={15} /></button>
      </div>

      <div className="pass__seek" ref={seekRef} onPointerDown={seek} onPointerMove={(e) => { if (e.buttons === 1) seek(e); }} role="slider" aria-label="播放进度" aria-valuenow={Math.round(pct)}>
        <b style={{ width: Math.min(100, pct + 12) + "%" }}></b>
        <i style={{ width: pct + "%" }}></i>
        <span style={{ left: pct + "%" }}></span>
      </div>
      <div className="pass__ticks"><em>{fmt(pos)}</em><em>−{fmt(Math.max(0, total - pos))}</em></div>

      <div className="pass__foot">
        <button className={"pass__pin" + (dockPin ? " is-on" : "")} onClick={() => setDockPin(!dockPin)} title={dockPin ? "取消常驻" : "别在屏幕上常驻"}><IconPick size={11} />{dockPin ? "已别上" : "常驻"}</button>
        <button className="pass__pin" onClick={openPlayer} title="展开播放页（P）"><IconArrowRight size={11} />进舞台</button>
        <span className="pass__hint">空格 / ← → / K</span>
        <button className="pass__close" onClick={() => { setDock(false); setDockPin(false); }} title="收起" aria-label="收起悬浮控制"><IconX size={13} /></button>
      </div>
    </div>
  );
}
