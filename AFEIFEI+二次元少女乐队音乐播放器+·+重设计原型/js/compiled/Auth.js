const FakeQR = ({ seed = "afeifei", size = 96 }) => {
  const n = 11;
  const h = hashStr(seed);
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const finder = x < 4 && y < 4 || x > n - 5 && y < 4 || x < 4 && y > n - 5;
      if (finder) continue;
      const bit = h >>> (x * 5 + y * 7) % 29 & 1;
      if (bit) cells.push([x, y]);
    }
  }
  const Finder = ({ fx, fy }) => /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement("rect", { x: fx, y: fy, width: "4", height: "4", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: fx + 1, y: fy + 1, width: "2", height: "2", fill: "#fff" }));
  return /* @__PURE__ */ React.createElement("svg", { className: "auth-src__qr", width: size, height: size, viewBox: "0 0 " + n + " " + n, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { width: n, height: n, fill: "#fff" }), /* @__PURE__ */ React.createElement("g", { fill: "#2E2028" }, cells.map(([x, y], i) => /* @__PURE__ */ React.createElement("rect", { key: i, x, y, width: "1", height: "1" })), /* @__PURE__ */ React.createElement(Finder, { fx: 0, fy: 0 }), /* @__PURE__ */ React.createElement(Finder, { fx: n - 4, fy: 0 }), /* @__PURE__ */ React.createElement(Finder, { fx: 0, fy: n - 4 })));
};
function Auth() {
  const { accounts, linkAccount, enterApp, skipLogin } = useApp();
  const linkedAny = Object.values(accounts).some(Boolean);
  return /* @__PURE__ */ React.createElement("div", { className: "auth", "data-screen-label": "\u5165\u573A\u767B\u8BB0" }, /* @__PURE__ */ React.createElement("span", { className: "auth__glow auth__glow--a" }), /* @__PURE__ */ React.createElement("span", { className: "auth__glow auth__glow--b" }), /* @__PURE__ */ React.createElement("div", { className: "auth__ticket" }, /* @__PURE__ */ React.createElement(Tape, { w: 96, rot: -2.2, style: { top: -13, left: "50%", marginLeft: -48 } }), /* @__PURE__ */ React.createElement("div", { className: "auth__top" }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow" }, "AFEIFEI \xB7 \u540E\u53F0\u5165\u53E3 \xB7 NO. 001"), /* @__PURE__ */ React.createElement("span", { className: "auth__no" }, "ADMIT ONE")), /* @__PURE__ */ React.createElement("h1", { className: "display auth__title" }, "\u4ECA\u665A\u7684\u6F14\u51FA", /* @__PURE__ */ React.createElement("br", null), "\u9700\u8981", /* @__PURE__ */ React.createElement("span", { className: "marker" }, "\u4F60\u7684\u95E8\u7968")), /* @__PURE__ */ React.createElement("p", { className: "body auth__lead" }, "\u8FD9\u4E2A\u64AD\u653E\u5668\u672C\u8EAB\u4E0D\u5E26\u97F3\u4E50\u3002\u767B\u8BB0\u4E00\u4E2A\u97F3\u6E90\u8D26\u53F7\uFF0C\u6B4C\u5355\u548C\u63A8\u8350\u624D\u4ECE\u4F60\u90A3\u8FB9\u53D6\u8FC7\u6765\u3002", /* @__PURE__ */ React.createElement("span", { className: "hand auth__lead-hand" }, "\uFF08\u539F\u578B\u91CC\u662F\u6A21\u62DF\u767B\u5F55\uFF0C\u70B9\u4E00\u4E0B\u5C31\u6210\uFF09")), /* @__PURE__ */ React.createElement("div", { className: "auth__sources" }, Object.values(SOURCES).map((src) => {
    const on = accounts[src.id];
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: src.id,
        className: "auth-src" + (on ? " is-linked" : ""),
        onClick: () => linkAccount(src.id),
        style: { "--src": src.tone }
      },
      /* @__PURE__ */ React.createElement("span", { className: "auth-src__bar", style: { background: src.tone } }),
      /* @__PURE__ */ React.createElement("span", { className: "auth-src__head" }, /* @__PURE__ */ React.createElement("span", { className: "auth-src__dot", style: { background: src.tone } }), /* @__PURE__ */ React.createElement("span", { className: "auth-src__name" }, src.name), /* @__PURE__ */ React.createElement("span", { className: "auth-src__state" }, on ? "\u5DF2\u767B\u8BB0" : "\u672A\u767B\u5F55")),
      /* @__PURE__ */ React.createElement("span", { className: "auth-src__body" }, /* @__PURE__ */ React.createElement(FakeQR, { seed: src.id + "afeifei", size: 94 }), /* @__PURE__ */ React.createElement("span", { className: "auth-src__meta" }, on ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "auth-src__account" }, src.account), /* @__PURE__ */ React.createElement("span", { className: "auth-src__line" }, "\u6B4C\u5355 5 \u4E2A \xB7 \u6BCF\u65E5\u63A8\u8350 33 \u9996"), /* @__PURE__ */ React.createElement("span", { className: "auth-src__ok" }, /* @__PURE__ */ React.createElement(IconCheck, { size: 13 }), " \u6570\u636E\u5DF2\u540C\u6B65")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "auth-src__line" }, "\u626B\u7801\u767B\u5F55 / \u8D26\u53F7\u5BC6\u7801"), /* @__PURE__ */ React.createElement("span", { className: "auth-src__hint hand" }, "\u70B9\u8FD9\u5F20\u5361 = \u6A21\u62DF\u767B\u5F55\u6210\u529F"))))
    );
  })), /* @__PURE__ */ React.createElement("div", { className: "auth__foot" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn btn-primary auth__enter",
      disabled: !linkedAny,
      onClick: enterApp
    },
    linkedAny ? "\u62C9\u5F00\u5E55\u5E03\uFF0C\u8FDB\u540E\u53F0" : "\u5148\u767B\u8BB0\u4E00\u4E2A\u8D26\u53F7",
    /* @__PURE__ */ React.createElement(IconArrowRight, { size: 15 })
  ), /* @__PURE__ */ React.createElement("button", { className: "auth__skip hand", onClick: skipLogin }, "\u5148\u968F\u4FBF\u901B\u901B\uFF08\u4E0D\u8981\u8D26\u53F7\uFF09")), /* @__PURE__ */ React.createElement("span", { className: "auth__fine" }, "\u6240\u6709\u66F2\u76EE\u3001\u6B4C\u5355\u3001\u699C\u5355\u5747\u4E3A\u865A\u6784\u6F14\u793A\u6570\u636E \xB7 \u4E0D\u8FDE\u63A5\u771F\u5B9E\u97F3\u4E50\u5E73\u53F0")));
}
Object.assign(window, { Auth, FakeQR });
