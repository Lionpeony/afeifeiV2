/* ---------- 迷路漫游 ---------- */
function Wander() {
  const { track, currentId, playing, setPlaying, userSkip, toggleLike, liked, queueIds, goTo, shuffle, toggleShuffle, source, playAll, setPage } = useApp();
  const [copyIdx, setCopyIdx] = React.useState(0);

  const copies = ["还在找今晚的那首歌？♡", "不知道听什么的话，就让它自己走。", "切歌也算一种走路方式。"];
  React.useEffect(() => {
    setCopyIdx(i => (i + 1) % copies.length);
  }, [currentId]);

  const idx = queueIds.indexOf(currentId);
  const upcoming = [1, 2, 3].map(k => queueIds[(idx + k) % queueIds.length]).filter(Boolean).map(id => TRACK_MAP[id]);
  const isLiked = liked.includes(track.id);

  return (
    <div className="wander" data-screen-label="迷路漫游">
      <span className="wander__glow wander__glow--a"></span>
      <span className="wander__glow wander__glow--b"></span>

      <div className="wander__inner">
        <div className="wander__eyebrow">
          <span className="eyebrow">迷路漫游</span>
          <span style={{ width: 14, height: 1, background: "var(--line-strong)" }}></span>
          <span className="meta">第 {String(idx + 1).padStart(2, "0")} 首 / 共 {queueIds.length} 首</span>
        </div>

        <div className={"wander__cover-wrap" + (playing ? " loop is-breathing" : "")}>
          <Tape w={86} rot={-2.5} style={{ top: -11, left: "50%", marginLeft: -43 }} />
          <img key={track.id} className="wander__cover" src={track.cover} alt={track.releaseTitle}
               style={{ animation: "artIn .5s var(--ease) both" }} />
          <span className="wander__badge" title="当前曲目编号">
            <svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor" aria-hidden="true">
              <path d="M12 2.6c4 0 7.8 3.3 7.8 7.4 0 4.6-4.2 8.4-6.6 10.6-.7.6-1.7.6-2.4 0C8.4 18.4 4.2 14.6 4.2 10 4.2 5.9 8 2.6 12 2.6z" opacity=".18"/>
              <path d="M12 2.6c4 0 7.8 3.3 7.8 7.4 0 4.6-4.2 8.4-6.6 10.6-.7.6-1.7.6-2.4 0C8.4 18.4 4.2 14.6 4.2 10 4.2 5.9 8 2.6 12 2.6z" fill="none" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            <span style={{ position: "absolute", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--coral)" }}>
              {String(idx + 1).padStart(2, "0")}
            </span>
          </span>
          <button className="icon-btn" onClick={() => setPlaying(p => !p)} title={playing ? "暂停" : "播放"}
            style={{
              position: "absolute", left: "50%", bottom: -18, transform: "translateX(-50%)",
              width: 44, height: 44, background: "var(--card)", boxShadow: "0 8px 20px rgba(61,43,57,.18)",
              color: "var(--pink-600)"
            }}>
            {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>
        </div>

        <h1 key={track.id} className="wander__title" style={{ marginTop: 16, animation: "fadeUp .4s var(--ease) both" }}>
          {track.title}
        </h1>
        <div className="wander__band jp">{track.band} <span style={{ opacity: .4, margin: "0 4px" }}>·</span> {track.releaseTitle}</div>

        <div className="wander__actions">
          <button className="btn btn-ghost" onClick={() => userSkip("next")}>
            <IconSkip size={15} />跳过这首
          </button>
          <button className={"btn btn-ghost" + (isLiked ? " is-liked" : "")}
            onClick={() => toggleLike(track.id)}
            style={isLiked ? { color: "var(--coral)", borderColor: "rgba(198,42,63,.4)" } : undefined}>
            <IconPick size={14} />{isLiked ? "记下了" : "记下来"}
          </button>
          <button className="btn btn-primary" onClick={() => setPlaying(true)}>
            <IconPlay size={14} />继续听
          </button>
          <button className="btn btn-ghost"
            onClick={() => playAll(queueIds.filter(id => id !== currentId).slice(0, 12))}>
            <IconRefresh size={14} />换一批
          </button>
        </div>

        <p className="wander__copy">{copies[copyIdx]}</p>
        <div className="wander__src">
          <IconCloud size={12} />
          <span>漫游来源：{SOURCES[source].name} × 账号歌单与每日推荐</span>
        </div>

        <div className="wander__queue">
          <div className="wander__queue-label">
            <span className="eyebrow">接下来</span>
            <button className={"chip chip--tag" + (shuffle ? " is-on" : "")}
              style={{ marginLeft: 6, cursor: "pointer" }} onClick={toggleShuffle}>
              {shuffle ? "绕路中" : "直着走"}
            </button>
          </div>
          <div className="wander__queue-rows">
            {upcoming.map((t, i) => (
              <button key={track.id + t.id + i} className="wander__qrow" onClick={() => goTo(t.id)}
                style={{ animationDelay: (i * 50) + "ms" }}>
                <span>{String((idx + i + 2) % 100).padStart(2, "0")}</span>
                <span className="truncate" style={{ textAlign: "left" }}>{t.title}</span>
                <span className="num" style={{ color: "var(--text-3)", fontSize: 10 }}>{fmt(t.dur)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Wander });
