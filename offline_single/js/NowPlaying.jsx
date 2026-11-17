/* ---------- 播放页 · 舞台 ---------- */
function NowPlaying() {
  const {
    track, playing, setPlaying, pos, setPos, userSkip, prevTrack,
    shuffle, toggleShuffle, repeat, setRepeat, liked, toggleLike,
    queueIds, goTo, setPlayerOpen, chorusAt, markChorus, struckId, reduce, currentId, sheerSide, closePlayer, playerClosing, onoma, onomaAt, lyricsOn, setLyricsOn
  } = useApp();

  const barRef = React.useRef(null);
  const pressTimer = React.useRef(null);
  const longPressed = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);

  const ratioFromEvent = (e) => {
    const r = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const seek = (e) => {
    const r = ratioFromEvent(e);
    setPos(r * track.dur);
  };
  const onDown = (e) => {
    longPressed.current = false;
    setDragging(true);
    clearTimeout(pressTimer.current);
    const r = ratioFromEvent(e);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      markChorus(r * track.dur);
      if (window.Sound) Sound.ding();
    }, 550);
  };
  const onUp = (e) => {
    clearTimeout(pressTimer.current);
    if (!longPressed.current) seek(e);
    setDragging(false);
  };

  const chorusPct = chorusAt != null ? (chorusAt / track.dur) * 100 : null;
  const showChorusHint = chorusAt != null && pos >= chorusAt - 8 && pos < chorusAt;

  const acts = React.useMemo(() => {
    if (queueIds.length <= 12) return [queueIds];
    const out = [];
    for (let i = 0; i < queueIds.length; i += 4) out.push(queueIds.slice(i, i + 4));
    return out;
  }, [queueIds]);

  const totalDur = queueIds.reduce((s, id) => s + TRACK_MAP[id].dur, 0);
  const idx = queueIds.indexOf(currentId);

  return (
    <div className={"np" + (playerClosing ? " np--closing" : "")} data-screen-label="播放页" role="dialog" aria-label="播放页">
      {!reduce && !playerClosing && (
        <>
          <div className="curtain curtain--l"></div>
          <div className="curtain curtain--r"></div>
        </>
      )}
      {!reduce && playerClosing && (
        <>
          <div className="curtain curtain--close curtain--close-l"></div>
          <div className="curtain curtain--close curtain--close-r"></div>
        </>
      )}

      <div className="np__top">
        <button className="np__close" onClick={closePlayer}>
          <IconChevronDown size={17} />收起
        </button>
        <span style={{ width: 1, height: 16, background: "var(--line)" }}></span>
        <span className="np__top-label">
          <IconNote size={13} />
          正在演出 · SETLIST {String(idx + 1).padStart(2, "0")} / {String(queueIds.length).padStart(2, "0")}
        </span>
        <span className="spacer"></span>
        <span className="meta hand" style={{ fontSize: 12 }}>{Math.round(totalDur / 60)} 分钟就散场</span>
      </div>

      <div className="np__main">
        <div className="np__stage">
          <div className={"np__art" + (playing ? " loop is-breathing" : "")}>
            <Tape w={78} rot={-4} style={{ top: -11, left: 34 }} />
            <img key={track.id} className="np__art-img" src={track.cover} alt={track.releaseTitle} />
            <span className="np__art-badge">
              <IconPick size={40} style={{ position: "absolute", opacity: .16 }} />
              <b style={{ position: "relative" }}>{String(queueIds.indexOf(currentId) + 1).padStart(2, "0")}</b>
            </span>
            {struckId && <span className={"sheer is-on sheer--" + (sheerSide || "r")}></span>}
          </div>

          <div className="np__info">
          <div className="np__kicker">
            <span className="eyebrow">{track.band}</span>
            <span style={{ width: 12, height: 1, background: "var(--line-strong)" }}></span>
            <span className="meta">{track.releaseTitle} · {new Date().getFullYear()}</span>
          </div>
          <h1 key={track.id} className="np__title">{track.title}</h1>
          <span key={track.id + "-sw"} className="np__title-sweep" aria-hidden="true"></span>
          <div className="np__band jp">
            <span>{track.band}</span>
            <i></i>
            <span style={{ color: "var(--text-3)" }}>{track.note || "今晚的第一首"}</span>
          </div>

          <div className="np__progress-wrap">
            {showChorusHint && <span className="np__chorus-hint">要来了♡</span>}
            <div className={"np__progress" + (dragging ? " is-dragging" : "")} ref={barRef}
              onPointerDown={onDown}
              onPointerUp={onUp}
              onPointerLeave={() => { clearTimeout(pressTimer.current); setDragging(false); }}
              onPointerMove={e => { if (dragging) setPos(ratioFromEvent(e) * track.dur); }}
              title="点击跳转，长按标记副歌点">
              <div className="np__progress-track">
                <div className="np__progress-fill" style={{ width: (pos / track.dur * 100) + "%" }}></div>
                {chorusPct != null && (
                  <span className="np__chorus-mark" style={{ left: chorusPct + "%" }}>
                    <IconPick size={13} />
                  </span>
                )}
                <span className="np__progress-knob" style={{ left: (pos / track.dur * 100) + "%" }}></span>
              </div>
            </div>
            <div className="np__times">
              <span className="num" style={{ color: "var(--text-2)" }}>{fmt(pos)}</span>
              <span className="num" style={{ color: "var(--text-3)" }}>-{fmt(track.dur - pos)}</span>
            </div>
          </div>

          <div className="np__controls">
            <button className={"np__ctrl" + (shuffle ? " is-on" : "")}
              onClick={e => { onomaAt(e.currentTarget, "シャッ", "mint"); toggleShuffle(); }} title="随机（绕路）">
              <IconShuffle size={18} />
            </button>
            <button className="np__ctrl" onClick={() => userSkip("prev")} title="上一首">
              <IconPrev size={20} />
            </button>
            <button className={"np__ctrl np__ctrl--main" + (playing ? " is-playing" : "")}
              onClick={() => { setPlaying(p => !p); if (window.Sound) Sound.pluck(); }}
              title={playing ? "暂停" : "播放"}>
              <PlayGlyph playing={playing} size={22} />
            </button>
            <button className="np__ctrl" onClick={() => userSkip("next")} title="下一首">
              <IconNext size={20} />
            </button>
            <button className={"np__ctrl" + (repeat !== "off" ? " is-on" : "")}
              onClick={() => setRepeat(r => r === "off" ? "all" : r === "all" ? "one" : "off")}
              title="循环">
              {repeat === "one" ? <IconRepeatOne size={18} /> : <IconRepeat size={18} />}
            </button>
            <span className="np__ctrl-sep"></span>
            <button className={"np__ctrl like-btn" + (liked.includes(track.id) ? " is-liked" : "")}
              onClick={e => { onomaAt(e.currentTarget, "ポンッ", "coral"); toggleLike(track.id); }}
              title="喜欢（盖一枚拨片）">
              {liked.includes(track.id) ? <IconPick size={19} /> : <IconPickOutline size={19} />}
            </button>
            <button className={"np__ctrl" + (lyricsOn ? " is-on" : "")}
              onClick={() => setLyricsOn(v => !v)} title="歌词字幕（ED 风）" aria-pressed={lyricsOn}>
              <IconNote size={18} />
            </button>
            <span className="meta" style={{ marginLeft: 6, color: "var(--text-3)", whiteSpace: "nowrap" }}>
              长按进度条标记副歌
            </span>
          </div>
          <div className="np__stage-note">
            <span className="hand">台侧视角 · 第三排有人在跟着打拍子</span>
            <span className="np__stage-note__line"></span>
          </div>
          </div>
        </div>

        <aside className="np__queue">
          <div className="np__queue-head">
            <div>
              <div className="np__queue-title">今晚的顺序</div>
              <div className="np__queue-sub">
                {acts.length > 1 ? `分 ${acts.length} 幕 · 每幕四首` : `${queueIds.length} 首 · 一口气听完`}
              </div>
            </div>
            <span className="num" style={{ color: "var(--text-3)", marginTop: 4 }}>{queueIds.length} 首</span>
          </div>

          <div className="np__queue-list scroll">
            <svg className="qpath" width="18" height="100%" viewBox="0 0 18 600" preserveAspectRatio="none" aria-hidden="true">
              <path className="qpath__straight" d="M9 0 V600" vectorEffect="non-scaling-stroke" />
              <path className={"qpath__detour" + (shuffle ? " is-on" : "")}
                d="M9 0 C-4 40, 22 70, 9 110 S -3 170, 9 210 S 21 280, 9 320 S -3 380, 9 420 S 21 490, 9 530 S -2 580, 9 600"
                vectorEffect="non-scaling-stroke" />
            </svg>
            {acts.map((group, gi) => (
              <React.Fragment key={gi}>
                {acts.length > 1 && (
                  <div className="act-sep">
                    <span className="act-sep__num">{["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"][gi]}</span>
                    <span className={"act-sep__bar act-sep__bar--" + ((gi % 3) + 1)}></span>
                  </div>
                )}
                {group.map(id => {
                  const t = TRACK_MAP[id];
                  const isCur = id === currentId;
                  return (
                    <button key={id} className={"qrow" + (isCur ? " is-current" : "") + (struckId === id ? " is-struck" : "")} onClick={() => goTo(id)}>
                      {isCur && playing && (
                        <span className="qrow__playing"><i></i><i></i><i></i></span>
                      )}
                      {!(isCur && playing) && <span className="qrow__no">{String(queueIds.indexOf(id) + 1).padStart(2, "0")}</span>}
                      <span className="qrow__title">{t.title}</span>
                      <span className="qrow__dur">{fmt(t.dur)}</span>
                      {struckId === id && <Strike />}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="np__queue-foot">
            <span className="hand">划掉的那首就别返场了</span>
            <IconPickOutline size={13} style={{ color: "var(--coral)", opacity: .6 }} />
          </div>
        </aside>
      </div>

      {lyricsOn && <LyricsStrip track={track} pos={pos} />}

      <div className="np__timeline">
        <span className="np__timeline-label">演出时间线</span>
        <div className="np__timeline-track">
          {queueIds.map(id => {
            const t = TRACK_MAP[id];
            const isCur = id === currentId;
            return (
              <button key={id} className={"tl-seg" + (isCur ? " is-current" : "")}
                style={{ flexGrow: t.dur / 60 }}
                onClick={() => goTo(id)} title={t.title} aria-label={t.title}></button>
            );
          })}
        </div>
        <span className="np__timeline-time">{fmt(pos)} / {fmt(track.dur)}</span>
      </div>
    </div>
  );
}

Object.assign(window, { NowPlaying });
