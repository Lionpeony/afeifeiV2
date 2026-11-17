/* ---------- 播放页 · 大歌词（ED 字幕墙） ---------- */
function LyricWall() {
  const {
    track, pos, setPos, lyricsOn, setLyricsOn, showTr, setShowTr,
    lyricsBar, setLyricsBar, lyricsFull, setLyricsFull, reduce
  } = useApp();

  const lines = React.useMemo(() => lyricsFor(track), [track.id]);
  const en = React.useMemo(() => lyricEnFor(track), [track.id]);
  const per = track.dur / lines.length;
  const cur = Math.max(0, Math.min(lines.length - 1, Math.floor(pos / per)));
  const p = Math.max(0, Math.min(1, (pos - cur * per) / per)) * 100;

  const full = !!lyricsFull;
  const rowH = full ? 92 : 58;

  const viewRef = React.useRef(null);
  const [viewH, setViewH] = React.useState(full ? 520 : 272);
  React.useEffect(() => {
    const measure = () => {
      if (viewRef.current) setViewH(viewRef.current.clientHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [full]);

  /* 整首放得下就整块居中（诗页式），放不下才按当前句做锚点滚动 */
  const totalH = lines.length * rowH;
  const blockMode = totalH <= viewH + rowH * 0.9;
  const offset = blockMode ? Math.round((viewH - totalH) / 2) : viewH / 2 - (cur * rowH + rowH / 2);

  if (!lyricsOn) {
    return (
      <div className="lw lw--off">
        <span className="lw--off__text hand">字幕关了，只剩鼓点。</span>
        <button className="btn btn-soft btn-sm" onClick={() => setLyricsOn(true)}>
          <IconNote size={13} />打开歌词
        </button>
      </div>
    );
  }

  return (
    <div className={"lw" + (full ? " lw--full" : "")} style={{ "--row-h": rowH + "px" }}>
      <div className="lw__rail" aria-hidden="true">
        <span className="lw__rail-jp">台侧字幕</span>
        <span className="lw__rail-line"></span>
        <span className="lw__rail-latin">ED&nbsp;SUBTITLE</span>
      </div>

      <div className="lw__main">
        <div className="lw__head">
          <span className="lw__head-title">
            <b>歌词</b>
            <span className="lw__head-sub">逐行 · 虚构演示</span>
          </span>
          <div className="lw__tools">
            <button className={"lw__tool" + (showTr ? " is-on" : "")} onClick={() => setShowTr(v => !v)}
              title="译文开关（歌词下面那行英文）" aria-pressed={showTr}>译</button>
            <button className={"lw__tool" + (lyricsBar ? " is-on" : "")} onClick={() => setLyricsBar(v => !v)}
              title="桌面歌词" aria-pressed={lyricsBar}>桌面</button>
            <button className={"lw__tool" + (full ? " is-on" : "")} onClick={() => setLyricsFull(!full)}
              title={full ? "收起大歌词（Esc）" : "展开成大歌词"}>
              {full ? <IconMin size={13} /> : <IconMax size={13} />}
            </button>
            <button className="lw__tool" onClick={() => setLyricsOn(false)} title="关掉歌词">
              <IconX size={13} />
            </button>
          </div>
        </div>

        {full && (
          <div className="lw__fullhead">
            <img src={track.cover} alt="" />
            <span className="lw__fullhead-text">
              <b>{track.title}</b>
              <span>{track.artist} · 台侧字幕 · 第 {cur + 1} 句</span>
            </span>
            <span className="lw__fullhead-hint hand">对着字幕唱，跑调也没人管</span>
          </div>
        )}

        <div className="lw__view" ref={viewRef}>
          <span className="lw__spot" aria-hidden="true"></span>
          <div className="lw__scroll"
            style={{ transform: `translate3d(0,${offset}px,0)`, transition: reduce ? "none" : undefined }}>
            {lines.map((l, i) => {
              const d = i - cur;
              const isCur = d === 0;
              return (
                <button key={i}
                  className={"lw-line" + (isCur ? " is-cur" : d < 0 ? " is-past" : " is-next")}
                  style={{ height: rowH + "px" }}
                  onClick={() => setPos(i * per + 0.1)}
                  title={"从这里开始：" + l}>
                  <span className="lw-line__body">
                    <span className="lw-line__jp">
                      {l}
                      {isCur && (
                        <span className="lw-line__fill" style={{ "--p": p + "%" }} aria-hidden="true">{l}</span>
                      )}
                    </span>
                    {showTr && <span className="lw-line__tr">{en[i]}</span>}
                  </span>
                  {isCur && <span className="lw-line__mark" aria-hidden="true">◀</span>}
                </button>
              );
            })}
          </div>
          <span className="lw__mask lw__mask--top" aria-hidden="true"></span>
          <span className="lw__mask lw__mask--bottom" aria-hidden="true"></span>
        </div>

        <div className="lw__foot">
          <span className="lw__foot-progress">
            <i style={{ width: ((cur + p / 100) / lines.length) * 100 + "%" }}></i>
          </span>
          <span className="lw__foot-num num">{cur + 1} / {lines.length}</span>
          <span className="hand lw__foot-hint">点一行就跳到那句</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LyricWall });
