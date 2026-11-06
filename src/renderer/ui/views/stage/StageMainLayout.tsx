import { PageHead } from "../../PageHead.js";
import type { AppState, TrackId } from "../../../../contracts/index.js";
import { dispatch } from "../../../kernel/index.js";
import { lineStartMs } from "../../../domain/lyrics/cursor.js";
import { onTick } from "../../compositor.js";
import { useEffect, useRef } from "react";
import type { LyricRenderer } from "./useStageLyrics.js";
import { StageArtwork } from "./StageArtwork.js";
import { StageQueuePanel, type QueueRowsProps } from "./StageQueue.js";
import { LyricTimeHero } from "./LyricTimeHero.js";
import { useStageData } from "./useStageData.js";
import { useStageLyrics } from "./useStageLyrics.js";
import { fmt, pad2 } from "./types.js";
export interface StageMainLayoutProps {
  state: AppState;
  data: ReturnType<typeof useStageData>;
  lyric: ReturnType<typeof useStageLyrics>;
  /** 直播壳：换不夜台的播出条与提词器，纸面 PageHead 不进来。 */
  live: boolean;
  menuOpen: boolean;
  onToggleMenu(): void;
}

/**
 * 播出条：不夜台直播间的主标题不是「一篇文章的标题」，是导播台上的一行在播信息。
 * 上排四格（ON AIR / 队列 / 行号 / 走带），下排曲名与出处，底边是整条走带进度。
 * 时间与进度用 onTick 直接写 DOM，不把 60Hz 拉进 React。
 */
function AirHeader({
  title,
  sub,
  queue,
  line,
  duration,
  menuOpen,
  onToggleMenu,

}: {
  title: string;
  sub: string;
  queue: string;
  line: string;
  duration: number;
  menuOpen: boolean;
  onToggleMenu(): void;
}) {
  const timeRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLElement>(null);
  useEffect(() => onTick((time) => {
    if (timeRef.current) {
      const text = `${fmt(time)} / ${fmt(duration)}`;
      if (timeRef.current.textContent !== text) timeRef.current.textContent = text;
    }
    if (fillRef.current) fillRef.current.style.width = duration > 0 ? `${Math.min(100, (time / duration) * 100).toFixed(2)}%` : "0%";
  }), [duration]);
  return (
    <header className="st-air">
      <div className="st-air-top">
        <span className="st-air-badge"><i aria-hidden="true" />ON AIR</span>
        <span className="st-air-slot">{queue}</span>
        <span className="st-air-line">{line}</span>
        <span className="st-air-clock tabnum" ref={timeRef}>0:00 / {fmt(duration)}</span>
        <span className="st-air-tools">
          <button type="button" className="st-viewbtn" aria-expanded={menuOpen} onClick={onToggleMenu}>视图</button>

        </span>
      </div>
      <div className="st-air-main">
        <h1>{title}</h1>
        <p>{sub || "—"}</p>
      </div>
      <span className="st-air-progress" aria-hidden="true"><i ref={fillRef} /></span>
    </header>
  );
}

