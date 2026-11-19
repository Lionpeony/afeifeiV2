/* 本地音乐 / 下载管理 · 原型 .page.loc（真实曲库 + 下载投影） */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { Track } from "../../../domain/library/schema.js";
import { selectVisible } from "../../../projection/library.js";
import { useAf } from "../context.js";
import { hashStr, TrackArt } from "../art.js";
import { GuitarFigure, IconDownload, IconFolder, IconNote, IconPlay, IconRefresh } from "../icons.js";
import { Tape } from "../ui.js";

const ROW_H = 56;const fmt = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const LocalRow = memo(function LocalRow({ t, index, onPlay }: { t: Track; index: number; onPlay(i: number): void }) {
  const h = hashStr(t.id);
  const g = [["#FFE3EC", "#D9CDF6"], ["#E6F0FF", "#BFE8E0"], ["#FFF3D6", "#F7C7D8"], ["#EBE3FF", "#FFD3E2"], ["#E2F6EF", "#CFE0FA"]][h % 5]!;
  return (
    <div className="loc-row" style={{ height: ROW_H, boxSizing: "border-box" }} onClick={() => onPlay(index)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onPlay(index); }}>
      <span className="loc-row__art" style={{ width: 36, height: 36, flex: "none", borderRadius: 8, background: `linear-gradient(140deg,${g[0]},${g[1]})` }} />
      <span className="loc-row__main">
        <span className="loc-row__title truncate">{t.title}</span>
        <span className="loc-row__path truncate">{t.path}</span>
      </span>
      <span className="loc-row__tag">本地</span>
      <span className="loc-row__fmt num">{mb(t.size)}</span>
      <span className="loc-row__dur num">{fmt(t.durationMs)}</span>
      <button className="icon-btn" title="播放" onClick={(e) => { e.stopPropagation(); onPlay(index); }}><IconPlay size={15} /></button>
    </div>
  );
});

export function LocalPage({
  mode,
  tracks,
  scanning,
  scanNote,
  onScan,
  onPlayGroup,
  downloads,
}: {
  mode: "local" | "downloads";
  tracks: Track[];
  scanning: boolean;
  scanNote: string;
  onScan(): void;
  onPlayGroup(tracks: Track[], startAt: number): void;
  downloads: ReactNode;
}) {
  const af = useAf();
  const isLocal = mode === "local";
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(480);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = (): void => setViewport(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLocal, tracks.length]);
  const win = selectVisible(tracks.length, scrollTop, viewport, ROW_H, 3);
  const visible = tracks.slice(win.start, win.end);
  const playRef = useRef<(i: number) => void>(() => {});
  playRef.current = (i) => { onPlayGroup(tracks, i); af.openPlayer(); };
  const onPlay = useCallback((i: number) => playRef.current(i), []);

  return (
    <div className="page loc" data-screen-label={isLocal ? "本地音乐" : "下载管理"}>
      <div className="loc__head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>{isLocal ? "LOCAL LIBRARY · 这台电脑" : "DOWNLOADS · 缓存目录"}</div>
          <h1 className="display">{isLocal ? "本地音乐" : "下载管理"}</h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 460 }}>
            {isLocal ? "扫一遍硬盘里的音频文件，只读路径，不改动原文件。" : "下载只是把音源那边的文件存到本地缓存，卸载时就一起清掉。"}
          </p>
        </div>
        <div className="row gap8">
          <button className="btn btn-ghost btn-sm" disabled={tracks.length === 0} onClick={() => { if (tracks[0]) { onPlayGroup(tracks, 0); af.openPlayer(); } }}>
            <IconPlay size={13} />试听一首
          </button>
        </div>
      </div>

      <div className="loc__tabs">
        <button className={"loc__tab" + (isLocal ? " is-on" : "")} onClick={() => af.setPage("local")}>本地音乐</button>
        <button className={"loc__tab" + (!isLocal ? " is-on" : "")} onClick={() => af.setPage("downloads")}>下载管理</button>
        <span className="spacer"></span>
        <span className="meta num">{isLocal ? `${tracks.length} 个文件` : "下载缓存"}</span>
      </div>

      {isLocal ? (
        <>
          <div className="scan-bar">
            <div className="scan-bar__left">
              <IconFolder size={16} style={{ color: "var(--text-3)" }} />
              <span className="meta">{scanNote || "曲库目录由设置时的扫描结果决定"}</span>
            </div>
            <button className={"btn btn-soft btn-sm" + (scanning ? " is-busy" : "")} onClick={onScan} disabled={scanning}>
              {scanning ? <><IconRefresh size={13} />扫描中…</> : <><IconFolder size={13} />扫描本地文件夹</>}
            </button>
          </div>

          {scanning ? (
            <div className="scan-loading">
              <span className="scan-loading__guitar"><GuitarFigure w={120} h={58} /></span>
              <span className="hand">正在数文件夹里的音轨……</span>
            </div>
          ) : null}

          <div className="paper loc__sheet">
            <Tape w={64} rot={-2} style={{ top: -9, left: 28 }} />
            <div className="loc__sheet-head">
              <span className="eyebrow">本地文件 · 按修改时间</span>
              <span className="meta">共 {tracks.length} 首</span>
            </div>
            {tracks.length === 0 ? (
              <p className="lib-empty">曲库还是空的。点上面的「扫描本地文件夹」把硬盘里的音乐收进来。</p>
            ) : (
              <div className="loc-list" ref={listRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} style={{ position: "relative", maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
                <div style={{ position: "relative", height: win.totalHeight }}>
                  <div style={{ transform: `translateY(${win.offsetY}px)` }}>
                    {visible.map((t, j) => {
                      const i = win.start + j;
                      return <LocalRow key={t.id} t={t} index={i} onPlay={onPlay} />;
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="row gap8" style={{ marginTop: 18 }}>
            <IconNote size={13} style={{ color: "var(--text-3)" }} />
            <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>本地文件不进「我喜欢的音乐」，除非你手动点红心。</span>
          </div>
        </>
      ) : (
        <>
          {downloads}
          <div className="row gap8" style={{ marginTop: 18 }}>
            <IconDownload size={13} style={{ color: "var(--text-3)" }} />
            <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>进度条上的拨片走到头，这首就落地了。</span>
          </div>
        </>
      )}
    </div>
  );
}
