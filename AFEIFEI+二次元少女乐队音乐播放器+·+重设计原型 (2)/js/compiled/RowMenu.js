function RowMenu() {
  const {
    rowMenu,
    closeRowMenu,
    source,
    accounts,
    liked,
    toggleLike,
    tryPlay,
    playNext,
    addDownload,
    toast,
    onoma,
    setPage,
    openPlayer
  } = useApp();
  const [sub, setSub] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    setSub(false);
  }, [rowMenu && rowMenu.trackId]);
  React.useEffect(() => {
    const fn = (e) => {
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
  const Item = ({ icon: Ico, children, onClick, danger, hint }) => /* @__PURE__ */ React.createElement("button", { className: "rowmenu__item" + (danger ? " is-danger" : ""), onClick, title: hint }, /* @__PURE__ */ React.createElement("span", { className: "rowmenu__ico" }, /* @__PURE__ */ React.createElement(Ico, { size: 15 })), /* @__PURE__ */ React.createElement("span", { className: "rowmenu__label" }, children), hint && /* @__PURE__ */ React.createElement("span", { className: "rowmenu__hint" }, hint));
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "rowmenu",
      ref,
      style: { left: rowMenu.x, top: rowMenu.y },
      role: "menu",
      "aria-label": t.title + " \u7684\u64CD\u4F5C\u83DC\u5355"
    },
    /* @__PURE__ */ React.createElement("div", { className: "rowmenu__head" }, /* @__PURE__ */ React.createElement("img", { src: t.cover, alt: "" }), /* @__PURE__ */ React.createElement("span", { className: "rowmenu__headtext" }, /* @__PURE__ */ React.createElement("b", { className: "truncate" }, t.title), /* @__PURE__ */ React.createElement("span", { className: "meta truncate" }, t.artist))),
    /* @__PURE__ */ React.createElement("div", { className: "rowmenu__group" }, /* @__PURE__ */ React.createElement(Item, { icon: IconPlay, onClick: () => {
      tryPlay(t.id);
      closeRowMenu();
    } }, "\u7ACB\u5373\u64AD\u653E"), /* @__PURE__ */ React.createElement(Item, { icon: IconQueue, onClick: () => {
      playNext(t.id);
      closeRowMenu();
    } }, "\u4E0B\u4E00\u9996\u64AD\u653E")),
    /* @__PURE__ */ React.createElement("div", { className: "rowmenu__group" }, /* @__PURE__ */ React.createElement(Item, { icon: isOn ? IconHeartFill : IconHeart, onClick: () => {
      toggleLike(t.id);
      onoma("\u30DD\u30F3\u30C3", { tone: "coral", x: rowMenu.x + 120, y: rowMenu.y + 60 });
    } }, isOn ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF\u5230\u6211\u559C\u6B22\u7684\u97F3\u4E50"), /* @__PURE__ */ React.createElement(Item, { icon: IconPlus, onClick: () => setSub((s) => !s), hint: sub ? "\u6536\u8D77" : "\u9009\u62E9" }, "\u6536\u85CF\u5230\u6B4C\u5355"), /* @__PURE__ */ React.createElement(Item, { icon: IconDownload, onClick: () => {
      addDownload(t.id);
      closeRowMenu();
    } }, "\u4E0B\u8F7D\u5230\u672C\u5730")),
    /* @__PURE__ */ React.createElement("div", { className: "rowmenu__group" }, /* @__PURE__ */ React.createElement(Item, { icon: IconDisc, onClick: () => {
      toast(`\u300A${t.album}\u300B\u7684\u4E13\u8F91\u9875\u5728\u539F\u578B\u91CC\u662F\u5360\u4F4D`, { hand: true });
      closeRowMenu();
    } }, "\u67E5\u770B\u4E13\u8F91"), /* @__PURE__ */ React.createElement(Item, { icon: IconUser, onClick: () => {
      toast(`${t.artist} \u7684\u827A\u4EBA\u9875\u5728\u539F\u578B\u91CC\u662F\u5360\u4F4D`, { hand: true });
      closeRowMenu();
    } }, "\u67E5\u770B\u827A\u4EBA")),
    sub && /* @__PURE__ */ React.createElement(AddToListPanel, { trackId: t.id, onDone: closeRowMenu })
  );
}
Object.assign(window, { RowMenu });
