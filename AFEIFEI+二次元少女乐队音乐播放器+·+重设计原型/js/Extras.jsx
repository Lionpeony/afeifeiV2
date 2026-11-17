/* ---------- 桌面歌词条 + 迷你模式 ---------- */
function LyricsBar() {
  const { track, pos, setLyricsBar, showTr } = useApp();
  const lines = React.useMemo(() => lyricsFor(track), [track.id]);
  const en = React.useMemo(() => lyricEnFor(track), [track.id]);
  const per = track.dur / lines.length;
  const cur = Math.max(0, Math.min(lines.length - 1, Math.floor(pos / per)));
  const p = Math.max(0, Math.min(1, (pos - cur * per) / per)) * 100;

  /* 位置与字号存在本地，重新打开还在原处 */
  const KEY = "afeifei:lyricbar";
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  };
  const [box, setBox] = React.useState(() => read());
  const [scale, setScale] = React.useState(() => read().scale || 1);
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef(null);

  const persist = next => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* 隐私模式忽略 */ }
  };

  const onDown = e => {
    if (e.target.closest("button")) return;
    const r = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = e => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.max(8, Math.min(window.innerWidth - d.w - 8, e.clientX - d.dx));
    const y = Math.max(8, Math.min(window.innerHeight - d.h - 8, e.clientY - d.dy));
    setBox({ x, y });
  };
  const onUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setBox(b => { persist({ ...b, scale }); return b; });
  };

  const setSize = d => {
    const next = Math.max(0.85, Math.min(1.5, Math.round((scale + d) * 100) / 100));
    setScale(next);
    setBox(b => { persist({ ...b, scale: next }); return b; });
  };

  const style = {
    "--lb-fs": scale,
    left: box.x != null ? box.x + "px" : undefined,
    top: box.x != null ? box.y + "px" : undefined,
    right: box.x != null ? "auto" : undefined,
    bottom: box.x != null ? "auto" : undefined
  };

  return (
    <div className={"lyricbar" + (dragging ? " is-dragging" : "")} style={style}
      role="status" aria-label="桌面歌词"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <span className="lyricbar__grip" title="拖动改变位置"><IconQueue size={13} /></span>
      <span className="lyricbar__badge"><IconNote size={12} />桌面歌词</span>

      <div className="lyricbar__stage">
        <span className="lyricbar__cur" key={cur} style={{ fontSize: (19 * scale) + "px" }}>
          {lines[cur]}
          <span className="lyricbar__fill" style={{ "--p": p + "%", fontSize: (19 * scale) + "px" }} aria-hidden="true">{lines[cur]}</span>
        </span>
        {showTr
          ? <span className="lyricbar__tr">{en[cur]}</span>
          : <span className="lyricbar__next">{lines[cur + 1] || ""}</span>}
      </div>

      <div className="lyricbar__tools">
        <button onClick={() => setSize(-0.08)} title="缩小字号">A-</button>
        <button onClick={() => setSize(0.08)} title="放大字号">A+</button>
      </div>
      <button className="lyricbar__close" onClick={() => setLyricsBar(false)} title="关闭桌面歌词" aria-label="关闭桌面歌词">
        <IconX size={14} />
      </button>
    </div>
  );
}

function MiniCard() {
  const { track, playing, setPlaying, userSkip, pos, setPos, setMiniMode, source, onoma, liked, toggleLike } = useApp();
  const pct = Math.min(100, (pos / track.dur) * 100);

  return (
    <div className="mini-stage" data-screen-label="迷你模式">
      <div className="mini-stage__wall">
        <span className="mini-stage__mark">AFEIFEI</span>
        <span className="mini-stage__hint hand">
          窗口收拢成一张便签 · 点右上角展开
        </span>
        <span className="mini-stage__note">
          真实客户端会收成一个无边框置顶小窗；原型内为样式演示。
        </span>
      </div>

      <div className="mini-card" role="region" aria-label="迷你播放器">
        <button className="mini-card__art" onClick={() => setMiniMode(false)} title="展开完整窗口">
          <img src={track.cover} alt="" />
          {playing && <span className="mini-card__glow"></span>}
        </button>

        <div className="mini-card__body">
          <span className="mini-card__title truncate">{track.title}</span>
          <span className="mini-card__artist truncate">
            {track.artist}
            <span className="mini-card__src" style={{ color: SOURCES[source].tone }}>{SOURCES[source].short}</span>
          </span>
        </div>

        <div className="mini-card__ctrl">
          <button onClick={() => userSkip("prev")} title="上一首" aria-label="上一首"><IconPrev size={15} /></button>
          <button className="mini-card__play" onClick={() => setPlaying(p => !p)}
            title={playing ? "暂停" : "播放"} aria-label={playing ? "暂停" : "播放"}>
            <PlayGlyph playing={playing} size={14} />
          </button>
          <button onClick={() => userSkip("next")} title="下一首" aria-label="下一首"><IconNext size={15} /></button>
          <button onClick={() => { onoma("ポンッ", { tone: "coral", x: window.innerWidth - 120, y: window.innerHeight - 120 }); toggleLike(track.id); }}
            className={liked.includes(track.id) ? "is-on" : ""} title="喜欢" aria-label="喜欢">
            {liked.includes(track.id) ? <IconHeartFill size={14} /> : <IconHeart size={14} />}
          </button>
          <button onClick={() => setMiniMode(false)} title="展开完整窗口" aria-label="展开完整窗口">
            <IconMax size={13} />
          </button>
        </div>

        <div className="mini-card__line" title="播放进度">
          <i style={{ width: pct + "%" }}></i>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LyricsBar, MiniCard });
