/* ---------- 设置 ---------- */
function Settings() {
  const {
    themePref, setThemePref, palette, setPalette, unlocked, eggs, sfx, setSfx, motion, setMotion, systemReduce,
    volume, setVolume, tryCode, codeFocus, setCodeFocus, toast, setDemoOpen,
    accounts, linkAccount, unlinkAccount, source, setSource, density, setDensity
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
    { id: "light", label: "明亮" },
    { id: "dark", label: "熄灯" },
    { id: "system", label: "跟随系统" }
  ];

  return (
    <div className="page" data-screen-label="设置" style={{ animation: "fadeUp .35s var(--ease) both", maxWidth: 1080 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>设置 · 后台的抽屉</div>
          <h1 className="display">这里的东西可以随便<span className="marker">翻</span></h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 460 }}>
            灯光、音量，还有一张集章卡。慢慢来，不着急。
          </p>
        </div>
      </div>

      <div className="set-card set-card--wide" style={{ marginBottom: 18 }}>
        <div className="set-card__head"><IconCloud size={17} /><h2 className="h2">音源账号</h2></div>
        <p className="set-card__desc">
          播放器本身不带音乐。两个账号登录之后，歌单、每日推荐和榜单才从你那边同步过来。
        </p>
        <div className="acct-list">
          {Object.values(SOURCES).map(s => {
            const on = accounts[s.id];
            return (
              <div key={s.id} className={"acct-row" + (on ? " is-on" : "")}>
                <span className="acct-dot" style={{ background: s.tone }}></span>
                <span className="acct-name">{s.name}</span>
                <span className="acct-state">{on ? "已登录 · " + s.account : "未登录"}</span>
                {on && source === s.id && <span className="acct-cur">当前音源</span>}
                <button className="acct-btn" onClick={() => setSource(s.id)}>切到这个音源</button>
                <button className={"btn btn-sm " + (on ? "btn-ghost" : "btn-primary")}
                  onClick={() => on ? unlinkAccount(s.id) : linkAccount(s.id)}>
                  {on ? "退出登录" : "去登录"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="acct-note hand">原型内的登录是模拟的，不会真的连到平台，也不会拿到任何真实数据。</div>
      </div>

      <div className="settings-grid">
        <div className="set-card">
          <div className="set-card__head"><IconSun size={17} /><h2 className="h2">后台光线</h2></div>
          <p className="set-card__desc">白天是奶油色的排练室，晚上就熄灯，留一盏音箱的指示灯。</p>
          <div className="segmented" role="group" aria-label="主题">
            {themeOptions.map(o => (
              <button key={o.id} className={themePref === o.id ? "is-on" : ""} onClick={() => setThemePref(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="set-line" style={{ marginTop: 6 }}>
            <div>
              <div className="set-line__label">限定色调</div>
              <div className="set-line__hint">有些颜色要自己找出来。</div>
            </div>
          </div>
          <div className="palette-row">
            {PALETTES.map(p => {
              const isUnlocked = !p.locked || unlocked.includes(p.id);
              return (
                <button key={p.id}
                  className={"palette-chip" + (palette === p.id ? " is-on" : "") + (isUnlocked ? "" : " is-locked")}
                  onClick={() => {
                    if (!isUnlocked) { toast("这个还锁着。", { hand: true }); return; }
                    setPalette(p.id);
                  }}>
                  <span className="palette-chip__dot" style={{ background: isUnlocked ? p.dot : "var(--line-strong)" }}></span>
                  {isUnlocked ? p.label : "???"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="set-card">
          <div className="set-card__head"><IconVolume size={17} /><h2 className="h2">声音与动效</h2></div>
          <p className="set-card__desc">交互音效比正在放的歌低，不会抢拍子。嫌吵就关掉。</p>
          <div className="set-line">
            <div>
              <div className="set-line__label">交互音效</div>
              <div className="set-line__hint">拨弦、纸页、清脆的叮。</div>
            </div>
            <button className={"switch" + (sfx ? " is-on" : "")} onClick={() => setSfx(v => !v)}
              aria-label="交互音效开关" aria-pressed={sfx}></button>
          </div>
          <div className="set-line">
            <div>
              <div className="set-line__label">动效档位</div>
              <div className="set-line__hint">
                {systemReduce ? "系统已开启减弱动效，装饰动画已暂停。" : "完整含呼吸与幕布，轻档只留状态切换。"}
              </div>
            </div>
            <div className="segmented" role="group" aria-label="动效档位">
              <button className={motion === "full" ? "is-on" : ""} onClick={() => setMotion("full")}>完整</button>
              <button className={motion === "lite" ? "is-on" : ""} onClick={() => setMotion("lite")}>轻</button>
              <button className={motion === "off" ? "is-on" : ""} onClick={() => setMotion("off")}>关闭</button>
            </div>
          </div>
          <div className="set-line">
            <div>
              <div className="set-line__label">曲目表密度</div>
              <div className="set-line__hint">
                {density === "compact" ? "紧凑 40px · 长队列一屏能多看三首。" : "舒适 48px · 默认行高，看得清也点得准。"}
              </div>
            </div>
            <div className="density-row" role="group" aria-label="曲目表密度">
              <button className={density === "cozy" ? "is-on" : ""} onClick={() => setDensity("cozy")}>舒适</button>
              <button className={density === "compact" ? "is-on" : ""} onClick={() => setDensity("compact")}>紧凑</button>
            </div>
          </div>
          <div className="set-line">
            <div>
              <div className="set-line__label">音量</div>
              <div className="set-line__hint">{Math.round(volume * 100)}% · 台侧听得见就行</div>
            </div>
            <input type="range" min="0" max="100" value={Math.round(volume * 100)}
              onChange={e => setVolume(Number(e.target.value) / 100)}
              style={{ width: 120, accentColor: "var(--pink-600)" }} aria-label="音量" />
          </div>
        </div>

        <div className="set-card set-card--wide">
          <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div className="set-card__head"><IconPick size={17} /><h2 className="h2">安可集章卡</h2></div>
              <p className="set-card__desc" style={{ marginBottom: 12 }}>
                每发现一个小彩蛋，这里就盖一枚拨片。盖满会怎样，我也不知道。
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="stamp-progress">{eggs.length} / 17</div>
              <div className="meta" style={{ marginTop: 2 }}>已盖 {eggs.length} 枚</div>
            </div>
          </div>
          <div className="stamp-bar"><i style={{ width: (eggs.length / 17 * 100) + "%" }}></i></div>
          <div className="stamp-grid">
            {EGGS.map(e => {
              const found = eggs.includes(e.id);
              return (
                <div key={e.id} className={"stamp-cell" + (found ? " is-found" : "")} title={found ? e.name : "还没找到"}>
                  {found ? (
                    <span className="stamp-cell__pick">
                      <svg viewBox="0 0 40 40" width="30" height="30" fill="currentColor" aria-hidden="true">
                        <path d="M20 4c6.6 0 13 5.4 13 12 0 7.6-7 14-11 17.4-1.1 1-2.9 1-4 0C14 30 7 23.6 7 16 7 9.4 13.4 4 20 4z" opacity=".16"/>
                        <path d="M20 4c6.6 0 13 5.4 13 12 0 7.6-7 14-11 17.4-1.1 1-2.9 1-4 0C14 30 7 23.6 7 16 7 9.4 13.4 4 20 4z" fill="none" stroke="currentColor" strokeWidth="1.3"/>
                      </svg>
                      <span style={{ position: "absolute", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--coral)" }}>
                        {e.id.slice(1)}
                      </span>
                    </span>
                  ) : <span>??</span>}
                  <span className="stamp-cell__name">{found ? e.name : ""}</span>
                </div>
              );
            })}
          </div>
          <div className="stamp-foot">
            <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              不写触发方式，留着自己撞。
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setDemoOpen(true)}>
              原型演示 · 全部彩蛋
            </button>
          </div>
        </div>

        <div className="set-card">
          <div className="set-card__head"><IconSearch size={17} /><h2 className="h2">秘密 setlist</h2></div>
          <p className="set-card__desc">有些词不用来搜歌。在搜索框里敲进去，回车。</p>
          <div className="code-box">
            <input ref={codeRef} value={code} onChange={e => setCode(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  if (tryCode(code)) setCode("");
                  else toast("今晚没有这张 setlist。", { hand: true });
                }
              }}
              placeholder="输入暗号…" aria-label="输入暗号" />
            <button className="btn btn-primary" onClick={() => {
              if (tryCode(code)) setCode("");
              else { if (window.Sound) Sound.tap(); toast("今晚没有这张 setlist。", { hand: true }); }
            }}>确认</button>
          </div>
          <div className="row gap8" style={{ marginTop: 14 }}>
            <IconPick size={12} style={{ color: "var(--coral)", opacity: .7 }} />
            <span className="meta">解锁的色调会留在上面的「限定色调」里。</span>
          </div>
        </div>

        <div className="set-card">
          <div className="set-card__head"><IconNote size={17} /><h2 className="h2">关于这台播放器</h2></div>
          <p className="set-card__desc" style={{ marginBottom: 10 }}>
            AFEIFEI 是一间画出来的后台。三个乐队的气质只作为氛围与彩蛋出现。
          </p>
          <div className="col gap6">
            {["不出现角色脸，只留 Q 版剪影与背影", "不贴官方 Logo、海报与截图", "不引用原作台词，曲名均为原创", "彩蛋不阻塞播放，随时可以走开"].map(txt => (
              <div key={txt} className="row gap8">
                <IconCheck size={12} style={{ color: "var(--pink-600)", flex: "none" }} />
                <span className="meta" style={{ color: "var(--text-2)" }}>{txt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="demo-foot">
        <span className="meta">所有乐队、曲目、海报均为原创虚构内容。</span>
        <div className="row gap16">
          <button className="demo-link" onClick={() => setDemoOpen(true)}>原型演示 · 彩蛋与冷却</button>
          <button className="demo-link" onClick={() => {
            Object.keys(localStorage).filter(k => k.startsWith("afeifei.")).forEach(k => localStorage.removeItem(k));
            location.reload();
          }}>清空本地记录</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
