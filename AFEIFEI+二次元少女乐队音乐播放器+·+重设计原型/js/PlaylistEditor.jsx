/* ---------- 新建 / 编辑歌单 ---------- */
const COVER_KEYS = ["amp", "rain", "river", "dark", "curtain", "store", "moon", "paper"];
const COVER_NAMES = {
  amp: "音箱", rain: "雨", river: "河堤", dark: "熄灯",
  curtain: "幕布", store: "便利店", moon: "月亮", paper: "纸页"
};

function ListEditor() {
  const {
    listEditor, setListEditor, myLists, setMyLists, openList, toast, onoma, setPage
  } = useApp();
  const editing = listEditor ? listEditor.list : null;

  const [name, setName] = React.useState(editing ? editing.name : "");
  const [note, setNote] = React.useState(editing ? editing.note : "");
  const [cover, setCover] = React.useState(editing ? editing.cover : "amp");
  const [confirmDel, setConfirmDel] = React.useState(false);

  React.useEffect(() => {
    if (!listEditor) return;
    const l = listEditor.list;
    setName(l ? l.name : "");
    setNote(l ? l.note : "");
    setCover(l ? l.cover : "amp");
    setConfirmDel(false);
  }, [listEditor]);

  React.useEffect(() => {
    const fn = e => { if (e.key === "Escape") setListEditor(null); };
    if (listEditor) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [listEditor, setListEditor]);

  if (!listEditor) return null;

  const submit = e => {
    e && e.preventDefault();
    const n = name.trim();
    if (!n) { toast("给这张歌单起个名字吧", { hand: true }); return; }
    const stamp = Date.now();
    if (editing) {
      setMyLists(list => list.map(l => l.id === editing.id
        ? { ...l, name: n, note: note.trim(), cover, updatedAt: stamp } : l));
      toast(`「${n}」改好了`, { icon: "check" });
    } else {
      const id = "u" + stamp.toString(36);
      setMyLists(list => [{ id, name: n, note: note.trim(), cover, tracks: listEditor.tracks || [], createdAt: stamp, updatedAt: stamp }, ...list]);
      toast(`建好「${n}」，往里丢歌吧`, { icon: "check" });
      setPage("playlists");
      openList(id);
    }
    if (window.Sound) Sound.ding();
    setListEditor(null);
  };

  const remove = () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setMyLists(list => list.filter(l => l.id !== editing.id));
    toast("歌单删掉了，歌还在库里", { hand: true });
    setListEditor(null);
  };

  return (
    <React.Fragment>
      <div className="dlg-mask" onClick={() => setListEditor(null)}></div>
      <form className="dlg" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editing ? "编辑歌单" : "新建歌单"}>
        <div className="dlg__head">
          <div>
            <div className="eyebrow">{editing ? "EDIT LIST" : "NEW LIST"}</div>
            <h2 className="dlg__title">{editing ? "改一改这张歌单" : "新建一张歌单"}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => setListEditor(null)} title="关闭" aria-label="关闭">
            <IconX size={15} />
          </button>
        </div>

        <div className="dlg__field">
          <label htmlFor="list-name">名字</label>
          <input id="list-name" className="dlg__input" value={name} maxLength={18}
            onChange={e => setName(e.target.value)} placeholder="比如：深夜排练室" autoFocus />
          <span className="dlg__count">{name.length}/18</span>
        </div>

        <div className="dlg__field">
          <label htmlFor="list-note">一句说明</label>
          <input id="list-note" className="dlg__input" value={note} maxLength={24}
            onChange={e => setNote(e.target.value)} placeholder="给未来的自己留句话（可留空）" />
        </div>

        <div className="dlg__field">
          <label>封面</label>
          <div className="cover-pick">
            {COVER_KEYS.map(k => (
              <button type="button" key={k} className={cover === k ? "is-on" : ""}
                onClick={() => setCover(k)} title={COVER_NAMES[k]} aria-label={"封面 " + COVER_NAMES[k]}>
                <img src={COVER[k]} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="dlg__foot">
          {editing && (
            <button type="button" className="dlg__del" onClick={remove}>
              {confirmDel ? "再点一次确认删除" : "删除歌单"}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setListEditor(null)}>再想想</button>
          <button type="submit" className="btn btn-primary btn-sm">
            <IconCheck size={13} />{editing ? "保存" : "建好了"}
          </button>
        </div>
      </form>
    </React.Fragment>
  );
}

/* 选择加入哪张我的歌单（行菜单里的二级面板用） */
function AddToListPanel({ trackId, onDone }) {
  const { myLists, addToMyList, setListEditor, toast } = useApp();
  return (
    <div className="rowmenu__sub">
      <div className="rowmenu__sub-title eyebrow">加入我的歌单</div>
      {myLists.length === 0 && (
        <div className="rowmenu__empty">还没有自己建过歌单</div>
      )}
      {myLists.map(l => (
        <button key={l.id} className="rowmenu__sublist"
          onClick={() => { addToMyList(l.id, trackId); toast(`已加入「${l.name}」`, { icon: "check" }); onDone(); }}>
          <img className="rowmenu__subart" src={COVER[l.cover] || COVER.amp} alt="" />
          <span className="truncate">{l.name}</span>
          <span className="num">{l.tracks.length}</span>
        </button>
      ))}
      <button className="rowmenu__sublist rowmenu__sublist--new"
        onClick={() => { setListEditor({ mode: "new", tracks: [trackId] }); onDone(); }}>
        <IconPlus size={13} />新建歌单并加进去
      </button>
    </div>
  );
}

Object.assign(window, { ListEditor, AddToListPanel, COVER_KEYS, COVER_NAMES });
