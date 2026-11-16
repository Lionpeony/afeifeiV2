/* ---------- 演出档案 ---------- */
function Archive() {
  const { archiveFilter, setArchiveFilter, setPage, goTo, currentId, liked, struckId } = useApp();
  const [openId, setOpenId] = React.useState("a1");

  const filters = [
    { id: "all", label: "全部档案" },
    { id: "liked", label: "我记下的" },
    { id: "tonight", label: "今晚的" }
  ];

  const likedTracks = TRACKS.filter(t => liked.includes(t.id));

  const TrackLine = ({ t, i }) => (
    <button className={"archive-track" + (t.id === currentId ? " is-current" : "") + (struckId === t.id ? " is-struck" : "")} onClick={() => goTo(t.id)}>
      <TrackArt id={t.id} size={26} radius={6} />
      <span className="archive-track__no">{String(i + 1).padStart(2, "0")}</span>
      <span style={{ minWidth: 0 }}>
        <span className="truncate" style={{ display: "block" }}>{t.title}</span>
        <span className="meta" style={{ fontSize: 10 }}>{t.band}</span>
      </span>
      <span className="archive-track__dur">{fmt(t.dur)}</span>
      {struckId === t.id && <Strike />}
    </button>
  );

  return (
    <div className="page" data-screen-label="演出档案">
      <div className="page-head">
        <div>
          <button className="crumb" onClick={() => setPage("discover")}>
            <IconBack size={13} />返回发现
          </button>
          <div className="eyebrow" style={{ marginBottom: 10 }}>乐馆 · 演出档案库</div>
          <h1 className="display">每一次上台，<span className="marker">都留了档</span></h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 460 }}>
            按演出整理的曲目单。有的场次只来了七个人，也记着。
          </p>
        </div>
      </div>

      <div className="row gap8" style={{ marginBottom: 26 }}>
        {filters.map(f => (
          <button key={f.id} className={"chip" + (archiveFilter === f.id ? " is-on" : "")}
            onClick={() => setArchiveFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <span className="spacer"></span>
        <span className="meta">共 {archiveFilter === "liked" ? likedTracks.length : archiveFilter === "tonight" ? SETLIST_TODAY.length : ARCHIVE.length} 项</span>
      </div>

      {archiveFilter === "liked" && likedTracks.length === 0 ? (
        <div style={{ maxWidth: 520 }}>
          <EmptySetlist onGo={() => setPage("discover")} />
        </div>
      ) : archiveFilter !== "all" ? (
        <div className="paper" style={{ padding: "20px 22px" }}>
          <Tape w={70} rot={-3} style={{ top: -9, left: 34 }} />
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div className="h2">{archiveFilter === "liked" ? "我记下的" : "今晚的曲目"}</div>
              <div className="meta" style={{ marginTop: 3 }}>
                {archiveFilter === "liked" ? "盖了拨片印记的都在这里。" : "公告墙上那张 setlist，抄了一遍。"}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => goTo((archiveFilter === "liked" ? likedTracks : SETLIST_TODAY.map(id => TRACK_MAP[id]))[0].id || "t1")}>
              <IconPlay size={13} />全部播放
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            {(archiveFilter === "liked" ? likedTracks : SETLIST_TODAY.map(id => TRACK_MAP[id]))
              .map((t, i) => <TrackLine key={t.id} t={t} i={i} />)}
          </div>
        </div>
      ) : (
        <div className="archive-grid">
          <div style={{ position: "relative" }}>
            <div className="poster">
              <img src={COVER.curtain} alt="" />
              <div className="poster__vert"><span>本日ノ出演</span><span>セットリスト</span></div>
              <div className="poster__overlay">
                <span className="poster__no">ARCHIVE NO. 001</span>
                <span className="poster__title">空白小节<br />第一次上台</span>
                <span className="poster__meta">10.19 · 小剧场「回声」· 47 人到场</span>
              </div>
            </div>
            <div className="row gap8" style={{ marginTop: 18, justifyContent: "space-between" }}>
              <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>这张海报是事后补画的</span>
              <button className="icon-btn" onClick={() => goTo("t11")} title="播放这一场">
                <IconPlay size={16} />
              </button>
            </div>
          </div>

          <div>
            <div className="archive-list">
              {ARCHIVE.map(a => {
                const isOpen = openId === a.id;
                const sum = a.tracks.reduce((s, id) => s + TRACK_MAP[id].dur, 0);
                return (
                  <div key={a.id}>
                    <button className={"archive-row" + (isOpen ? " is-open" : "")}
                      style={enterStyle(ARCHIVE.indexOf(a), 45)}
                      onClick={() => setOpenId(isOpen ? null : a.id)}>
                      <span className="archive-row__date">
                        <span className="archive-row__day">{a.day}</span>
                        <span className="archive-row__mon">{a.mon}</span>
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="archive-row__title">{a.title}</span>
                        <span className="archive-row__sub">
                          <span>{a.venue}</span>
                          <span style={{ width: 3, height: 3, borderRadius: 9, background: "var(--text-3)" }}></span>
                          <span className="hand" style={{ fontSize: 11 }}>{a.note}</span>
                        </span>
                      </span>
                      <span className="archive-row__right">
                        <span className="archive-row__count">{a.tracks.length} 首 · {Math.round(sum / 60)}′</span>
                        <span className="archive-row__chev"><IconChevronRight size={15} /></span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="archive-tracks">
                        <div className="row" style={{ justifyContent: "space-between", padding: "0 8px 6px" }}>
                          <span className="eyebrow">曲目单</span>
                          <button className="demo-link" style={{ color: "var(--pink-700)", textDecoration: "none" }}
                            onClick={() => goTo(a.tracks[0])}>
                            从头听 →
                          </button>
                        </div>
                        {a.tracks.map((id, i) => <TrackLine key={id} t={TRACK_MAP[id]} i={i} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="row gap8" style={{ marginTop: 18, paddingLeft: 14 }}>
              <IconPickOutline size={14} style={{ color: "var(--coral)" }} />
              <span className="meta">收藏的曲目会盖一枚拨片，出现在「我记下的」里。</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Archive });
