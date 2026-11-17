const COVER_KEYS = ["amp", "rain", "river", "dark", "curtain", "store", "moon", "paper"];
const COVER_NAMES = {
  amp: "\u97F3\u7BB1",
  rain: "\u96E8",
  river: "\u6CB3\u5824",
  dark: "\u7184\u706F",
  curtain: "\u5E55\u5E03",
  store: "\u4FBF\u5229\u5E97",
  moon: "\u6708\u4EAE",
  paper: "\u7EB8\u9875"
};
function ListEditor() {
  const {
    listEditor,
    setListEditor,
    myLists,
    setMyLists,
    openList,
    toast,
    onoma,
    setPage
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
    const fn = (e) => {
      if (e.key === "Escape") setListEditor(null);
    };
    if (listEditor) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [listEditor, setListEditor]);
  if (!listEditor) return null;
  const submit = (e) => {
    e && e.preventDefault();
    const n = name.trim();
    if (!n) {
      toast("\u7ED9\u8FD9\u5F20\u6B4C\u5355\u8D77\u4E2A\u540D\u5B57\u5427", { hand: true });
      return;
    }
    const stamp = Date.now();
    if (editing) {
      setMyLists((list) => list.map((l) => l.id === editing.id ? { ...l, name: n, note: note.trim(), cover, updatedAt: stamp } : l));
      toast(`\u300C${n}\u300D\u6539\u597D\u4E86`, { icon: "check" });
    } else {
      const id = "u" + stamp.toString(36);
      setMyLists((list) => [{ id, name: n, note: note.trim(), cover, tracks: listEditor.tracks || [], createdAt: stamp, updatedAt: stamp }, ...list]);
      toast(`\u5EFA\u597D\u300C${n}\u300D\uFF0C\u5F80\u91CC\u4E22\u6B4C\u5427`, { icon: "check" });
      setPage("playlists");
      openList(id);
    }
    if (window.Sound) Sound.ding();
    setListEditor(null);
  };
  const remove = () => {
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    setMyLists((list) => list.filter((l) => l.id !== editing.id));
    toast("\u6B4C\u5355\u5220\u6389\u4E86\uFF0C\u6B4C\u8FD8\u5728\u5E93\u91CC", { hand: true });
    setListEditor(null);
  };
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "dlg-mask", onClick: () => setListEditor(null) }), /* @__PURE__ */ React.createElement("form", { className: "dlg", onSubmit: submit, role: "dialog", "aria-modal": "true", "aria-label": editing ? "\u7F16\u8F91\u6B4C\u5355" : "\u65B0\u5EFA\u6B4C\u5355" }, /* @__PURE__ */ React.createElement("div", { className: "dlg__head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, editing ? "EDIT LIST" : "NEW LIST"), /* @__PURE__ */ React.createElement("h2", { className: "dlg__title" }, editing ? "\u6539\u4E00\u6539\u8FD9\u5F20\u6B4C\u5355" : "\u65B0\u5EFA\u4E00\u5F20\u6B4C\u5355")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "icon-btn", onClick: () => setListEditor(null), title: "\u5173\u95ED", "aria-label": "\u5173\u95ED" }, /* @__PURE__ */ React.createElement(IconX, { size: 15 }))), /* @__PURE__ */ React.createElement("div", { className: "dlg__field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "list-name" }, "\u540D\u5B57"), /* @__PURE__ */ React.createElement(
    "input",
    {
      id: "list-name",
      className: "dlg__input",
      value: name,
      maxLength: 18,
      onChange: (e) => setName(e.target.value),
      placeholder: "\u6BD4\u5982\uFF1A\u6DF1\u591C\u6392\u7EC3\u5BA4",
      autoFocus: true
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "dlg__count" }, name.length, "/18")), /* @__PURE__ */ React.createElement("div", { className: "dlg__field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "list-note" }, "\u4E00\u53E5\u8BF4\u660E"), /* @__PURE__ */ React.createElement(
    "input",
    {
      id: "list-note",
      className: "dlg__input",
      value: note,
      maxLength: 24,
      onChange: (e) => setNote(e.target.value),
      placeholder: "\u7ED9\u672A\u6765\u7684\u81EA\u5DF1\u7559\u53E5\u8BDD\uFF08\u53EF\u7559\u7A7A\uFF09"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "dlg__field" }, /* @__PURE__ */ React.createElement("label", null, "\u5C01\u9762"), /* @__PURE__ */ React.createElement("div", { className: "cover-pick" }, COVER_KEYS.map((k) => /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      key: k,
      className: cover === k ? "is-on" : "",
      onClick: () => setCover(k),
      title: COVER_NAMES[k],
      "aria-label": "\u5C01\u9762 " + COVER_NAMES[k]
    },
    /* @__PURE__ */ React.createElement("img", { src: COVER[k], alt: "" })
  )))), /* @__PURE__ */ React.createElement("div", { className: "dlg__foot" }, editing && /* @__PURE__ */ React.createElement("button", { type: "button", className: "dlg__del", onClick: remove }, confirmDel ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u5220\u9664" : "\u5220\u9664\u6B4C\u5355"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setListEditor(null) }, "\u518D\u60F3\u60F3"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn btn-primary btn-sm" }, /* @__PURE__ */ React.createElement(IconCheck, { size: 13 }), editing ? "\u4FDD\u5B58" : "\u5EFA\u597D\u4E86"))));
}
function AddToListPanel({ trackId, onDone }) {
  const { myLists, addToMyList, setListEditor, toast } = useApp();
  return /* @__PURE__ */ React.createElement("div", { className: "rowmenu__sub" }, /* @__PURE__ */ React.createElement("div", { className: "rowmenu__sub-title eyebrow" }, "\u52A0\u5165\u6211\u7684\u6B4C\u5355"), myLists.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "rowmenu__empty" }, "\u8FD8\u6CA1\u6709\u81EA\u5DF1\u5EFA\u8FC7\u6B4C\u5355"), myLists.map((l) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: l.id,
      className: "rowmenu__sublist",
      onClick: () => {
        addToMyList(l.id, trackId);
        toast(`\u5DF2\u52A0\u5165\u300C${l.name}\u300D`, { icon: "check" });
        onDone();
      }
    },
    /* @__PURE__ */ React.createElement("img", { className: "rowmenu__subart", src: COVER[l.cover] || COVER.amp, alt: "" }),
    /* @__PURE__ */ React.createElement("span", { className: "truncate" }, l.name),
    /* @__PURE__ */ React.createElement("span", { className: "num" }, l.tracks.length)
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "rowmenu__sublist rowmenu__sublist--new",
      onClick: () => {
        setListEditor({ mode: "new", tracks: [trackId] });
        onDone();
      }
    },
    /* @__PURE__ */ React.createElement(IconPlus, { size: 13 }),
    "\u65B0\u5EFA\u6B4C\u5355\u5E76\u52A0\u8FDB\u53BB"
  ));
}
Object.assign(window, { ListEditor, AddToListPanel, COVER_KEYS, COVER_NAMES });