export function StageMainLayout({ state, data, lyric, live, menuOpen, onToggleMenu }: StageMainLayoutProps) {
  const { player, stage, queue } = state;
  const renderer: LyricRenderer = stage.lyricRenderer;
  const rowProps: QueueRowsProps = {
    items: queue.items,
    indices: data.nextIndices,
    playOrder: data.playOrder,
    tracks: data.tracksMap,
    covers: data.queueCovers,
    remote: data.queueRemote,
    onPlay: (id: TrackId) => dispatch({ type: "player/play", trackId: id, trackTitle: data.tracksMap.get(id)?.title ?? null }),
    onMove: (index, delta) => dispatch({ type: "queue/move", from: index, to: index + delta }),
    onRemove: (index) => dispatch({ type: "queue/remove", index }),
  };

  const hero = stage.layers.lyric ? (
    renderer === "minimal" ? (
      lyric.doc ? (
        <section className="st-lyr-hero" aria-label="歌词">
          <p className="st-min" key={lyric.lineIndex}>{lyric.currentLine?.text ?? "—"}</p>
          {stage.translation && lyric.currentLine?.translations?.zh
            ? <p className="st-trans">{lyric.currentLine.translations.zh}</p>
            : null}
        </section>
      ) : <p className="st-lyric-empty">{lyric.note || "正在读取歌词…"}</p>
    ) : renderer === "theatrical" ? (
      lyric.doc && lyric.lineIndex >= 0 ? (
        <section className="st-lyr-hero" aria-label="歌词">
          <div className="st-theatrical">
            <p className="st-prev">{lyric.lineIndex > 0 ? lyric.doc.lines[lyric.lineIndex - 1].text : "—"}</p>
            <p className="st-min">{lyric.currentLine?.text ?? "—"}</p>
            {stage.translation && lyric.currentLine?.translations?.zh
              ? <p className="st-trans">{lyric.currentLine.translations.zh}</p>
              : null}
            <p className="st-next">{lyric.lineIndex + 1 < lyric.doc.lines.length ? lyric.doc.lines[lyric.lineIndex + 1].text : "（本段终）"}</p>
          </div>
        </section>
      ) : <p className="st-lyric-empty">{lyric.doc ? "前奏 · 歌词即将开始" : lyric.note || "正在读取歌词…"}</p>
    ) : (
      <LyricTimeHero
        doc={lyric.doc}
        note={lyric.note}
        line={lyric.currentLine}
        lineIndex={lyric.lineIndex}
        wordIndex={lyric.wordIndex}
        renderer={renderer}
        translationOn={stage.translation}
        onSeek={(positionMs) => dispatch({ type: "player/seek", positionMs })}
      />
    )
  ) : <p className="st-lyric-empty">歌词层已关闭</p>;

  return (
    <div className="st-page">
      {live ? (
        <AirHeader
          title={data.nowTitle}
          sub={[data.nowArtist, data.nowAlbum, data.sourceName].filter(Boolean).join(" · ")}
          queue={`QUEUE ${queue.items.length ? `${pad2(Math.max(1, data.cursorPosition + 1))} / ${queue.items.length}` : "—"}`}
          line={lyric.doc && lyric.lineIndex >= 0 ? `LINE ${pad2(lyric.lineIndex + 1)} / ${lyric.doc.lines.length}` : "LINE —"}
          duration={data.nowDuration}
          menuOpen={menuOpen}
          onToggleMenu={onToggleMenu}

        />
      ) : (
        <PageHead
          title={data.nowTitle}
          meta="TYPE IS TIME"
          desc={[data.nowArtist, data.nowAlbum, data.sourceName].filter(Boolean).join(" · ")}
          extra={(
            <span className="st-src">
              <span>QUEUE {queue.items.length ? `${String(Math.max(1, data.cursorPosition + 1)).padStart(2, "0")} / ${queue.items.length}` : "—"}</span>
              <button type="button" className="st-viewbtn" aria-expanded={menuOpen} onClick={onToggleMenu}>视图</button>

            </span>
          )}
        />
      )}
      <div className="st-body">
        <section className="st-lyr">{hero}</section>
        <aside className="st-side">
          <div className="st-side-scroll">
            {data.upNext.length ? (
              <StageQueuePanel {...rowProps} total={queue.items.length} cursor={queue.cursor} />
            ) : (<p className="st-side-empty">队列里没有下一首</p>)}
            <StageArtwork
              items={data.carouselItems}
              coverUrl={data.coverUrl}
              title={data.nowTitle}
              artist={data.nowArtist}
              album={data.nowAlbum}
              duration={data.nowDuration}
              queueCursor={queue.cursor}
            />
          </div>
        </aside>
      </div>
      {stage.layers.lyric && lyric.doc && lyric.scriptLines.length ? (
        <div className="st-script">
          <div className="sh"><b>{live ? "提词器" : "台词本"}</b><span>共 {lyric.doc.lines.length} 句 · 显示 {lyric.scriptStart + 1}–{lyric.scriptStart + lyric.scriptLines.length}</span></div>
          <div className="rows">
            {lyric.scriptLines.map((line, index) => {
              const absoluteIndex = lyric.scriptStart + index;
              return (
                <button
                  type="button"
                  key={`${line.startMs}-${absoluteIndex}`}
                  className={`st-srow${absoluteIndex === lyric.lineIndex ? " cur" : ""}${absoluteIndex < lyric.lineIndex ? " past" : ""}`}
                  onClick={() => {
                    const at = lineStartMs(lyric.doc!, absoluteIndex);
                    if (at !== null) dispatch({ type: "player/seek", positionMs: at });
                  }}
                  title="跳到这句"
                >
                  <i className="no">{String(absoluteIndex + 1).padStart(2, "0")}</i>
                  <time>{fmt(line.startMs)}</time>
                  <span className="tx">{line.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
