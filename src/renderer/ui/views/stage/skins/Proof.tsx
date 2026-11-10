import { pad2 } from "../types.js";
import { useRef } from "react";
import { dispatch } from "../../../../kernel/index.js";
import type { SkinProps } from "./registry.js";
import { KaraokeLine, SkinTop, Tape, fitScale, upNextRows, usePulse, useTape } from "./shared.js";

const fmtDur = (ms: number | undefined): string => {
  if (!ms || ms <= 0) return "--:--";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
};

/**
 * C · 校样（2026-11-10 重做）。
 *
 * 播放页 = 一张反白印刷校样：出血大标题带套印偏移、四角裁切标记、色标、条码。
 * 三栏（歌词 / 曲目表 / 技术信息）就是它的信息结构 —— 密，但不乱；
 * 动效只做两件印刷的事：换曲时套印抖一下、歌词逐行"落版"。
 */
export function Proof(props: SkinProps) {
  const { state, data, lyric, playing } = props;
  const tape = useTape(props.durationMs, data.nowDuration);
  const rootRef = useRef<HTMLDivElement>(null);
  usePulse(rootRef, props.spectrum);
  const doc = lyric.doc;
  const at = lyric.lineIndex;
  const cur = !props.lyricOn
    ? "歌词层已关闭"
    : lyric.currentLine?.text ?? (doc ? "前奏 · 歌词即将开始" : lyric.note || "正在读取歌词…");
  const zh = props.lyricOn && state.stage.translation ? lyric.currentLine?.translations?.zh ?? "" : "";

  // 歌词栏：从当前句往前一行开始，最多 9 行 —— 校样的正文栏是"一片"，不是一句
  const from = doc ? Math.max(0, at - 1) : 0;
  const lines = doc ? doc.lines.slice(from, from + 14) : [];
  // 表头写的是队列总量，表里就该给出足够多行；只取 3 行会让"58 TRACKS / 3 行"自相矛盾
  const queue = state.queue;
  const nextIds = data.playOrder
    .slice(data.cursorPosition + 1, data.cursorPosition + 7)
    .map((at) => queue.items[at])
    .filter((id): id is string => Boolean(id));
  const rows = upNextRows(nextIds, data.tracksMap, data.queueRemote);
  const title = data.nowTitle;

  return (
    <div className="sk sk-pf" data-tone={props.tone} ref={rootRef}>
      <SkinTop
        live={props.live}
        queue={`PROOF ${pad2(data.cursorPosition + 1)}`}
        line={doc && at >= 0 ? `LINE ${pad2(at + 1)}/${doc.lines.length}` : "LINE —"}
        codec="FLAC 44.1"
        shelfOpen={props.shelfOpen}
        viewOpen={props.viewOpen}
        onShelf={props.onShelf}
        onView={props.onView}
      />

      <i className="pf-crop tl" aria-hidden="true" />
      <i className="pf-crop tr" aria-hidden="true" />
      <i className="pf-crop bl" aria-hidden="true" />
      <i className="pf-crop br" aria-hidden="true" />

      <div className="pf-body">
        <div className="pf-mono mono">
          <span>AFEIFEI PRESS</span>
          <span>{new Date().getFullYear()}</span>
          <span>NO. {pad2(data.cursorPosition + 1)}</span>
          <span>{playing ? "PROOF" : "HOLD"}</span>
        </div>

        <div className="pf-head">
          {/* key = 曲名：换曲时整块重挂，套印偏移才重播一次 */}
          <h1
            className="pf-title"
            key={title}
            title={title}
            style={{ "--fit": fitScale(title) } as React.CSSProperties}
          >
            <span className="pf-t">{title}</span>
            <span className="pf-ghost" aria-hidden="true">{title}</span>
          </h1>
          <p className="pf-artist">{[data.nowArtist, data.nowAlbum, data.sourceName].filter(Boolean).join(" · ") || "—"}</p>
        </div>

        <div className="pf-cols">
          <div className="pf-lyr" aria-live="polite">
            {doc ? (
              lines.map((line, index) => (
                from + index === at
                  ? <KaraokeLine key={`k-${at}`} doc={doc} at={at} className="cur accent" />
                  : (
                    <p key={`${from + index}-${line.text}`} style={{ animationDelay: `${Math.min(6, index) * 22}ms` }}>
                      {line.text}
                    </p>
                  )
              ))
            ) : (
              <p className="cur">{cur}</p>
            )}
            {zh ? <p className="cur" style={{ marginTop: 6 }}>{zh}</p> : null}
          </div>

          <div className="pf-tbl">
            <div className="hd mono">NEXT {pad2(rows.length)} · QUEUE {pad2(state.queue.items.length)}</div>
            {rows.length ? rows.map((row, index) => (
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
            )) : <p className="pf-lyr" style={{ marginTop: 8 }}>队列里没有下一首</p>}
          </div>

          <div className="pf-tech mono">
            <div><b>FORMAT</b><span>FLAC 44.1 kHz / 16 bit</span></div>
            <div><b>DURATION</b><span>{fmtDur(data.nowDuration)}</span></div>
            <div><b>SOURCE</b><span>{data.sourceName}</span></div>
            <div><b>LINE</b><span>{doc && at >= 0 ? `${pad2(at + 1)} / ${pad2(doc.lines.length)}` : "—"}</span></div>
            <div><b>CHANNELS</b><span>2 ch · 44.1 kHz</span></div>
            <div><b>NOTE</b><span>勿作成品 · 校样用</span></div>
          </div>
        </div>

        <div className="pf-foot">
          <i className="pf-barcode" aria-hidden="true" />
          <div className="pf-colo2 mono">
            <div><b>NIGHT CRUISING</b><span>{data.nowArtist || "—"}</span></div>
            <div><b>33⅓ RPM · STEREO</b><span>AFEIFEI PRESS</span></div>
            <div><b>PROOF</b><span>校样 · 勿作成品</span></div>
          </div>
          <div className="pf-colo" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      </div>

      <Tape api={tape} />
    </div>
  );
}
