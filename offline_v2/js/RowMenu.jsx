/* ---------- 歌曲行「更多」菜单 ---------- */
function RowMenu() {
  const {
    rowMenu, closeRowMenu, source, accounts, liked, toggleLike, tryPlay, playNext,
    addDownload, toast, onoma, setPage, openPlayer
  } = useApp();
  const [sub, setSub] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    setSub(false);
  }, [rowMenu && rowMenu.trackId]);

  React.useEffect(() => {
    const fn = e => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current && ref.current.contains(e.target)) return;
      closeRowMenu();
    };
    document.addEventListener("keydown", fn);
    document.addEventListener("pointerdown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      document.removeEventListener("pointerdown", fn);
    };
  }, [closeRowMenu]);

  if (!rowMenu) return null;
  const t = TRACK_MAP[rowMenu.trackId];
  if (!t) return null;
  const isOn = liked.includes(t.id);
  const lists = PLAYLISTS[source] || [];

  const Item = ({ icon: Ico, children, onClick, danger, hint }) => (
    <button className={"rowmenu__item" + (danger ? " is-danger" : "")} onClick={onClick} title={hint}>
      <span className="rowmenu__ico"><Ico size={15} /></span>
      <span className="rowmenu__label">{children}</span>
      {hint && <span className="rowmenu__hint">{hint}</span>}
    </button>
  );

  return (
    <div className="rowmenu" ref={ref}
      style={{ left: rowMenu.x, top: rowMenu.y }}
      role="menu" aria-label={t.title + " 的操作菜单"}>
      <div className="rowmenu__head">
        <img src={t.cover} alt="" />
        <span className="rowmenu__headtext">
          <b className="truncate">{t.title}</b>
          <span className="meta truncate">{t.artist}</span>
        </span>
      </div>

      <div className="rowmenu__group">
        <Item icon={IconPlay} onClick={() => { tryPlay(t.id); closeRowMenu(); }}>立即播放</Item>
        <Item icon={IconQueue} onClick={() => { playNext(t.id); closeRowMenu(); }}>下一首播放</Item>
      </div>

      <div className="rowmenu__group">
        <Item icon={isOn ? IconHeartFill : IconHeart} onClick={() => {
          toggleLike(t.id);
          onoma("ポンッ", { tone: "coral", x: rowMenu.x + 120, y: rowMenu.y + 60 });
        }}>{isOn ? "取消收藏" : "收藏到我喜欢的音乐"}</Item>
        <Item icon={IconPlus} onClick={() => setSub(s => !s)} hint={sub ? "收起" : "选择"}>收藏到歌单</Item>
        <Item icon={IconDownload} onClick={() => { addDownload(t.id); closeRowMenu(); }}>下载到本地</Item>
      </div>

      <div className="rowmenu__group">
        <Item icon={IconDisc} onClick={() => {
          toast(`《${t.album}》的专辑页在原型里是占位`, { hand: true });
          closeRowMenu();
        }}>查看专辑</Item>
        <Item icon={IconUser} onClick={() => {
          toast(`${t.artist} 的艺人页在原型里是占位`, { hand: true });
          closeRowMenu();
        }}>查看艺人</Item>
      </div>

      {sub && (
        <div className="rowmenu__sub">
          <div className="rowmenu__sub-title eyebrow">加入哪个歌单</div>
          {lists.map(p => (
            <button key={p.id} className="rowmenu__sublist"
              onClick={() => {
                toast(`已加入「${p.name}」`, { icon: "check" });
                onoma("ポンッ", { tone: "mint", x: rowMenu.x + 120, y: rowMenu.y + 80 });
                closeRowMenu();
              }}>
              <TrackArt id={source + p.id} size={22} radius={6} />
              <span className="truncate">{p.name}</span>
              <span className="num">{p.tracks.length}</span>
            </button>
          ))}
          <button className="rowmenu__sublist rowmenu__sublist--new"
            onClick={() => { toast("新建歌单在原型里是占位", { hand: true }); closeRowMenu(); }}>
            <IconPlus size={13} />新建歌单
          </button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RowMenu });
