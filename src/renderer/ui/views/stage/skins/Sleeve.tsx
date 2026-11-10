import { useRef } from "react";
import { dispatch } from "../../../../kernel/index.js";
import { pad2 } from "../types.js";
import type { SkinProps } from "./registry.js";
import { Cover, KaraokeLine, SkinTop, Tape, fitScale, upNextRows, usePulse, useTape } from "./shared.js";

/**
 * A · 封套（2026-11-10 重做）。
 *
 * 播放页 = 一张唱片封套摊在桌上，黑胶从右侧抽出一半。
 * 深度只靠一道环境光 + 投影：不画光柱、不画雾 —— 上一版把"演出"理解成光效叠加，
 * 结果是满屏黄泥。这一版把"演出"交给物件本身：盘在转、封面会随指针微微倾。
 */
export function Sleeve(props: SkinProps) {
  const { state, data, lyric, playing } = props;
  const tape = useTape(props.durationMs, data.nowDuration);
  const doc = lyric.doc;
  const at = lyric.lineIndex;
  const cur = !props.lyricOn
    ? "歌词层已关闭"
    : lyric.currentLine?.text ?? (doc ? "前奏 · 歌词即将开始" : lyric.note || "正在读取歌词…");
  // 内页歌词是一小段（当前句 ±2 行），不是"上一句/下一句"两条 ——
  // 一段正文才能填住标题与信息栏之间的空
  const from = doc ? Math.max(0, at - 1) : 0;
  const lyricWindow = doc ? doc.lines.slice(from, from + 3) : [];
  const zh = props.lyricOn && state.stage.translation ? lyric.currentLine?.translations?.zh ?? "" : "";
  const rows = upNextRows(data.upNext, data.tracksMap, data.queueRemote).slice(0, 3);
  const rootRef = useRef<HTMLDivElement>(null);
  // 低频脉冲只推动 ON AIR 点与走带头（不是满屏闪）
  usePulse(rootRef, props.spectrum);

  // 指针视差：封套随指针轻微翻，幅度很小（-2.2° / 3°），像桌上的一张厚纸
  const onMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const host = rootRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const mx = ((event.clientX - r.left) / r.width - 0.5) * 2;
    const my = ((event.clientY - r.top) / r.height - 0.5) * 2;
    host.style.setProperty("--mx", mx.toFixed(3));
    host.style.setProperty("--my", my.toFixed(3));
  };
  const onLeave = (): void => {
    rootRef.current?.style.setProperty("--mx", "0");
    rootRef.current?.style.setProperty("--my", "0");
  };

  return (
    <div
      className="sk sk-sl"
      data-tone={props.tone}
      data-playing={playing ? "on" : "off"}
      ref={rootRef}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <SkinTop
        live={props.live}
        playing={props.playing}
        queue={`QUEUE ${state.queue.items.length ? `${pad2(Math.max(1, data.cursorPosition + 1))}/${state.queue.items.length}` : "—"}`}
        line={doc && at >= 0 ? `LINE ${pad2(at + 1)}/${doc.lines.length}` : "LINE —"}
        codec="FLAC 44.1"
        shelfOpen={props.shelfOpen}
        viewOpen={props.viewOpen}
        onShelf={props.onShelf}
        onView={props.onView}
      />

      <div className="sl-grid">
        <div className="sl-sleeve">
          <div className="sl-vinyl" aria-hidden="true" />
          {/* 顶光反射带：盖在盘上、藏在封套下——盘转它不转，槽纹扫过这道静止的光 */}
          <i className="sl-sheen" aria-hidden="true" />
          <div className="sl-art">
            {data.coverUrl ? (
              <img key={data.coverUrl} src={data.coverUrl} alt="" draggable={false} />
            ) : (
              <i className="ph" aria-hidden="true" />
            )}
            <span className="sl-spine" aria-hidden="true" />
            <span className="sl-cat mono">AF-{pad2(data.cursorPosition + 1)}<br />STEREO</span>
            <span className="sl-covt">{data.nowTitle}</span>
            <span className="sl-cova mono">AFEIFEI PRESS</span>
            {/* 换曲扫光：key 换一次就重新播一次 */}
            <i className="sl-sweep" key={data.coverUrl ?? "ph"} aria-hidden="true" />
          </div>
        </div>

        <section className="sl-info">
          <div className="sl-kick mono">
            <span className="side">SIDE A</span>
            <span>TRACK {pad2(data.cursorPosition + 1)}</span>
            <span>{data.nowDuration ? `${Math.floor(data.nowDuration / 60000)}:${pad2(Math.floor((data.nowDuration % 60000) / 1000))}` : "--:--"}</span>
          </div>
          <h1
            className="sl-title"
            title={data.nowTitle}
            style={{ "--fit": fitScale(data.nowTitle) } as React.CSSProperties}
          >{data.nowTitle}</h1>
          <p className="sl-artist">{[data.nowArtist, data.nowAlbum].filter(Boolean).join(" · ") || "—"}</p>
          <div className="sl-rule" />
          <div className="sl-lyr" aria-live="polite">
            {doc ? (
              lyricWindow.map((line, index) => (
                from + index === at
                  ? <KaraokeLine key={`k-${at}`} doc={doc} at={at} className="cur" />
                  : <p key={`${from + index}-${line.text}`} className="line">{line.text}</p>
              ))
            ) : (
              <p className="cur" key={cur}>{cur}</p>
            )}
            {zh ? <p className="zh">{zh}</p> : null}
          </div>
          {/* 内页信息：真唱片内页都有这一栏（厂牌/格式/面次），
              也把「只有一句歌词」时的中下段填实 */}
          <div className="sl-meta mono">
            <div><b>LABEL</b><span>AFEIFEI PRESS</span></div>
            <div><b>FORMAT</b><span>FLAC 44.1 / 16</span></div>
            <div><b>SIDE</b><span>A · {pad2(data.cursorPosition + 1)}</span></div>
          </div>
          {rows.length ? (
            <div className="sl-tbl">
              {rows.map((row, index) => (
                <button
                  key={`${row.id}-${index}`}
                  type="button"
                  title={`播放 ${row.title}`}
                  onClick={() => dispatch({ type: "player/play", trackId: row.id, trackTitle: row.title })}
                >
                  <span className="no mono">{pad2(data.cursorPosition + 2 + index)}</span>
                  <span className="t">{row.title}</span>
                  <span className="mono">{row.artist}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <Tape api={tape} />
    </div>
  );
}
