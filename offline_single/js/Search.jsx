/* ---------- 全局搜索浮层 ---------- */
const Mark = ({ text, q }) => {
  const key = (q || "").trim();
  if (!key) return <>{text}</>;
  const i = text.toLowerCase().indexOf(key.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="hl">{text.slice(i, i + key.length)}</mark>
      {text.slice(i + key.length)}
    </>
  );
};

const SourceDots = ({ avail }) => (
  <span className="src-dots">
    {Object.values(SOURCES).map(s => {
      const st = (avail && avail[s.id]) || "ok";
      return (
        <span key={s.id} className={"src-dot" + (st === "ok" ? " is-ok" : st === "vip" ? " is-vip" : " is-none")}
          style={{ "--src": s.tone }} title={s.name + " · " + AVAIL_LABEL[st]}>
          {st === "ok" ? s.short : st === "vip" ? "VIP" : "—"}
        </span>
      );
    })}
  </span>
);

function SearchOverlay({ q, onClose }) {
  const { playAt, tryPlay, source, setPage } = useApp();
  const [tab, setTab] = React.useState("track");
  const [busy, setBusy] = React.useState(false);
  const key = (q || "").trim().toLowerCase();

  React.useEffect(() => {
    if (!key) return;
    setBusy(true);
    const t = setTimeout(() => setBusy(false), 240);
    return () => clearTimeout(t);
  }, [key]);

  React.useEffect(() => {
    const fn = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const hit = s => s.toLowerCase().includes(key);
  const tracks = key ? TRACKS.filter(t => hit(t.title) || hit(t.artist) || hit(t.album)) : [];
  const artists = key ? Array.from(new Set(TRACKS.filter(t => hit(t.artist)).map(t => t.artist))) : [];
  const albums = key ? Object.values(RELEASES).filter(r => hit(r.title) || hit(r.band)) : [];
  const lists = key
    ? ["netease", "qq"].flatMap(sid => (PLAYLISTS[sid] || []).map(p => ({ ...p, src: sid }))).filter(p => hit(p.name))
    : [];

  const tabs = [
    { id: "track", label: "单曲", n: tracks.length },
    { id: "artist", label: "艺人", n: artists.length },
    { id: "album", label: "专辑", n: albums.length },
    { id: "list", label: "歌单", n: lists.length }
  ];

  const total = tracks.length + artists.length + albums.length + lists.length;

  return (
    <>
      <div className="search-scrim" onPointerDown={onClose}></div>
      <div className="search-overlay" role="dialog" aria-label="搜索结果">
        <div className="search-overlay__tabs">
          {tabs.map(t => (
            <button key={t.id}
              className={"search-tab" + (tab === t.id ? " is-on" : "")}
              onClick={() => setTab(t.id)}>
              {t.label}
              <span className="num">{t.n}</span>
            </button>
          ))}
          <span className="search-overlay__total meta">
            「{q.trim()}」共 {total} 条
          </span>
        </div>

        <div className="search-overlay__body">
          {busy ? (
            <div className="search-busy">
              <span className="search-busy__guitar"><GuitarFigure w={110} h={52} /></span>
              <span className="hand">在翻曲库……</span>
            </div>
          ) : total === 0 ? (
            <div className="search-empty-note loop">
              <Tape w={60} rot={-2.5} style={{ top: -9, left: "50%", marginLeft: -30 }} />
              <p>这家 live house 没找到这首曲子。</p>
              <span className="hand">换个词试试，或者去漫游随便听听。</span>
              <button className="btn btn-soft btn-sm" onClick={() => { onClose(); setPage("wander"); }}>
                去迷路漫游<IconArrowRight size={14} />
              </button>
            </div>
          ) : tab === "track" ? (
            <div className="sr-list">
              {tracks.map((t, i) => {
                const av = (t.avail && t.avail[source]) || "ok";
                return (
                  <button key={t.id} className={"sr-row" + (av !== "ok" ? " is-dim" : "")}
                    onClick={() => { tryPlay(t.id, tracks.map(x => x.id), i); onClose(); }}>
                    <img className="sr-row__art" src={t.cover} alt="" />
                    <span className="sr-row__main">
                      <span className="sr-row__title truncate"><Mark text={t.title} q={q} /></span>
                      <span className="sr-row__sub truncate">
                        <Mark text={t.artist} q={q} /> · <Mark text={t.album} q={q} />
                      </span>
                    </span>
                    <SourceDots avail={t.avail} />
                    <span className="sr-row__dur num">{fmt(t.dur)}</span>
                  </button>
                );
              })}
            </div>
          ) : tab === "artist" ? (
            <div className="sr-artists">
              {artists.map(a => {
                const own = TRACKS.filter(t => t.artist === a);
                return (
                  <button key={a} className="sr-artist" onClick={() => { playAt(own.map(t => t.id), 0); onClose(); }}>
                    <span className="sr-artist__avatar">{a.slice(0, 1)}</span>
                    <span className="sr-artist__name truncate"><Mark text={a} q={q} /></span>
                    <span className="meta">{own.length} 首 · {own[0].album}</span>
                  </button>
                );
              })}
            </div>
          ) : tab === "album" ? (
            <div className="sr-list">
              {albums.map(r => (
                <button key={r.id} className="sr-row" onClick={() => { onClose(); setPage("discover"); }}>
                  <img className="sr-row__art" src={r.cover} alt="" />
                  <span className="sr-row__main">
                    <span className="sr-row__title truncate"><Mark text={r.title} q={q} /></span>
                    <span className="sr-row__sub truncate">
                      <Mark text={r.band} q={q} /> · {r.kind}
                    </span>
                  </span>
                  <span className="sr-row__tag">{TRACKS.filter(t => t.release === r.id).length} 首</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="sr-list">
              {lists.map(p => (
                <button key={p.src + p.id} className="sr-row"
                  onClick={() => { onClose(); setPage("playlists"); }}>
                  <span className="sr-row__art sr-row__art--art">
                    <TrackArt id={p.src + p.id} size={40} radius={9} />
                  </span>
                  <span className="sr-row__main">
                    <span className="sr-row__title truncate"><Mark text={p.name} q={q} /></span>
                    <span className="sr-row__sub truncate">{p.tracks.length} 首 · {SOURCES[p.src].name}</span>
                  </span>
                  <span className="sr-row__tag" style={{ color: SOURCES[p.src].tone }}>
                    {SOURCES[p.src].short}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="search-overlay__foot">
          <span className="meta">结果全部为虚构演示数据 · 音源标签表示哪家收录了这首</span>
          <span className="meta">Esc 关闭</span>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { SearchOverlay, Mark, SourceDots });
