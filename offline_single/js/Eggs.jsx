/* ---------- 彩蛋层 ---------- */
function EggLayer({ boot }) {
  const { overlay, corner } = useApp();

  return (
    <>
      {/* E01 启动 · 吉他滑过 */}
      <div className={"boot" + (boot ? "" : " is-done")} aria-hidden={!boot}>
        <div className="boot__inner">
          <div className="boot__logo">
            <LogoMark size={58} />
            <div className="boot__word">AFEIFEI</div>
            <div className="boot__sub jp">少女乐队后台 · 音乐播放器</div>
          </div>
          <div className="boot__rail">
            <span className="boot__guitar"><GuitarFigure w={124} h={62} /></span>
            <span className="boot__spark"></span>
          </div>
          <div className="boot__bar"><i></i></div>
        </div>
      </div>

      {/* E09 凌晨河边 */}
      {overlay === "river" && (
        <div className="river">
          {[[68, 82, 5], [74, 86, 3.4], [81, 79, 4], [62, 88, 2.6], [86, 90, 3], [71, 92, 2.2]].map((p, i) => (
            <span key={i} className="river__light"
              style={{ left: p[0] + "%", top: p[1] + "%", width: p[2] * 2, height: p[2] * 2, "--d": (800 + i * 50) + "ms" }}></span>
          ))}
          <div className="river__copy">便利店的灯还亮着。</div>
          <div className="river__meta">02:47 · 河堤 · 没有别人</div>
        </div>
      )}

      {/* E11 秘密 live */}
      {overlay === "live" && (
        <div className="live">
          <div className="live__beams">
            <span className="live__beam live__beam--1"></span>
            <span className="live__beam live__beam--2"></span>
            <span className="live__beam live__beam--3"></span>
          </div>
          <div className="live__floor"></div>
          <div className="live__stage">
            <div className="live__inst" style={{ animationDelay: ".42s" }}><InstDrum size={96} /><span>DRUMS</span></div>
            <div className="live__inst" style={{ animationDelay: ".46s" }}><InstBass size={92} /><span>BASS</span></div>
            <div className="live__inst" style={{ animationDelay: ".5s" }}><InstGuitar size={92} /><span>GUITAR</span></div>
            <div className="live__inst" style={{ animationDelay: ".54s" }}><InstKeys size={80} /><span>KEYS</span></div>
          </div>
        </div>
      )}

      {/* E10 写词 */}
      {overlay === "lyric" && (
        <div className="lyric" onClick={() => {}}>
          <div className="lyric__note">
            <Tape w={72} rot={-2} style={{ top: -11, left: "50%", marginLeft: -36 }} />
            <div className="eyebrow" style={{ color: "rgba(61,43,57,.45)" }}>练习本 · 第 43 页</div>
            <div className="lyric__lines">
              <div className="lyric__line"></div>
              <div className="lyric__line"></div>
              <div className="lyric__line"></div>
              <div className="lyric__line"></div>
            </div>
            <div><span className="lyric__text">写了又划，划了又写。</span></div>
            <div className="lyric__meta">SAME SONG · 10 TIMES</div>
            <span className="lyric__cross"></span>
          </div>
        </div>
      )}

      {/* E14 待机 */}
      {overlay === "idle" && (
        <div className="idle-veil">
          <div className="idle-figure"><Silhouette w={92} h={114} /></div>
          <div className="idle-copy">……在看吗？</div>
        </div>
      )}

      {/* E13 角落小背影 */}
      {corner && (
        <>
          <div className="corner-figure"><Silhouette w={66} h={82} /></div>
          <div className="corner-figure__copy">……我先回去练琴了。</div>
        </>
      )}

    </>
  );
}

function DemoPanel() {
  const { setDemoOpen, eggs, triggerEgg } = useApp();
  React.useEffect(() => {
    const fn = e => { if (e.key === "Escape") setDemoOpen(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [setDemoOpen]);
  return (
    <div className="demo" onClick={() => setDemoOpen(false)}>
      <div className="demo__panel" onClick={e => e.stopPropagation()}>
        <div className="demo__head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>原型演示</div>
            <h2 className="h1">16 个彩蛋，随手点一个</h2>
          </div>
          <button className="icon-btn" onClick={() => setDemoOpen(false)} aria-label="关闭"><IconX size={18} /></button>
        </div>
        <p className="demo__sub">
          真机上这些彩蛋靠时间、次数和动作触发（例如凌晨 2–4 点、同一首听 10 遍、连点 Logo 5 次）。
          这里为了方便评审，提供手动触发。
        </p>
        <div className="demo__grid">
          {EGGS.map(e => (
            <button key={e.id} className="demo__item" onClick={() => triggerEgg(e.id)}>
              <span className="demo__id">{e.id}</span>
              <span className="demo__name">
                {e.name}
                <span className="meta" style={{ display: "block", fontSize: 10, marginTop: 2, lineHeight: 1.5 }}>
                  {DEMO_INFO[e.id]}
                </span>
              </span>
              <span className="demo__go">{eggs.includes(e.id) ? "再看" : "触发"}</span>
            </button>
          ))}
        </div>
        <div className="demo__foot">
          <span className="meta">已发现 {eggs.length} / 16 · 记录保存在本地</span>
          <span className="meta">按 Esc 或点空白关闭</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EggLayer, DemoPanel });
