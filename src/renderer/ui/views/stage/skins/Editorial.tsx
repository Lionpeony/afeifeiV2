import { dispatch } from "../../../../kernel/index.js";
import { Cover, SkinTop, Tape, upNextRows, useTape } from "./shared.js";
import type { SkinProps } from "./registry.js";
import { pad2 } from "../types.js";

/**
 * A · 唱片内页（2026-11-10）。
 *
 * 版式：左一张真唱片（CSS 画，随播放转）、右信息列。
 * 深色 = 暗房单光源；浅色 = 纸面上一枚压上去的黑胶（物理黑不反色，只有投影变化）。
 * 与旧版的差别：封面不再是一张卡片，而是唱片中心的标签；歌词从盘沿长出来。
 */
export function Editorial(props: SkinProps) {
  const { state, data, lyric, playing } = props;
  const tape = useTape(props.durationMs, data.nowDuration);
  const doc = lyric.doc;
  const at = lyric.lineIndex;
  const curText = !props.lyricOn
    ? "歌词层已关闭"
    : lyric.currentLine?.text ?? (doc ? "前奏 · 歌词即将开始" : lyric.note || "正在读取歌词…");
  const prevText = props.lyricOn && doc && at > 0 ? doc.lines[at - 1]?.text ?? "" : "";
  const nextText = props.lyricOn && doc && at >= 0 && at + 1 < doc.lines.length ? doc.lines[at + 1]?.text ?? "" : "";
  const zh = props.lyricOn && state.stage.translation ? lyric.currentLine?.translations?.zh ?? "" : "";
  const rows = upNextRows(data.upNext, data.tracksMap, data.queueRemote);
  const lineNo = doc && at >= 0 ? `LINE ${pad2(at + 1)}/${doc.lines.length}` : "LINE —";

  return (
    <div className="sk sk-ed" data-tone={props.tone}>
      <i className="sk-ed-halo" aria-hidden="true" />
      <SkinTop
        live={props.live}
        queue={`QUEUE ${state.queue.items.length ? `${pad2(Math.max(1, data.cursorPosition + 1))}/${state.queue.items.length}` : "—"}`}
        line={lineNo}
        codec="FLAC 44.1"
        shelfOpen={props.shelfOpen}
        viewOpen={props.viewOpen}
        onShelf={props.onShelf}
        onView={props.onView}
      />

      <div className="sk-ed-body">
        <div className="sk-ed-platter">
          {/* 只有盘面的反光在流动：转速靠 sheen 表现，封面与标签必须静止，
              否则旋转容器里的圆角裁剪会掉、封面上的字也会被转歪（第一版真机截图证实） */}
          <div className="sk-ed-disc" data-playing={playing ? "on" : "off"}>
            <i className="sk-ed-grooves" aria-hidden="true" />
            <i className="sk-ed-sheen" aria-hidden="true" />
          </div>
          <span className="sk-ed-label"><Cover url={data.coverUrl} className="lab" /></span>
          <i className="sk-ed-hole" aria-hidden="true" />
          <i className="sk-ed-rim" aria-hidden="true" />
        </div>

        <section className="sk-ed-info">
          <div className="sk-ed-eyebrow mono">
            <span>{data.sourceName}</span>
            <span className="dot" aria-hidden="true" />
            <span>{playing ? "PLAYING" : "PAUSED"}</span>
          </div>
          <h1 className="sk-ed-title" title={data.nowTitle}>{data.nowTitle}</h1>
          <p className="sk-ed-meta">
            {[data.nowArtist, data.nowAlbum].filter(Boolean).join(" · ") || "—"}
          </p>

          <Tape api={tape} />

          <div className="sk-ed-lyr" aria-live="polite">
            {prevText ? <p className="prev">{prevText}</p> : null}
            <p className="cur" key={at}>{curText}</p>
            {nextText ? <p className="next">{nextText}</p> : null}
            {zh ? <p className="zh">{zh}</p> : null}
          </div>

          {rows.length ? (
            <div className="sk-ed-next">
              <span className="k mono">接下来</span>
              <ul>
                {rows.map((row, index) => (
                  <li key={`${row.id}-${index}`}>
                    <button type="button" title={`播放 ${row.title}`} onClick={() => dispatch({
                      type: "player/play",
                      trackId: row.id,
                      trackTitle: row.title ?? null,
                    })}>
                      <b className="mono">{pad2(data.cursorPosition + 2 + index)}</b>
                      <span>{row.title}</span>
                      {row.artist ? <small>{row.artist}</small> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
