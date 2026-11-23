/* 播放页歌词 · 舞台字幕投影（接真实歌词时间轴）
   这一版不再是一条底部字幕带：歌词是播放页中间那根「舞台柱」，
   当前句是投影本身，上一句/下一句是还没唱到的回声。 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAf } from "./context.js";
import { IconMax, IconMin, IconNote, IconX } from "./icons.js";
import { useLyricLines } from "./layers.js";
import { usePosition } from "./use-position.js";

export function LyricWall() {
  const af = useAf();
  const { lyricsOn, setLyricsOn, lyricsFull, setLyricsFull, reduce, palette } = af;
  const { pos } = usePosition(af);
  const lines = useLyricLines();
  const full = !!lyricsFull;
  const rowH = full ? 88 : 68;
  const viewRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLButtonElement | null>(null);
  const [viewH, setViewH] = useState(360);
  const [curBox, setCurBox] = useState<{ top: number; height: number } | null>(null);

  /* 当前句可能换行、比普通行高。offsetTop 用真实排版量，不能再用 cur*rowH 猜，
     否则长句会压到下一行或滚出视口。 */
  const ms = pos * 1000;
  let cur = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.startMs <= ms) cur = i;
    else break;
  }
  useLayoutEffect(() => {
    const el = curRef.current;
    if (!el) {
      setCurBox(null);
      return;
    }
    setCurBox({ top: el.offsetTop, height: el.offsetHeight });
  }, [cur, lines, full, viewH]);

  useEffect(() => {
    const measure = (): void => {
      if (viewRef.current) setViewH(viewRef.current.clientHeight);
    };
    measure();
    /* 关着歌词时这根柱子还没挂出来（ref 为空），别把 null 丢给 ResizeObserver */
    const el = viewRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(measure) : null;
    if (ro && el) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [full, lyricsOn]);

  if (!lyricsOn) {
    /* 字幕收起时中间这柱不能空成一块板：留一个台口，灯还亮着，随时可以把字幕喊回来 */
    return (
      <div className="lw lw--off">
        <div className="lw--off__inner">
          <span className="lw--off__lamp" aria-hidden="true"></span>
          <span className="lw--off__kicker">STAGE · 字幕已收起</span>
          <p className="lw--off__text hand">字幕关了，只剩鼓点和台口的灯。</p>
          <div className="lw--off__acts">
            <button className="btn btn-primary btn-sm" onClick={() => setLyricsOn(true)}><IconNote size={13} />把字幕喊回来</button>
            <button className="btn btn-ghost btn-sm" onClick={() => void window.api.toggleLyric()}>桌面歌词</button>
          </div>
          <span className="lw--off__floor" aria-hidden="true"></span>
        </div>
      </div>
    );
  }

  const start = lines[cur]?.startMs ?? 0;
  const end = lines[cur + 1]?.startMs ?? start + 4000;
  const p = Math.max(0, Math.min(1, (ms - start) / Math.max(1, end - start))) * 100;

  const totalH = lines.length * rowH;
  const blockMode = totalH <= viewH + rowH * 0.9;
  /* GBC 是 lower-third：只显示当前句 + 下一句，不做滚动居中。
     滚动偏移一旦被裁掉，当前句会消失在字幕条上方，只剩下一行灰字。 */
  const shown = palette === "gbc" && !full ? lines.slice(cur, cur + 2) : lines;
  const offset = palette === "gbc" && !full
    ? 0
    : blockMode
      ? Math.round((viewH - totalH) / 2)
      : curBox
        ? Math.round(viewH / 2 - (curBox.top + curBox.height / 2))
        : viewH / 2 - (cur * rowH + rowH / 2);

  return (
    <div className={"lw" + (full ? " lw--full" : "")} style={{ ["--row-h" as string]: rowH + "px" }}>
      <div className="lw__rail" aria-hidden="true">
        <span className="lw__rail-jp">台侧字幕</span>
        <span className="lw__rail-line"></span>
      </div>

      <div className="lw__main">
        <div className="lw__head">
          <span className="lw__head-title"><b>歌词</b><span className="lw__head-sub">LYRICS</span></span>
          <div className="lw__tools">
            <button className="lw__tool" onClick={() => void window.api.toggleLyric()} title="桌面歌词">桌面</button>
            <button className={"lw__tool" + (full ? " is-on" : "")} onClick={() => setLyricsFull(!full)} title={full ? "收起大歌词（Esc）" : "展开成大歌词"}>
              {full ? <IconMin size={13} /> : <IconMax size={13} />}
            </button>
            <button className="lw__tool" onClick={() => setLyricsOn(false)} title="关掉歌词"><IconX size={13} /></button>
          </div>
        </div>

        {full ? (
          <div className="lw__fullhead">
            {af.track.cover ? <img src={af.track.cover} alt="" referrerPolicy="no-referrer" /> : null}
            <span className="lw__fullhead-text"><b>{af.track.title}</b><span>{af.track.artist} · 台侧字幕 · 第 {cur + 1} 句</span></span>
            <span className="lw__fullhead-hint hand">对着字幕唱，跑调也没人管</span>
          </div>
        ) : null}

        <div className="lw__view" ref={viewRef}>
          <span className="lw__spot" aria-hidden="true"></span>
          <div className="lw__scroll" style={{ transform: `translate3d(0,${offset}px,0)`, transition: reduce ? "none" : undefined }}>
            {shown.length === 0 ? (
              <div className="lw-empty">
                <span className="lw-empty__glyph" aria-hidden="true"><IconNote size={22} /></span>
                <b>这首没配字幕</b>
                <span className="hand">纯器乐也很好；想跟着唱，先把歌词配进来。</span>
              </div>
            ) : (
              shown.map((l, idx) => {
                const i = palette === "gbc" && !full ? cur + idx : idx;
                const d = i - cur;
                const isCur = d === 0;
                /* 逐字上色不能再用「单行副本 + 横向裁切」：原句换行时副本不换行，
                   颜色会跑到行外。当前行拆成字符，颜色跟着正常文本流走，换行自然正确。 */
                const chars = isCur ? Array.from(l.text) : null;
                const lit = isCur && chars ? (p / 100) * chars.length : 0;
                return (
                  <button
                    key={i}
                    ref={isCur ? curRef : undefined}
                    className={"lw-line" + (isCur ? " is-cur" : d < 0 ? " is-past" : " is-next")}
                    style={{ height: isCur ? "auto" : rowH + "px", minHeight: rowH + "px" }}
                    onClick={() => af.seekTo((l.startMs + 100) / 1000)}
                    title={"从这里开始：" + l.text}
                  >
                    <span className="lw-line__body">
                      <span className="lw-line__jp">
                        {chars
                          ? chars.map((ch, ci) => (
                              <span
                                key={ci}
                                className="lw-ch"
                                style={{ ["--k" as string]: Math.max(0, Math.min(1, lit - ci)) }}
                              >
                                {ch === " " ? " " : ch}
                              </span>
                            ))
                          : l.text}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <span className="lw__mask lw__mask--top" aria-hidden="true"></span>
          <span className="lw__mask lw__mask--bottom" aria-hidden="true"></span>
        </div>

        <div className="lw__foot">
          <span className="lw__foot-progress"><i style={{ ["--p" as string]: String((cur + p / 100) / Math.max(1, lines.length)) }}></i></span>
          <span className="lw__foot-num num">{lines.length ? `${cur + 1} / ${lines.length}` : "—"}</span>
        </div>
      </div>
    </div>
  );
}
