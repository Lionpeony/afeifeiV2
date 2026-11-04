import { PageHead } from "../../PageHead.js";
import type { AppState, TrackId } from "../../../../contracts/index.js";
import { dispatch } from "../../../kernel/index.js";
import { lineStartMs } from "../../../domain/lyrics/cursor.js";
import type { LyricRenderer } from "./useStageLyrics.js";
import { StageArtwork } from "./StageArtwork.js";
import { StageQueuePanel, type QueueRowsProps } from "./StageQueue.js";
import { LyricTimeHero } from "./LyricTimeHero.js";
import { useStageData } from "./useStageData.js";
import { useStageLyrics } from "./useStageLyrics.js";
import { fmt } from "./types.js";
export interface StageMainLayoutProps {
  state: AppState;
  data: ReturnType<typeof useStageData>;
  lyric: ReturnType<typeof useStageLyrics>;
  menuOpen: boolean;
  onToggleMenu(): void;
  onImmersive(): void;
}

export function StageMainLayout({ state, data, lyric, menuOpen, onToggleMenu, onImmersive }: StageMainLayoutProps) {
  const { player, stage, queue } = state;
  const renderer: LyricRenderer = stage.lyricRenderer;
  const rowProps: QueueRowsProps = {
    items: queue.items,
    indices: data.nextIndices,
    playOrder: data.playOrder,
    tracks: data.tracksMap,
    covers: data.queueCovers,
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
      <PageHead
        title={data.nowTitle}
        meta="TYPE IS TIME"
        desc={[data.nowArtist, data.nowAlbum, data.sourceName].filter(Boolean).join(" · ")}
        extra={(
          <span className="st-src">
            <span>QUEUE {queue.items.length ? `${String(Math.max(1, data.cursorPosition + 1)).padStart(2, "0")} / ${queue.items.length}` : "—"}</span>
            <button type="button" className="st-viewbtn" aria-expanded={menuOpen} onClick={onToggleMenu}>视图</button>
            <button type="button" className="st-viewbtn" onClick={onImmersive} title="沉浸播放（Esc 退出）">沉浸</button>
          </span>
        )}
      />
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
          <div className="sh"><b>台词本</b><span>共 {lyric.doc.lines.length} 句 · 显示 {lyric.scriptStart + 1}–{lyric.scriptStart + lyric.scriptLines.length}</span></div>
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
