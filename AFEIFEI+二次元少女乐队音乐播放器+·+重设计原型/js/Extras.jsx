/* ---------- 桌面歌词条 + 迷你模式 ---------- */
function LyricsBar() {
  const { track, pos, setLyricsBar } = useApp();
  const lines = React.useMemo(() => lyricsFor(track), [track.id]);
  const per = track.dur / lines.length;
  const cur = Math.max(0, Math.min(lines.length - 1, Math.floor(pos / per)));

  return (
    <div className="lyricbar" role="status" aria-label="桌面歌词">
      <span className="lyricbar__badge"><IconNote size={12} />桌面歌词</span>

      <div className="lyricbar__stage">
        <span className="lyricbar__cur" key={cur}>{lines[cur]}</span>
        <span className="lyricbar__next">{lines[cur + 1] || ""}</span>
      </div>

      <span className="lyricbar__note">原型内为样式演示</span>
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
