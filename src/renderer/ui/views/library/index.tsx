import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import {
  getFiltered,
  getQuery,
  getTracks,
  setQuery,
  subscribe as subscribeLibrary,
} from "../../../domain/library/state.js";
import { isLiked, subscribe as subscribeLikes, toggleLike } from "../../../domain/likes/index.js";
import { peekCover } from "../../../domain/library/cover.js";
import { selectVisible } from "../../../projection/library.js";

const ROW_HEIGHT = 38;

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

interface CoverProps {
  id: string;
  path: string;
  hasCover: boolean;
  load: (id: string, path: string) => Promise<string | null>;
}

/** 封面按需加载：只有真的渲染到这一行才去请求。 */
function Cover({ id, path, hasCover, load }: CoverProps) {
  const [state, setState] = useState(() => {
    const hit = peekCover(id);
    return hit === undefined ? { loaded: false, url: null as string | null } : { loaded: true, url: hit };
  });

  useEffect(() => {
    if (state.loaded || !hasCover) return;
    let alive = true;
    void load(id, path).then((url) => {
      if (alive) setState({ loaded: true, url });
    });
    return () => {
      alive = false;
    };
  }, [id, path, hasCover, load, state.loaded]);

  if (state.url) return <img className="lib-cover" src={state.url} alt="" />;
  return <span className="lib-cover lib-cover--empty" aria-hidden="true" />;
}

export interface LibraryViewProps {
  onPlay(index: number): void;
  onScan(): void;
  scanning: boolean;
  scanNote: string;
  cover(id: string, path: string): Promise<string | null>;
}

type Mode = "all" | "likes";

/**
 * 曲库页（M2）：搜索 + 虚拟列表 + 收藏。
 *
 * 虚拟化是硬要求不是优化：5000 行全渲染时，滚动会让 React 每帧协调 5000 个节点。
 * 这里只渲染可见区间（约 30 行），其余交给 translateY 和总高撑滚动条。
 */
export function LibraryView({ onPlay, onScan, scanning, scanNote, cover }: LibraryViewProps) {
  const [rows, setRows] = useState<Track[]>(getFiltered());
  const [keyword, setKeyword] = useState(getQuery());
  const [total, setTotal] = useState(getTracks().length);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const [mode, setMode] = useState<Mode>("all");
  const [likeTick, setLikeTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribeLibrary(() => {
        setRows(getFiltered());
        setTotal(getTracks().length);
      }),
    [],
  );

  useEffect(() => subscribeLikes(() => setLikeTick((t) => t + 1)), []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = (): void => setViewport(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shown = useMemo(
    () => (mode === "likes" ? rows.filter((t) => isLiked(t.id)) : rows),
    [rows, mode, likeTick],
  );

  const win = selectVisible(shown.length, scrollTop, viewport, ROW_HEIGHT);
  const visible = shown.slice(win.start, win.end);

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
        <div className="lib-tabs">
          <button type="button" className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>
            全部
          </button>
          <button type="button" className={mode === "likes" ? "on" : ""} onClick={() => setMode("likes")}>
            收藏
          </button>
        </div>
        <button type="button" onClick={onScan} disabled={scanning}>
          {scanning ? "扫描中…" : "扫描目录"}
        </button>
        <span className="lib-count">
          {shown.length === total ? `${total} 首` : `${shown.length} / ${total}`}
        </span>
      </div>

      {scanNote ? <p className="lib-note">{scanNote}</p> : null}

      <div className="lib-list" ref={listRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
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
                <Cover id={track.id} path={track.path} hasCover={track.hasCover} load={cover} />
                <span className="lib-title">
                  {track.title}
                  {track.missing ? <em className="lib-missing">缺失</em> : null}
                </span>
                <span className="lib-artist">{track.artist}</span>
                <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
                <button
                  type="button"
                  className={`lib-like${isLiked(track.id) ? " on" : ""}`}
                  aria-label={isLiked(track.id) ? "取消收藏" : "收藏"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(track.id);
                  }}
                >
                  ♥
                </button>
              </div>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="lib-empty">
            {mode === "likes" ? "还没有收藏。点列表右边的 ♥ 试试。" : "还没有歌。点「扫描目录」选一个音乐文件夹。"}
          </p>
        ) : null}
      </div>
    </section>
  );
}
