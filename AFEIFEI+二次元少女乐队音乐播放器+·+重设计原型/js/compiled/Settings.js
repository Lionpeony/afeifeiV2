function Settings() {
  const {
    themePref,
    setThemePref,
    palette,
    setPalette,
    unlocked,
    eggs,
    sfx,
    setSfx,
    motion,
    setMotion,
    systemReduce,
    volume,
    setVolume,
    tryCode,
    codeFocus,
    setCodeFocus,
    toast,
    setDemoOpen,
    accounts,
    linkAccount,
    unlinkAccount,
    source,
    setSource,
    switchSource,
    openScan,
    density,
    setDensity,
    studio,
    setStudio,
    sleep,
    showTr,
    setShowTr,
    history,
    setPage,
    quality,
    sleepLeft,
    setKeysOpen
  } = useApp();
  const codeRef = React.useRef(null);
  const [code, setCode] = React.useState("");
  React.useEffect(() => {
    if (codeFocus && codeRef.current) {
      codeRef.current.focus();
      setCodeFocus(false);
    }
  }, [codeFocus, setCodeFocus]);
  const themeOptions = [
    { id: "light", label: "\u660E\u4EAE" },
    { id: "dark", label: "\u7184\u706F" },
    { id: "system", label: "\u8DDF\u968F\u7CFB\u7EDF" }
  ];
  return /* @__PURE__ */ React.createElement("div", { className: "page", "data-screen-label": "\u8BBE\u7F6E", style: { animation: "fadeUp .35s var(--ease) both", maxWidth: 1080 } }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 10 } }, "\u8BBE\u7F6E \xB7 \u540E\u53F0\u7684\u62BD\u5C49"), /* @__PURE__ */ React.createElement("h1", { className: "display" }, "\u8FD9\u91CC\u7684\u4E1C\u897F\u53EF\u4EE5\u968F\u4FBF", /* @__PURE__ */ React.createElement("span", { className: "marker" }, "\u7FFB")), /* @__PURE__ */ React.createElement("p", { className: "body", style: { marginTop: 10, maxWidth: 460 } }, "\u706F\u5149\u3001\u97F3\u91CF\uFF0C\u8FD8\u6709\u4E00\u5F20\u96C6\u7AE0\u5361\u3002\u6162\u6162\u6765\uFF0C\u4E0D\u7740\u6025\u3002"))), /* @__PURE__ */ React.createElement("div", { className: "set-card set-card--wide acct-card", style: { marginBottom: 18 } }, /* @__PURE__ */ React.createElement(SourceSwap, null), /* @__PURE__ */ React.createElement("div", { className: "set-card__head" }, /* @__PURE__ */ React.createElement(IconCloud, { size: 17 }), /* @__PURE__ */ React.createElement("h2", { className: "h2" }, "\u97F3\u6E90\u8D26\u53F7"), /* @__PURE__ */ React.createElement("span", { className: "acct-head-note hand" }, "\u6362\u53F0\u4F1A\u62C9\u4E00\u6B21\u5E55\u5E03")), /* @__PURE__ */ React.createElement("p", { className: "set-card__desc" }, "\u64AD\u653E\u5668\u672C\u8EAB\u4E0D\u5E26\u97F3\u4E50\u3002\u4E24\u4E2A\u8D26\u53F7\u767B\u5F55\u4E4B\u540E\uFF0C\u6B4C\u5355\u3001\u6BCF\u65E5\u63A8\u8350\u548C\u699C\u5355\u624D\u4ECE\u4F60\u90A3\u8FB9\u540C\u6B65\u8FC7\u6765\u3002"), /* @__PURE__ */ React.createElement("div", { className: "acct-list" }, Object.values(SOURCES).map((s) => {
    const on = accounts[s.id];
    const cur = on && source === s.id;
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: s.id,
        className: "acct-row" + (on ? " is-on" : " is-empty") + (cur ? " is-cur" : ""),
        style: { "--tone": s.tone }
      },
      /* @__PURE__ */ React.createElement("span", { className: "acct-tile" }, on ? /* @__PURE__ */ React.createElement("span", { className: "acct-initial" }, s.short.slice(0, 1)) : /* @__PURE__ */ React.createElement(IconQR, { size: 16 })),
      on ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "acct-body" }, /* @__PURE__ */ React.createElement("span", { className: "acct-line1" }, /* @__PURE__ */ React.createElement("b", null, s.name), cur && /* @__PURE__ */ React.createElement("span", { className: "acct-cur" }, /* @__PURE__ */ React.createElement(IconPick, { size: 10 }), "\u5F53\u524D\u97F3\u6E90")), /* @__PURE__ */ React.createElement("span", { className: "acct-state" }, "\u5DF2\u767B\u5F55 \xB7 ", s.account)), /* @__PURE__ */ React.createElement("span", { className: "acct-acts" }, !cur && /* @__PURE__ */ React.createElement("button", { className: "btn btn-soft btn-sm", onClick: () => switchSource(s.id) }, /* @__PURE__ */ React.createElement(IconSwap, { size: 12 }), "\u6362\u5230\u8FD9\u8FB9"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => unlinkAccount(s.id) }, "\u9000\u51FA"))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "acct-body" }, /* @__PURE__ */ React.createElement("span", { className: "acct-line1" }, /* @__PURE__ */ React.createElement("b", null, s.name), /* @__PURE__ */ React.createElement("span", { className: "acct-empty-tag" }, "\u7A7A\u5361\u4F4D")), /* @__PURE__ */ React.createElement("span", { className: "acct-state hand" }, "\u8FD8\u6CA1\u767B\u8BB0\uFF0C\u626B\u4E00\u4E0B\u5C31\u6210")), /* @__PURE__ */ React.createElement("span", { className: "acct-acts" }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: () => openScan(s.id) }, /* @__PURE__ */ React.createElement(IconQR, { size: 12 }), "\u626B\u7801\u767B\u5F55")))
    );
  })), /* @__PURE__ */ React.createElement("div", { className: "acct-note hand" }, Object.values(accounts).every((v) => !v) ? "\u4E24\u4E2A\u5361\u4F4D\u90FD\u7A7A\u7740 \xB7 \u626B\u4E00\u5F20\u4F1A\u5458\u7968\u5C31\u80FD\u5F00\u59CB\u542C" : "\u539F\u578B\u5185\u7684\u767B\u5F55\u662F\u6A21\u62DF\u7684\uFF0C\u4E0D\u4F1A\u771F\u7684\u8FDE\u5230\u5E73\u53F0\uFF0C\u4E5F\u4E0D\u4F1A\u62FF\u5230\u4EFB\u4F55\u771F\u5B9E\u6570\u636E\u3002")), /* @__PURE__ */ React.createElement("div", { className: "settings-grid" }, /* @__PURE__ */ React.createElement("div", { className: "set-card" }, /* @__PURE__ */ React.createElement("div", { className: "set-card__head" }, /* @__PURE__ */ React.createElement(IconSun, { size: 17 }), /* @__PURE__ */ React.createElement("h2", { className: "h2" }, "\u540E\u53F0\u5149\u7EBF")), /* @__PURE__ */ React.createElement("p", { className: "set-card__desc" }, "\u767D\u5929\u662F\u5976\u6CB9\u8272\u7684\u6392\u7EC3\u5BA4\uFF0C\u665A\u4E0A\u5C31\u7184\u706F\uFF0C\u7559\u4E00\u76CF\u97F3\u7BB1\u7684\u6307\u793A\u706F\u3002"), /* @__PURE__ */ React.createElement("div", { className: "segmented", role: "group", "aria-label": "\u4E3B\u9898" }, themeOptions.map((o) => /* @__PURE__ */ React.createElement("button", { key: o.id, className: themePref === o.id ? "is-on" : "", onClick: () => setThemePref(o.id) }, o.label))), /* @__PURE__ */ React.createElement("div", { className: "set-line", style: { marginTop: 6 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "set-line__label" }, "\u9650\u5B9A\u8272\u8C03"), /* @__PURE__ */ React.createElement("div", { className: "set-line__hint" }, "\u6709\u4E9B\u989C\u8272\u8981\u81EA\u5DF1\u627E\u51FA\u6765\u3002"))), /* @__PURE__ */ React.createElement("div", { className: "palette-row" }, PALETTES.map((p) => {
    const isUnlocked = !p.locked || unlocked.includes(p.id);
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: p.id,
        className: "palette-chip" + (palette === p.id ? " is-on" : "") + (isUnlocked ? "" : " is-locked"),
        onClick: () => {
          if (!isUnlocked) {
            toast("\u8FD9\u4E2A\u8FD8\u9501\u7740\u3002", { hand: true });
            return;
          }
          setPalette(p.id);
        }
      },
      /* @__PURE__ */ React.createElement("span", { className: "palette-chip__dot", style: { background: isUnlocked ? p.dot : "var(--line-strong)" } }),
      isUnlocked ? p.label : "???"
    );
  }))), /* @__PURE__ */ React.createElement("div", { className: "set-card" }, /* @__PURE__ */ React.createElement("div", { className: "set-card__head" }, /* @__PURE__ */ React.createElement(IconVolume, { size: 17 }), /* @__PURE__ */ React.createElement("h2", { className: "h2" }, "\u58F0\u97F3\u4E0E\u52A8\u6548")), /* @__PURE__ */ React.createElement("p", { className: "set-card__desc" }, "\u4EA4\u4E92\u97F3\u6548\u6BD4\u6B63\u5728\u653E\u7684\u6B4C\u4F4E\uFF0C\u4E0D\u4F1A\u62A2\u62CD\u5B50\u3002\u5ACC\u5435\u5C31\u5173\u6389\u3002"), /* @__PURE__ */ React.createElement("div", { className: "set-line" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "set-line__label" }, "\u4EA4\u4E92\u97F3\u6548"), /* @__PURE__ */ React.createElement("div", { className: "set-line__hint" }, "\u62E8\u5F26\u3001\u7EB8\u9875\u3001\u6E05\u8106\u7684\u53EE\u3002")), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "switch" + (sfx ? " is-on" : ""),
      onClick: () => setSfx((v) => !v),
      "aria-label": "\u4EA4\u4E92\u97F3\u6548\u5F00\u5173",
      "aria-pressed": sfx
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "set-line" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "set-line__label" }, "\u52A8\u6548\u6863\u4F4D"), /* @__PURE__ */ React.createElement("div", { className: "set-line__hint" }, systemReduce ? "\u7CFB\u7EDF\u5DF2\u5F00\u542F\u51CF\u5F31\u52A8\u6548\uFF0C\u88C5\u9970\u52A8\u753B\u5DF2\u6682\u505C\u3002" : "\u5B8C\u6574\u542B\u547C\u5438\u4E0E\u5E55\u5E03\uFF0C\u8F7B\u6863\u53EA\u7559\u72B6\u6001\u5207\u6362\u3002")), /* @__PURE__ */ React.createElement("div", { className: "segmented", role: "group", "aria-label": "\u52A8\u6548\u6863\u4F4D" }, /* @__PURE__ */ React.createElement("button", { className: motion === "full" ? "is-on" : "", onClick: () => setMotion("full") }, "\u5B8C\u6574"), /* @__PURE__ */ React.createElement("button", { className: motion === "lite" ? "is-on" : "", onClick: () => setMotion("lite") }, "\u8F7B"), /* @__PURE__ */ React.createElement("button", { className: motion === "off" ? "is-on" : "", onClick: () => setMotion("off") }, "\u5173\u95ED"))), /* @__PURE__ */ React.createElement("div", { className: "set-line" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "set-line__label" }, "\u66F2\u76EE\u8868\u5BC6\u5EA6"), /* @__PURE__ */ React.createElement("div", { className: "set-line__hint" }, density === "compact" ? "\u7D27\u51D1 40px \xB7 \u957F\u961F\u5217\u4E00\u5C4F\u80FD\u591A\u770B\u4E09\u9996\u3002" : "\u8212\u9002 48px \xB7 \u9ED8\u8BA4\u884C\u9AD8\uFF0C\u770B\u5F97\u6E05\u4E5F\u70B9\u5F97\u51C6\u3002")), /* @__PURE__ */ React.createElement("div", { className: "density-row", role: "group", "aria-label": "\u66F2\u76EE\u8868\u5BC6\u5EA6" }, /* @__PURE__ */ React.createElement("button", { className: density === "cozy" ? "is-on" : "", onClick: () => setDensity("cozy") }, "\u8212\u9002"), /* @__PURE__ */ React.createElement("button", { className: density === "compact" ? "is-on" : "", onClick: () => setDensity("compact") }, "\u7D27\u51D1"))), /* @__PURE__ */ React.createElement("div", { className: "set-line" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "set-line__label" }, "\u97F3\u91CF"), /* @__PURE__ */ React.createElement("div", { className: "set-line__hint" }, Math.round(volume * 100), "% \xB7 \u53F0\u4FA7\u542C\u5F97\u89C1\u5C31\u884C")), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "range",
      min: "0",
      max: "100",
      value: Math.round(volume * 100),
      onChange: (e) => setVolume(Number(e.target.value) / 100),
      style: { width: 120, accentColor: "var(--pink-600)" },
      "aria-label": "\u97F3\u91CF"
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "set-card" }, /* @__PURE__ */ React.createElement("div", { className: "set-card__head" }, /* @__PURE__ */ React.createElement(IconSettings, { size: 17 }), /* @__PURE__ */ React.createElement("h2", { className: "h2" }, "\u53F0\u4FA7\u5DE5\u5177")), /* @__PURE__ */ React.createElement("p", { className: "set-card__desc" }, "\u5B9A\u65F6\u3001\u97F3\u8D28\u3001\u5747\u8861\u5668\uFF0C\u90FD\u5728\u6392\u7EC3\u5BA4\u90A3\u4E2A\u62BD\u5C49\u91CC\u3002"), /* @__PURE__ */ React.createElement("div", { className: "set-entries" }, /* @__PURE__ */ React.createElement("button", { className: "set-entry", onClick: () => setStudio({ tab: "sleep" }) }, /* @__PURE__ */ React.createElement("span", { className: "set-entry__ico" }, /* @__PURE__ */ React.createElement(IconMoon, { size: 15 })), /* @__PURE__ */ React.createElement("span", { className: "set-entry__text" }, /* @__PURE__ */ React.createElement("b", null, "\u5B9A\u65F6\u5173\u95ED"), /* @__PURE__ */ React.createElement("span", null, sleep.mode === "off" ? "\u6CA1\u6709\u5728\u5012\u8BA1\u65F6" : sleep.mode === "song" ? "\u64AD\u5B8C\u8FD9\u9996\u5C31\u5173" : "\u8FD8\u5269 " + Math.floor(sleepLeft / 60) + " \u5206 " + sleepLeft % 60 + " \u79D2"))), /* @__PURE__ */ React.createElement("button", { className: "set-entry", onClick: () => setStudio({ tab: "quality" }) }, /* @__PURE__ */ React.createElement("span", { className: "set-entry__ico" }, /* @__PURE__ */ React.createElement(IconCloud, { size: 15 })), /* @__PURE__ */ React.createElement("span", { className: "set-entry__text" }, /* @__PURE__ */ React.createElement("b", null, "\u64AD\u653E\u97F3\u8D28"), /* @__PURE__ */ React.createElement("span", null, { standard: "\u6807\u51C6 128k", hq: "HQ 320k", lossless: "SQ \u65E0\u635F", hires: "Hi-Res 24bit" }[quality]))), /* @__PURE__ */ React.createElement("button", { className: "set-entry", onClick: () => setStudio({ tab: "eq" }) }, /* @__PURE__ */ React.createElement("span", { className: "set-entry__ico" }, /* @__PURE__ */ React.createElement(IconVolume, { size: 15 })), /* @__PURE__ */ React.createElement("span", { className: "set-entry__text" }, /* @__PURE__ */ React.createElement("b", null, "\u6392\u7EC3\u5BA4\u5747\u8861\u5668"), /* @__PURE__ */ React.createElement("span", null, "\u4E94\u6BB5\u63A8\u5B50 \xB7 \u4E94\u4E2A\u9884\u8BBE"))), /* @__PURE__ */ React.createElement("button", { className: "set-entry", onClick: () => setKeysOpen(true) }, /* @__PURE__ */ React.createElement("span", { className: "set-entry__ico" }, /* @__PURE__ */ React.createElement(IconQueue, { size: 15 })), /* @__PURE__ */ React.createElement("span", { className: "set-entry__text" }, /* @__PURE__ */ React.createElement("b", null, "\u952E\u76D8\u5FEB\u6377\u952E"), /* @__PURE__ */ React.createElement("span", null, "\u6309 ? \u968F\u65F6\u770B\u6E05\u5355")))), /* @__PURE__ */ React.createElement("div", { className: "set-line", style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "set-line__label" }, "\u6B4C\u8BCD\u8BD1\u6587"), /* @__PURE__ */ React.createElement("div", { className: "set-line__hint" }, "\u9010\u884C\u6B4C\u8BCD\u4E0B\u9762\u8DDF\u4E00\u884C\u82F1\u6587\u7FFB\u8BD1\u3002")), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "switch" + (showTr ? " is-on" : ""),
      onClick: () => setShowTr((v) => !v),
      "aria-label": "\u6B4C\u8BCD\u8BD1\u6587\u5F00\u5173",
      "aria-pressed": showTr
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "set-line" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "set-line__label" }, "\u64AD\u653E\u5386\u53F2"), /* @__PURE__ */ React.createElement("div", { className: "set-line__hint" }, history.length, " \u6761\u8BB0\u5F55 \xB7 \u53EA\u5B58\u5728\u672C\u5730")), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => setPage("history") }, /* @__PURE__ */ React.createElement(IconArchive, { size: 13 }), "\u53BB\u770B\u770B"))), /* @__PURE__ */ React.createElement("div", { className: "set-card set-card--wide" }, /* @__PURE__ */ React.createElement("div", { className: "row", style: { alignItems: "flex-start", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "set-card__head" }, /* @__PURE__ */ React.createElement(IconPick, { size: 17 }), /* @__PURE__ */ React.createElement("h2", { className: "h2" }, "\u5B89\u53EF\u96C6\u7AE0\u5361")), /* @__PURE__ */ React.createElement("p", { className: "set-card__desc", style: { marginBottom: 12 } }, "\u6BCF\u53D1\u73B0\u4E00\u4E2A\u5C0F\u5F69\u86CB\uFF0C\u8FD9\u91CC\u5C31\u76D6\u4E00\u679A\u62E8\u7247\u3002\u76D6\u6EE1\u4F1A\u600E\u6837\uFF0C\u6211\u4E5F\u4E0D\u77E5\u9053\u3002")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { className: "stamp-progress" }, eggs.length, " / 17"), /* @__PURE__ */ React.createElement("div", { className: "meta", style: { marginTop: 2 } }, "\u5DF2\u76D6 ", eggs.length, " \u679A"))), /* @__PURE__ */ React.createElement("div", { className: "stamp-bar" }, /* @__PURE__ */ React.createElement("i", { style: { width: eggs.length / 17 * 100 + "%" } })), /* @__PURE__ */ React.createElement("div", { className: "stamp-grid" }, EGGS.map((e) => {
    const found = eggs.includes(e.id);
    return /* @__PURE__ */ React.createElement("div", { key: e.id, className: "stamp-cell" + (found ? " is-found" : ""), title: found ? e.name : "\u8FD8\u6CA1\u627E\u5230" }, found ? /* @__PURE__ */ React.createElement("span", { className: "stamp-cell__pick" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 40 40", width: "30", height: "30", fill: "currentColor", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M20 4c6.6 0 13 5.4 13 12 0 7.6-7 14-11 17.4-1.1 1-2.9 1-4 0C14 30 7 23.6 7 16 7 9.4 13.4 4 20 4z", opacity: ".16" }), /* @__PURE__ */ React.createElement("path", { d: "M20 4c6.6 0 13 5.4 13 12 0 7.6-7 14-11 17.4-1.1 1-2.9 1-4 0C14 30 7 23.6 7 16 7 9.4 13.4 4 20 4z", fill: "none", stroke: "currentColor", strokeWidth: "1.3" })), /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--coral)" } }, e.id.slice(1))) : /* @__PURE__ */ React.createElement("span", null, "??"), /* @__PURE__ */ React.createElement("span", { className: "stamp-cell__name" }, found ? e.name : ""));
  })), /* @__PURE__ */ React.createElement("div", { className: "stamp-foot" }, /* @__PURE__ */ React.createElement("span", { className: "hand", style: { fontSize: 11.5, color: "var(--text-3)" } }, "\u4E0D\u5199\u89E6\u53D1\u65B9\u5F0F\uFF0C\u7559\u7740\u81EA\u5DF1\u649E\u3002"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => setDemoOpen(true) }, "\u539F\u578B\u6F14\u793A \xB7 \u5168\u90E8\u5F69\u86CB"))), /* @__PURE__ */ React.createElement("div", { className: "set-card" }, /* @__PURE__ */ React.createElement("div", { className: "set-card__head" }, /* @__PURE__ */ React.createElement(IconSearch, { size: 17 }), /* @__PURE__ */ React.createElement("h2", { className: "h2" }, "\u79D8\u5BC6 setlist")), /* @__PURE__ */ React.createElement("p", { className: "set-card__desc" }, "\u6709\u4E9B\u8BCD\u4E0D\u7528\u6765\u641C\u6B4C\u3002\u5728\u641C\u7D22\u6846\u91CC\u6572\u8FDB\u53BB\uFF0C\u56DE\u8F66\u3002"), /* @__PURE__ */ React.createElement("div", { className: "code-box" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      ref: codeRef,
      value: code,
      onChange: (e) => setCode(e.target.value),
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          if (tryCode(code)) setCode("");
          else toast("\u4ECA\u665A\u6CA1\u6709\u8FD9\u5F20 setlist\u3002", { hand: true });
        }
      },
      placeholder: "\u8F93\u5165\u6697\u53F7\u2026",
      "aria-label": "\u8F93\u5165\u6697\u53F7"
    }
  ), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: () => {
    if (tryCode(code)) setCode("");
    else {
      if (window.Sound) Sound.tap();
      toast("\u4ECA\u665A\u6CA1\u6709\u8FD9\u5F20 setlist\u3002", { hand: true });
    }
  } }, "\u786E\u8BA4")), /* @__PURE__ */ React.createElement("div", { className: "row gap8", style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement(IconPick, { size: 12, style: { color: "var(--coral)", opacity: 0.7 } }), /* @__PURE__ */ React.createElement("span", { className: "meta" }, "\u89E3\u9501\u7684\u8272\u8C03\u4F1A\u7559\u5728\u4E0A\u9762\u7684\u300C\u9650\u5B9A\u8272\u8C03\u300D\u91CC\u3002"))), /* @__PURE__ */ React.createElement("div", { className: "set-card" }, /* @__PURE__ */ React.createElement("div", { className: "set-card__head" }, /* @__PURE__ */ React.createElement(IconNote, { size: 17 }), /* @__PURE__ */ React.createElement("h2", { className: "h2" }, "\u5173\u4E8E\u8FD9\u53F0\u64AD\u653E\u5668")), /* @__PURE__ */ React.createElement("p", { className: "set-card__desc", style: { marginBottom: 10 } }, "AFEIFEI \u662F\u4E00\u95F4\u753B\u51FA\u6765\u7684\u540E\u53F0\u3002\u4E09\u4E2A\u4E50\u961F\u7684\u6C14\u8D28\u53EA\u4F5C\u4E3A\u6C1B\u56F4\u4E0E\u5F69\u86CB\u51FA\u73B0\u3002"), /* @__PURE__ */ React.createElement("div", { className: "col gap6" }, ["\u4E0D\u51FA\u73B0\u89D2\u8272\u8138\uFF0C\u53EA\u7559 Q \u7248\u526A\u5F71\u4E0E\u80CC\u5F71", "\u4E0D\u8D34\u5B98\u65B9 Logo\u3001\u6D77\u62A5\u4E0E\u622A\u56FE", "\u4E0D\u5F15\u7528\u539F\u4F5C\u53F0\u8BCD\uFF0C\u66F2\u540D\u5747\u4E3A\u539F\u521B", "\u5F69\u86CB\u4E0D\u963B\u585E\u64AD\u653E\uFF0C\u968F\u65F6\u53EF\u4EE5\u8D70\u5F00"].map((txt) => /* @__PURE__ */ React.createElement("div", { key: txt, className: "row gap8" }, /* @__PURE__ */ React.createElement(IconCheck, { size: 12, style: { color: "var(--pink-600)", flex: "none" } }), /* @__PURE__ */ React.createElement("span", { className: "meta", style: { color: "var(--text-2)" } }, txt)))))), /* @__PURE__ */ React.createElement("div", { className: "demo-foot" }, /* @__PURE__ */ React.createElement("span", { className: "meta" }, "\u6240\u6709\u4E50\u961F\u3001\u66F2\u76EE\u3001\u6D77\u62A5\u5747\u4E3A\u539F\u521B\u865A\u6784\u5185\u5BB9\u3002"), /* @__PURE__ */ React.createElement("div", { className: "row gap16" }, /* @__PURE__ */ React.createElement("button", { className: "demo-link", onClick: () => setDemoOpen(true) }, "\u539F\u578B\u6F14\u793A \xB7 \u5F69\u86CB\u4E0E\u51B7\u5374"), /* @__PURE__ */ React.createElement("button", { className: "demo-link", onClick: () => {
    Object.keys(localStorage).filter((k) => k.startsWith("afeifei.")).forEach((k) => localStorage.removeItem(k));
    location.reload();
  } }, "\u6E05\u7A7A\u672C\u5730\u8BB0\u5F55"))));
}
Object.assign(window, { Settings });
