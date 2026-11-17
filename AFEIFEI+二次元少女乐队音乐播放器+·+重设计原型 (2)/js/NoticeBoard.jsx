/* ---------- 公告墙 ---------- */
function NoticeBoard() {
  const { goTo, currentId, playing, struckId, setPage, openPlayer, plays } = useApp();
  const total = SETLIST_TODAY.reduce((s, id) => s + TRACK_MAP[id].dur, 0);

  return (
    <div className="page" data-screen-label="公告墙">
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>排练室 B1 · 那块白板</div>
          <h1 className="display">
            今晚的 <span className="marker">setlist</span>
          </h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 440 }}>
            三个人，四十分钟，先这样排吧。第四首还没定，看现场。
          </p>
        </div>
        <div className="page-head__aside">
          <div className="row gap8">
            <span className="chip chip--tag">5 首</span>
            <span className="chip chip--tag">{Math.round(total / 60)} 分钟</span>
            <span className="chip chip--tag" style={{ color: "var(--coral)", borderColor: "rgba(198,42,63,.3)" }}>未完成 2</span>
          </div>
          <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>
            今天已经听了 {Object.values(plays).reduce((a, b) => a + b, 0)} 遍
          </span>
        </div>
      </div>

      <div className="board-grid">
        <div className="setlist-sheet">
          <Tape style={{ top: -11, left: "50%", marginLeft: -46 }} w={92} rot={-2} />
          <div className="setlist-sheet__top">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>SETLIST · 11 / 16</div>
              <div className="setlist-sheet__title">今天的顺序</div>
            </div>
            <div className="setlist-sheet__stamp">内部用</div>
          </div>

          <div className="setlist-col-head">
            <span className="eyebrow">#</span>
            <span className="eyebrow">曲目</span>
            <span />
            <span className="eyebrow" style={{ textAlign: "right" }}>时长</span>
          </div>

          {SETLIST_TODAY.map((id, i) => {
            const t = TRACK_MAP[id];
            const isCurrent = id === currentId;
            return (
              <button key={id} className={"setlist-row" + (isCurrent ? " is-current" : "") + (struckId === id ? " is-struck" : "")}
                style={enterStyle(i, 40)} onClick={() => goTo(id)}>
                <span className="setlist-row__no">{String(i + 1).padStart(2, "0")}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="setlist-row__title">{t.title}</span>
                  <span className="setlist-row__band">
                    {t.band}
                    {t.note && <span className="hand" style={{ color: "var(--text-3)" }}> · {t.note}</span>}
                  </span>
                </span>
                <span style={{ display: "flex", justifyContent: "flex-end" }}>
                  {isCurrent && playing ? <Bars /> : <IconPlay size={13} style={{ color: "var(--text-3)" }} />}
                </span>
                <span className="setlist-row__dur">{fmt(t.dur)}</span>
                {struckId === id && <Strike />}
              </button>
            );
          })}

          <div className="setlist-note">
            <span className="hand">↑ 按这个顺序，第四首记得留白八小节</span>
            <i></i>
          </div>
        </div>

        <div className="notes-col">
          <div className="note note--yellow" style={{ transform: "rotate(1.2deg)" }}>
            <span className="note__pin"></span>
            录音笔又没电了。<br />下次排练带两节电池。
            <div className="note__meta">— 周三 21:40</div>
          </div>
          <div className="note note--pink" style={{ transform: "rotate(-1.6deg)" }}>
            这一版副歌……再想想。<br />
            <span style={{ textDecoration: "line-through", textDecorationColor: "rgba(198,42,63,.55)", textDecorationThickness: "2px" }}>太高了唱不上去</span>
            <div className="note__meta">— 贴在音箱上</div>
          </div>
          <div className="note note--mint" style={{ transform: "rotate(.8deg)" }}>
            散场后去吃关东煮。<br />谁先走谁请客。
            <div className="note__meta">— 全员同意</div>
          </div>
        </div>
      </div>

      <SectionHead note="胶带贴的，别撕" right={
        <button className="btn btn-ghost btn-sm" onClick={() => setPage("archive")}>
          全部演出<IconArrowRight size={14} />
        </button>
      }>
        贴上去的演出传单
      </SectionHead>

      <div className="flyers">
        {FLYERS.map((f, fi) => {
          const first = TRACKS.find(t => t.band === f.band);
          return (
            <div key={f.id} style={{ position: "relative", ...enterStyle(fi + 2, 55) }}>
              <Tape w={64} rot={-3} style={{ top: -10, left: "50%", marginLeft: -32 }} />
              <button className="flyer flyer__rot" style={{ "--rot": f.rot }}
                onClick={() => { if (first) goTo(first.id); openPlayer(); }}>
                <img className="flyer__img" src={f.img} alt="" />
                <span className="flyer__scrim"></span>
                <span className="flyer__halftone"></span>
                <span className="flyer__tag">{f.tag}</span>
                <span className="flyer__body">
                  <span className="flyer__kicker" style={{ display: "block" }}>{f.kicker}</span>
                  <span className="flyer__title" style={{ display: "block", whiteSpace: "pre-line" }}>{f.title}</span>
                  <span className="flyer__meta">
                    <span>{f.meta[0]}</span><span style={{ opacity: .5 }}>/</span><span>{f.meta[1]}</span>
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="row gap12" style={{ marginTop: 30, justifyContent: "space-between" }}>
        <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>
          传单是手绘的，字有点歪，别介意。
        </span>
        <div className="row gap8">
          <span className="eyebrow">本周循环</span>
          <div className="row gap6">
            {TRACKS.slice(0, 3).map(t => (
              <button key={t.id} onClick={() => goTo(t.id)} title={t.title}
                style={{ width: 34, height: 34, borderRadius: 9, overflow: "hidden", boxShadow: "0 2px 8px rgba(61,43,57,.14)" }}>
                <img src={t.cover} alt={t.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NoticeBoard });
