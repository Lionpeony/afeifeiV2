/* ---------- 歌单页 ---------- */
function Playlists() {
  const { source, setSource, savedLists, saveList, playAll, setPage, liked, toast, onoma, onomaAt } = useApp();
  const lists = PLAYLISTS[source] || [];
  const [selId, setSelId] = React.useState(() => {
    const want = new URLSearchParams(location.search).get("pl");
    return lists.some(l => l.id === want) ? want : lists[0].id;
  });
  const [reloading, setReloading] = React.useState(false);

  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSelId(PLATFORMS_FIRST(source));
  }, [source]);

  const sel = lists.find(l => l.id === selId) || lists[0];
  const src = SOURCES[source];

  const reload = () => {
    if (reloading) return;
    setReloading(true);
    setTimeout(() => setReloading(false), 460);
  };
  const doImport = () => {
    onoma("ポンッ", { tone: "mint", x: window.innerWidth * 0.55, y: 200 });
    toast("导入窗口是原型占位，先当已经导进来了。", { hand: true });
  };

  return (
    <div className="page pl" data-screen-label="歌单">
      <div className="pl__head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>PLAYLISTS · {lists.length} LISTS</div>
          <h1 className="display">歌单</h1>
        </div>
        <div className="row gap8">
          <button className="btn btn-ghost btn-sm" onClick={doImport}>
            <IconImport size={14} />导入
          </button>
          <button className="btn btn-ghost btn-sm" onClick={reload}>
            <IconRefresh size={14} />刷新
          </button>
        </div>
      </div>

      <div className="pl__switch">
        <div className="src-pill">
          {Object.values(SOURCES).map(s => (
            <button key={s.id}
              className={"src-pill__btn" + (source === s.id ? " is-on" : "")}
              onClick={() => { if (source !== s.id) { setSource(s.id); onoma("シャッ", { tone: "mint", x: window.innerWidth * 0.3, y: 190 }); } }}>
              {s.name}
            </button>
          ))}
        </div>
        <span className="meta">{lists.length} 个歌单 · {src.account}</span>
        <span className="meta hand" style={{ color: "var(--text-3)" }}>切换音源会重新拉一次列表</span>
      </div>

      <div className={"pl__grid" + (reloading ? " is-reloading" : "")}>
        <aside className="pl__side">
          <div className="pl__side-label eyebrow">账号歌单 · {src.short}</div>

          <button className={"pl-row" + (selId === "__likes" ? " is-active" : "")}
            onClick={() => setPage("likes")}>
            <span className="pl-row__art">
              <IconHeart size={16} style={{ color: "var(--pink-600)" }} />
            </span>
            <span className="pl-row__name">我喜欢的音乐</span>
            <span className="pl-row__count num">{liked.length} 首</span>
          </button>

          {lists.map((l, i) => (
            <button key={l.id} className={"pl-row" + (l.id === selId ? " is-active" : "")}
              onClick={() => setSelId(l.id)} style={enterStyle(i, 26)}>
              <span className="pl-row__art">
                <TrackArt id={source + l.id} size={38} radius={8} />
              </span>
              <span className="pl-row__text">
                <span className="pl-row__name truncate">{l.name}</span>
                <span className="pl-row__note truncate hand">{l.note}</span>
              </span>
              <span className="pl-row__count num">{l.tracks.length} 首</span>
            </button>
          ))}
        </aside>

        <section className="pl__detail paper">
          <Tape w={70} rot={-2.4} style={{ top: -10, left: 30 }} />
          <div className="pl__detail-head">
            <div className="pl__cover">
              <TrackArt id={source + sel.id} size={104} radius={14} />
              <span className="pl__cover-tag">{src.short}</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="eyebrow">{src.name} · 账号歌单</div>
              <h2 className="pl__name">{sel.name}</h2>
              <div className="meta">{sel.tracks.length} 首 · 导入于 11 月 · <span className="hand">{sel.note}</span></div>
              <div className="row gap8" style={{ marginTop: 14 }}>
                <button className="btn btn-primary btn-sm" onClick={() => playAll(sel.tracks)}>
                  <IconPlay size={13} />播放全部
                </button>
                <button className={"btn btn-ghost btn-sm" + (savedLists.includes(source + sel.id) ? " is-saved" : "")}
                  onClick={e => { saveList(source + sel.id, sel.name); onomaAt(e.currentTarget, "ポンッ", "coral"); }}>
                  {savedLists.includes(source + sel.id) ? <><IconCheck size={13} />已收藏到我的歌单</> : <><IconPlus size={13} />收藏到我的歌单</>}
                </button>
              </div>
            </div>
          </div>

          {sel.tracks.length === 0 ? (
            <EmptySetlist title="这张 setlist 还空着。" sub="从音源那边重新导入一次试试。" onGo={reload} />
          ) : (
            <TrackTable ids={sel.tracks} source={src.name} />
          )}
        </section>
      </div>

      <div className="row gap8" style={{ marginTop: 20 }}>
        <IconCloud size={13} style={{ color: "var(--text-3)" }} />
        <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          歌单来自你在 {src.name} 的账号；本地只缓存列表，不存音频文件。
        </span>
      </div>
    </div>
  );
}

/* 切音源时默认选中第一张 */
function PLATFORMS_FIRST(source) {
  const list = PLAYLISTS[source] || [];
  return list[0] ? list[0].id : "__likes";
}

Object.assign(window, { Playlists });
