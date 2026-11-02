import { useEffect, useRef, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { getFiltered, getQuery, getTracks, setQuery, subscribe } from "../../../domain/library/state.js";
import { selectVisible } from "../../../projection/library.js";

const ROW_HEIGHT = 34;

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export interface LibraryViewProps {
  onPlay(index: number): void;
  onScan(): void;
  scanning: boolean;
  scanNote: string;
}

/**
 * 曲库页（M2）：搜索 + 虚拟列表。
 *
 * 虚拟化是硬要求不是优化：5000 行全渲染时，滚动会让 React 每帧协调 5000 个节点。
 * 这里只渲染可见区间（约 30 行），其余交给 translateY 和总高撑滚动条。
 */
export function LibraryView({ onPlay, onScan, scanning, scanNote }: LibraryViewProps) {
  const [rows, setRows] = useState<Track[]>(getFiltered());
  const [keyword, setKeyword] = useState(getQuery());
  const [total, setTotal] = useState(getTracks().length);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribe(() => {
        setRows(getFiltered());
        setTotal(getTracks().length);
      }),
    [],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = (): void => setViewport(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const win = selectVisible(rows.length, scrollTop, viewport, ROW_HEIGHT);
  const visible = rows.slice(win.start, win.end);

  return (
    <section className="library">
      <div className="lib-head">
        <input
          className="search"
          value={keyword}
          placeholder="搜索：歌名 / 歌手 / 拼音首字母"
          onChange={(e) => {
            setKeyword(e.target.value);
            setQuery(e.target.value);
          }}
        />
        <button type="button" onClick={onScan} disabled={scanning}>
          {scanning ? "扫描中…" : "扫描目录"}
        </button>
        <span className="lib-count">
          {rows.length === total ? `${total} 首` : `${rows.length} / ${total}`}
        </span>
      </div>

      {scanNote ? <p className="lib-note">{scanNote}</p> : null}

      <div
        className="lib-list"
        ref={listRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: win.totalHeight, position: "relative" }}>
          <div style={{ transform: `translateY(${win.offsetY}px)` }}>
            {visible.map((track, offset) => (
              <div
                key={track.id}
                className="lib-row"
                data-missing={track.missing ? "true" : undefined}
                style={{ height: ROW_HEIGHT }}
                onClick={() => onPlay(win.start + offset)}
                title={track.missing ? `${track.path}（文件已不在）` : track.path}
              >
                <span className="lib-title">
                  {track.title}
                  {track.missing ? <em className="lib-missing">缺失</em> : null}
                </span>
                <span className="lib-artist">{track.artist}</span>
                <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>
        {rows.length === 0 ? <p className="lib-empty">还没有歌。点「扫描目录」选一个音乐文件夹。</p> : null}
      </div>
    </section>
  );
}
