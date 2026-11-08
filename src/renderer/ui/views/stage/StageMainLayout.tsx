import { PageHead } from "../../PageHead.js";
import type { AppState, TrackId } from "../../../../contracts/index.js";
import { dispatch, getState } from "../../../kernel/index.js";
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
  /** 引擎时长（I1 同源）：在线曲目不在本地曲库表，元数据时长恒 0，走带只认引擎 */
  durationMs(): number;
  /** 走带上一首要读当前已播（3 秒内 = 重头播），与控制台同一时钟 */
  positionMs(): number;
  notify(n: { text: string; url?: string } | null): void;
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
  durationMs,
  metaDuration,
  playing,
  menuOpen,
  onToggleMenu,
  positionMs,
  notify,
}: {
  title: string;
  sub: string;
  queue: string;
  line: string;
  durationMs(): number;
  /** 引擎时长为 0（在线流 metadata 恒缺）时的回落值：队列在线元数据时长 */
  metaDuration: number;
  playing: boolean;
  menuOpen: boolean;
  onToggleMenu(): void;
  positionMs(): number;
  notify(n: { text: string; url?: string } | null): void;
}) {
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  // 走带时长：引擎优先（本地曲目实时准），在线流拿不到就回落队列元数据
  const resolveDuration = (): number => {
    const fromEngine = durationMs();
    return fromEngine > 0 ? fromEngine : metaDuration;
  };
  useEffect(() => onTick((time) => {
    // 每帧读一次时长（曲切换了也不会显示上一首的）。两路都缺时总时长显示 --:--，
    // 不摆一个假的 0:00。拖动中不写已播：那时显示的应该是"要跳到哪儿"，
    // 不是"现在在哪"（与控制台 P0-03 同语义）
    const duration = resolveDuration();
    const total = duration > 0 ? fmt(duration) : "--:--";
    if (timeRef.current && !dragging.current) {
      const text = `${fmt(time)} / ${total}`;
      if (timeRef.current.textContent !== text) timeRef.current.textContent = text;
    }
    if (barRef.current && !dragging.current) {
      barRef.current.max = String(Math.max(1, Math.round(duration)));
      barRef.current.value = String(Math.round(Math.min(time, duration || time)));
      const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
      barRef.current.style.setProperty("--fill", `${pct.toFixed(2)}%`);
    }
  }), [durationMs, metaDuration]);
  return (
    <header className="st-air">
      <div className="st-air-top">
        <span className="st-air-badge"><i aria-hidden="true" />ON AIR</span>
        <span className="st-air-slot">{queue}</span>
        <span className="st-air-line">{line}</span>
        <span className="st-air-clock tabnum" ref={timeRef}>0:00 / {resolveDuration() > 0 ? fmt(resolveDuration()) : "--:--"}</span>
        <span className="st-air-tools">
          {/* 导播走带：舞台是主播出面，切歌不该逼用户移到底栏（图标与控制台同一套 CSS 三角） */}
          <button
            type="button"
            className="st-tb"
            aria-label="上一首"
            onClick={() => dispatch({ type: "queue/prev", atPositionMs: positionMs() })}
          >
            <i className="tb-ic ic-prev">
              <i />
              <i />
            </i>
          </button>
          <button type="button" className="st-tb main" aria-label={playing ? "暂停" : "播放"} onClick={() => dispatch({ type: "player/toggle" })}>
            <i className={`tb-ic ${playing ? "ic-pause" : "ic-play"}`}>
              <i />
              {playing ? <i /> : null}
            </i>
          </button>
          <button
            type="button"
            className="st-tb"
            aria-label="下一首"
            onClick={() => {
              const before = getState().player.trackId;
              dispatch({ type: "queue/next" });
              // 没换歌 = 队列里没得切（在线单曲不进队列），与控制台同一句提示
              if (getState().player.trackId === before) {
                const stuck = getState();
                notify({ text: stuck.queue.stream ? "正在续下一批…" : "队列里没有下一首" });
              }
            }}
          >
            <i className="tb-ic ic-next">
              <i />
              <i />
            </i>
          </button>
          <button type="button" className="st-viewbtn" aria-expanded={menuOpen} onClick={onToggleMenu}>视图</button>

        </span>
      </div>
      <div className="st-air-main">
        <h1>{title}</h1>
        <p>{sub || "—"}</p>
      </div>
      {/* 底边整条是走带轨：原生 range 保住键盘/拖拽语义，松手才提交（P0-03） */}
      <input
        ref={barRef}
        className="st-air-progress"
        type="range"
        min="0"
        max="1"
        step="1"
        defaultValue="0"
        aria-label="播放进度"
        onPointerDown={() => {
          dragging.current = true;
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          dispatch({ type: "player/seek", positionMs: Number(e.currentTarget.value) });
        }}
        // 指针在窗外交代时 pointerup 可能收不到：丢捕获也要收尾
        onLostPointerCapture={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          dispatch({ type: "player/seek", positionMs: Number(e.currentTarget.value) });
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onChange={(e) => {
          // 拖动中：只画预览（琥珀填充 + 时间），不触发 seek
          if (!dragging.current) {
            dispatch({ type: "player/seek", positionMs: Number(e.target.value) });
            return;
          }
          const v = Number(e.target.value);
          const duration = resolveDuration();
          if (timeRef.current) timeRef.current.textContent = `${fmt(v)} / ${duration > 0 ? fmt(duration) : "--:--"}`;
          const pct = duration > 0 ? Math.min(100, (v / duration) * 100) : 0;
          e.currentTarget.style.setProperty("--fill", `${pct.toFixed(2)}%`);
        }}
      />
    </header>
  );
}

export function StageMainLayout({ state, data, lyric, live, menuOpen, onToggleMenu, durationMs, positionMs, notify }: StageMainLayoutProps) {
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
          durationMs={durationMs}
          metaDuration={data.nowDuration}
          playing={player.status === "playing"}
          menuOpen={menuOpen}
          onToggleMenu={onToggleMenu}
          positionMs={positionMs}
          notify={notify}

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
