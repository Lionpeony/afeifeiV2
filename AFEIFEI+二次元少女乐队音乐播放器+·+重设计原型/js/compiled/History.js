const dayStart = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const dayLabel = (t) => {
  const today = dayStart(Date.now());
  const day = dayStart(t);
  const diff = Math.round((today - day) / 864e5);
  if (diff === 0) return "\u4ECA\u5929";
  if (diff === 1) return "\u6628\u5929";
  if (diff < 7) return ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"][new Date(t).getDay()];
  const d = new Date(t);
  return `${d.getMonth() + 1} \u6708 ${d.getDate()} \u65E5`;
};
const clockLabel = (t) => {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
function History() {
  const {
    history,
    clearHistory,
    plays,
    playAt,
    playAll,
    toast,
    setPage,
    currentId,
    playing
  } = useApp();
  const [confirmClear, setConfirmClear] = React.useState(false);
  const rows = history.map((h) => ({ ...h, track: TRACK_MAP[h.id] })).filter((r) => r.track);
  const groups = [];
  rows.forEach((r) => {
    const key = dayStart(r.at);
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(r);
    else groups.push({ key, label: dayLabel(r.at), items: [r] });
  });
  const totalPlays = rows.reduce((a, r) => a + (plays[r.id] || 1), 0);
  const todayCount = rows.filter((r) => dayStart(r.at) === dayStart(Date.now())).length;
  const ids = rows.map((r) => r.id);
  return /* @__PURE__ */ React.createElement("div", { className: "page", "data-screen-label": "\u64AD\u653E\u5386\u53F2" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 8 } }, "HISTORY \xB7 ", rows.length, " \u6761\u8BB0\u5F55"), /* @__PURE__ */ React.createElement("h1", { className: "display" }, "\u64AD\u653E\u5386\u53F2"), /* @__PURE__ */ React.createElement("p", { className: "body", style: { marginTop: 8, maxWidth: 460 } }, "\u542C\u8FC7\u4EC0\u4E48\uFF0C\u53F0\u4FA7\u90FD\u8BB0\u7740\u3002\u6309\u5929\u5206\u5806\uFF0C\u6700\u8FD1\u7684\u6392\u5728\u6700\u4E0A\u9762\u3002")), /* @__PURE__ */ React.createElement("div", { className: "page-head__aside" }, /* @__PURE__ */ React.createElement("div", { className: "row gap8" }, rows.length > 0 && /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => playAll(ids) }, /* @__PURE__ */ React.createElement(IconPlay, { size: 13 }), "\u4ECE\u6700\u8FD1\u5F00\u59CB\u653E"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn btn-sm " + (confirmClear ? "btn-primary" : "btn-ghost"),
      onClick: () => {
        if (!rows.length) {
          toast("\u8FD8\u6CA1\u6709\u8BB0\u5F55\u53EF\u4EE5\u6E05", { hand: true });
          return;
        }
        if (!confirmClear) {
          setConfirmClear(true);
          setTimeout(() => setConfirmClear(false), 3600);
          return;
        }
        clearHistory();
        setConfirmClear(false);
        toast("\u5386\u53F2\u6E05\u7A7A\u4E86\uFF0C\u6B4C\u5355\u4E0D\u53D7\u5F71\u54CD", { hand: true });
      }
    },
    confirmClear ? "\u786E\u8BA4\u6E05\u7A7A" : "\u6E05\u7A7A\u5386\u53F2"
  )))), /* @__PURE__ */ React.createElement("div", { className: "hist__stats" }, /* @__PURE__ */ React.createElement("div", { className: "hist__stat" }, /* @__PURE__ */ React.createElement("b", null, rows.length), /* @__PURE__ */ React.createElement("span", null, "\u6761\u64AD\u653E\u8BB0\u5F55")), /* @__PURE__ */ React.createElement("div", { className: "hist__stat" }, /* @__PURE__ */ React.createElement("b", null, todayCount), /* @__PURE__ */ React.createElement("span", null, "\u4ECA\u5929\u542C\u8FC7\u7684")), /* @__PURE__ */ React.createElement("div", { className: "hist__stat" }, /* @__PURE__ */ React.createElement("b", null, new Set(rows.map((r) => r.id)).size), /* @__PURE__ */ React.createElement("span", null, "\u9996\u4E0D\u540C\u7684\u6B4C")), /* @__PURE__ */ React.createElement("div", { className: "hist__stat" }, /* @__PURE__ */ React.createElement("b", null, totalPlays), /* @__PURE__ */ React.createElement("span", null, "\u7D2F\u8BA1\u64AD\u653E\u6B21\u6570"))), rows.length === 0 ? /* @__PURE__ */ React.createElement(
    EmptySetlist,
    {
      title: "\u8FD8\u6CA1\u6709\u4EBA\u5F00\u8FC7\u53E3\u3002",
      sub: "\u4ECE\u53D1\u73B0\u9875\u968F\u4FBF\u70B9\u4E00\u9996\uFF0C\u8FD9\u91CC\u5C31\u5F00\u59CB\u8BB0\u8D26\u4E86\u3002",
      cta: "\u53BB\u542C\u4E00\u9996",
      onGo: () => setPage("discover")
    }
  ) : groups.map((g) => /* @__PURE__ */ React.createElement("section", { className: "hist__group", key: g.key }, /* @__PURE__ */ React.createElement("div", { className: "hist__group-title" }, g.label, /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("span", { style: { letterSpacing: 0, textTransform: "none" } }, g.items.length, " \u6761")), g.items.map((r, i) => {
    const t = r.track;
    const isCur = currentId === t.id;
    const groupIds = g.items.map((x) => x.id);
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: r.at + t.id + i,
        className: "hist__row",
        onClick: () => playAt(groupIds, i),
        title: "\u518D\u542C\u4E00\u6B21 \xB7 " + t.title
      },
      /* @__PURE__ */ React.createElement("span", { className: "hist__time" }, clockLabel(r.at)),
      /* @__PURE__ */ React.createElement("img", { className: "hist__cover", src: t.cover, alt: "" }),
      /* @__PURE__ */ React.createElement("span", { className: "hist__name truncate", style: isCur ? { color: "var(--pink-700)", fontWeight: 600 } : void 0 }, t.title, isCur && playing && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, color: "var(--pink-600)" } }, "\xB7")),
      /* @__PURE__ */ React.createElement("span", { className: "hist__artist truncate" }, t.artist),
      /* @__PURE__ */ React.createElement("span", { className: "hist__count" }, plays[t.id] || 1, " \u6B21"),
      /* @__PURE__ */ React.createElement("span", { className: "hist__dur" }, fmt(t.dur))
    );
  }))));
}
Object.assign(window, { History, dayLabel });
