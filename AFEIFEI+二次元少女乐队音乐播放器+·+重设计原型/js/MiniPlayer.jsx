/* ---------- 底部播放栏 ---------- */
function MiniPlayer() {
  const {
    track, playing, setPlaying, pos, setPos, userSkip, shuffle, toggleShuffle,
    repeat, setRepeat, liked, toggleLike, volume, setVolume, openPlayer,
    onomaAt, setPage, lyricsBar, setLyricsBar, setMiniMode, source
  } = useApp();
  const [stampTick, setStampTick] = React.useState(0);
  const [flipping, setFlipping] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const seekRef = React.useRef(null);
  const pct = Math.min(100, (pos / track.dur) * 100);
  const isLiked = liked.includes(track.id);
  const lit = Math.round(volume * 5);

  const seekTo = e => {
    const r = seekRef.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * track.dur);
  };

  return (
    <div className="bar">
      <div className="bar__left">
        <button className="bar__cover-btn" onClick={openPlayer} title="展开播放页">
          <img className="bar__cover" src={track.cover} alt="" />
          {playing && <span className="bar__cover-glow"></span>}
        </button>
        <div className="bar__meta">
          <span className="bar__title truncate">{track.title}</span>
          <span className="bar__artist truncate">
            {track.artist}
            <span className="bar__src" style={{ color: SOURCES[source].tone }}>{SOURCES[source].short}</span>
          </span>
        </div>
        <button className={"bar__heart" + (isLiked ? " is-on" : "") + (flipping ? " is-flipping" : "")}
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            onomaAt(e.currentTarget, "ポンッ", "coral");
            if (isLiked) {
              setFlipping(true);
              setTimeout(() => setFlipping(false), 320);
            } else {
              setStampTick(t => t + 1);
              const mark = document.createElement("span");
              mark.className = "stamp-mark";
              mark.style.left = (r.left + r.width / 2) + "px";
              mark.style.top = (r.top + r.height / 2) + "px";
              mark.style.position = "fixed";
              mark.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6c4 0 7.8 3.3 7.8 7.4 0 4.6-4.2 8.4-6.6 10.6-.7.6-1.7.6-2.4 0C8.4 18.4 4.2 14.6 4.2 10 4.2 5.9 8 2.6 12 2.6z"/></svg>';
              document.body.appendChild(mark);
              setTimeout(() => mark.remove(), 460);
            }
            toggleLike(track.id);
          }}
          title={isLiked ? "取消喜欢" : "喜欢"}>
          {stampTick > 0 && <span key={stampTick} className="ink-ring"></span>}
          {isLiked ? <IconHeartFill size={16} /> : <IconHeart size={16} />}
        </button>
      </div>

      <div className="bar__center">
        <div className="bar__ctrls">
          <button className={"bar__icon" + (shuffle ? " is-on" : "")}
            onClick={e => { onomaAt(e.currentTarget, "シャッ", "mint"); toggleShuffle(); }}
            title="随机播放">
            <IconShuffle size={16} />
          </button>
          <button className="bar__icon" onClick={() => userSkip("prev")} title="上一首">
            <IconPrev size={17} />
          </button>
          <button className={"bar__play" + (playing ? " is-playing" : "")}
            onClick={() => { setPlaying(p => !p); if (window.Sound) Sound.pluck(); }}
            title={playing ? "暂停" : "播放"} aria-label={playing ? "暂停" : "播放"}>
            <PlayGlyph playing={playing} size={20} />
          </button>
          <button className="bar__icon" onClick={() => userSkip("next")} title="下一首">
            <IconNext size={17} />
          </button>
          <button className={"bar__icon" + (repeat !== "off" ? " is-on" : "")}
            onClick={() => setRepeat(r => r === "off" ? "all" : r === "all" ? "one" : "off")}
            title={repeat === "off" ? "列表循环" : repeat === "all" ? "单曲循环" : "不循环"}>
            {repeat === "one" ? <IconRepeatOne size={16} /> : <IconRepeat size={16} />}
          </button>
        </div>

        <div className="bar__seek">
          <span className="num bar__time" key={track.id + "-cur"}>{fmt(pos)}</span>
          <div className={"bar__seek-track" + (dragging ? " is-dragging" : "")} ref={seekRef}
            onPointerDown={e => { setDragging(true); seekTo(e); }}
            onPointerMove={e => { if (dragging) seekTo(e); }}
            onPointerUp={() => setDragging(false)}
            onPointerLeave={() => setDragging(false)}
            role="slider" aria-label="播放进度" aria-valuenow={Math.round(pct)}>
            <b className="bar__seek-buffer" style={{ width: Math.min(100, pct + (playing ? 14 : 0)) + "%" }}></b>
            <i style={{ width: pct + "%" }}></i>
            <span className="bar__seek-knob" style={{ left: pct + "%" }}></span>
          </div>
          <span className="num bar__time bar__time--dim">{fmt(track.dur)}</span>
        </div>
      </div>

      <div className="bar__right">
        <div className="vol" title={"音量 " + Math.round(volume * 100) + "%"}>
          {[0, 1, 2, 3, 4].map(i => (
            <button key={i} className={"vol__pick" + (i < lit ? " is-lit" : "")}
              onClick={() => setVolume((i + 1) / 5)} aria-label={"音量 " + (i + 1) * 20 + "%"}>
              <IconPick size={11} />
            </button>
          ))}
        </div>
        <span className="bar__sep"></span>
        <button className={"bar__icon" + (lyricsBar ? " is-on" : "")}
          onClick={() => setLyricsBar(v => !v)} title="桌面歌词" aria-pressed={lyricsBar}>
          <IconNote size={17} />
        </button>
        <button className="bar__icon" onClick={() => setMiniMode(true)} title="迷你模式">
          <IconMin size={17} />
        </button>
        <button className="bar__icon" onClick={openPlayer} title="播放队列">
          <IconQueue size={17} />
        </button>
        <button className="bar__icon" onClick={openPlayer} title="更多">
          <IconMore size={17} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { MiniPlayer });
