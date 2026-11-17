/* ---------- 发现页（每日推荐 / 榜单 / 热门推荐 / 传单墙） ---------- */
function Discover() {
  const { source, accounts, goTo, playAll, playAt, setPage, openPlayer, onoma, setPlaying } = useApp();
  const [mixSeed, setMixSeed] = React.useState(0);
  const [topId, setTopId] = React.useState("L1");
  const [sheer, setSheer] = React.useState(false);
  const [previewAll, setPreviewAll] = React.useState(false);
  const src = SOURCES[source] || SOURCES.netease;

  const mixIds = React.useMemo(() => {
    const n = DAILY_MIX.length;
    if (!mixSeed) return DAILY_MIX;
    return DAILY_MIX.slice(mixSeed % n).concat(DAILY_MIX.slice(0, mixSeed % n));
  }, [mixSeed]);

  const reshuffle = () => {
    if (sheer) return;
    setSheer(true);
    setMixSeed(s => s + 7);
    setTimeout(() => setSheer(false), 420);
  };

  const top = TOPLISTS.find(t => t.id === topId) || TOPLISTS[0];
  const today = new Date();
  const dayNum = String(today.getDate()).padStart(2, "0");
  const monStr = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][today.getMonth()];
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][today.getDay()];
  const hot = ["t18", "t22", "t4", "t20", "t9", "t26", "t15", "t30"];

  return (
    <div className="page disc" data-screen-label="发现">
      <div className="disc__head">
        <div>
          <div className="eyebrow disc__eyebrow">DISCOVER · {src.name}{accounts[source] ? " · 已登录" : " · 演示数据"}</div>
          <h1 className="display">发现</h1>
        </div>
        <div className="disc__date" title="今天的日期">
          <b>{dayNum}</b>
          <span>{monStr}<br />{weekday}</span>
        </div>
      </div>

      <section className={"mix" + (sheer ? " is-sheering" : "")}>
        <div className="mix__cover">
          <img src={COVER.amp} alt="" />
          <span className="mix__tag">DAILY MIX</span>
          <span className="mix__stamp">33</span>
        </div>
        <div className="mix__body">
          <div className="eyebrow">DAILY MIX · 今日发行</div>
          <h2 className="mix__title">每日推荐</h2>
          <div className="mix__meta">来自 {src.name} 账号 · 33 首 · 每天 06:00 换新</div>
          <div className="row gap10" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => { playAll(mixIds.slice(0, 12)); openPlayer(); }}>
              <IconPlay size={14} />今日开播
            </button>
            <button className="btn btn-ghost" onClick={reshuffle}>
              <IconRefresh size={14} />换一批
            </button>
          </div>
          <div className="mix__list">
            {mixIds.slice(0, 4).map((id, i) => {
              const t = TRACK_MAP[id];
              return (
                <button key={id} className="mix-row" onClick={() => playAt(mixIds, i)}>
                  <span className="mix-row__no num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="mix-row__title truncate">{t.title}</span>
                  <span className="mix-row__artist truncate">{t.artist}</span>
                  <span className="mix-row__dur num">{fmt(t.dur)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mix__bigdate">
          <b>{dayNum}</b>
          <span>{monStr}</span>
        </div>
      </section>

      <div className="disc__sect">
        <h2 className="sect-title">榜单<span>TOPLISTS</span></h2>
        <div className="row gap10">
          <span className="meta">{TOPLISTS.length} 个榜单</span>
          <button className="icon-btn" title="刷新榜单" onClick={() => setTopId("L" + (1 + Math.floor(Math.random() * TOPLISTS.length)))}>
            <IconRefresh size={15} />
          </button>
        </div>
      </div>

      <div className="toplists scroll-x">
        {TOPLISTS.map(t => (
          <button key={t.id} className={"top-card" + (t.id === topId ? " is-active" : "")}
            onClick={() => setTopId(t.id)}>
            <span className="top-card__art" style={{ background: "linear-gradient(150deg," + t.grad[0] + "," + t.grad[1] + ")" }}>
              <IconPick size={15} style={{ opacity: .5, color: "#fff", position: "relative", zIndex: 1 }} />
              <b>{t.name}</b>
              <span className="top-card__no">{String(TOPLISTS.indexOf(t) + 1).padStart(2, "0")}</span>
            </span>
            <span className="top-card__name">{t.name}</span>
            <span className="top-card__count num">{t.count} 首</span>
          </button>
        ))}
      </div>

      <div className="top-preview paper">
        <Tape w={64} rot={-2} style={{ top: -9, left: 26 }} />
        <div className="top-preview__head">
          <div>
            <div className="h2">{top.name}</div>
            <div className="meta">{top.count} 首 · 每次刷新顺序都会变</div>
          </div>
          <button className="btn btn-soft btn-sm" onClick={() => playAll(top.tracks)}>
            <IconPlay size={13} />播放这个榜
          </button>
        </div>
        <TrackTable ids={previewAll ? top.tracks : top.tracks.slice(0, 6)} dense />
        {top.tracks.length > 6 && (
          <button className="top-preview__more" onClick={() => setPreviewAll(v => !v)}>
            {previewAll ? "收起这个榜" : `展开全部 ${top.tracks.length} 首`}
            <IconArrowRight size={13} style={{ transform: previewAll ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform .22s var(--ease)" }} />
          </button>
        )}
      </div>

      <div className="disc__sect">
        <h2 className="sect-title">热门推荐<span>HOT TRACKS</span></h2>
        <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>这周被搜得最多的几首</span>
      </div>

      <div className="hot-cards">
        {["t18", "t22"].map((id, i) => {
          const t = TRACK_MAP[id];
          return (
            <button key={id} className="hot-card" onClick={() => { goTo(id); openPlayer(); }}
              style={enterStyle(i, 50)}>
              <img className="hot-card__img" src={t.cover} alt="" />
              <span className="hot-card__body">
                <span className="hot-card__kicker">HOT · {String(i + 1).padStart(2, "0")}</span>
                <span className="hot-card__title">{t.title}</span>
                <span className="hot-card__meta">{t.artist} · {t.album}</span>
              </span>
              <span className="hot-card__play"><IconPlay size={14} /></span>
            </button>
          );
        })}
      </div>

      <TrackTable ids={hot} source={src.name} />

      <div className="disc__sect">
        <h2 className="sect-title">传单墙<span>FLYERS</span></h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setPage("archive")}>
          全部演出<IconArrowRight size={14} />
        </button>
      </div>

      <div className="flyers flyers--compact">
        {FLYERS.map((f, fi) => {
          const first = TRACKS.find(t => t.band === f.band);
          return (
            <div key={f.id} style={{ position: "relative", ...enterStyle(fi + 1, 55) }}>
              <Tape w={60} rot={-3} style={{ top: -9, left: "50%", marginLeft: -30 }} />
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

      <div className="row gap8" style={{ marginTop: 24 }}>
        <IconSparkle size={13} style={{ color: "var(--pink-400)" }} />
        <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          推荐与榜单都由账号那边的数据算，这里只负责摆得好看。
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { Discover });
