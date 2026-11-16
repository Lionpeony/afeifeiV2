/* 04 · 动效 Token */

const PLOT = { x0: 12, x1: 148, y0: 100, y1: 36 };

function easePath(points) {
  const [x1, y1, x2, y2] = points;
  const px = (v) => PLOT.x0 + v * (PLOT.x1 - PLOT.x0);
  const py = (v) => PLOT.y0 - v * (PLOT.y0 - PLOT.y1);
  return {
    d: `M ${px(0)} ${py(0)} C ${px(x1)} ${py(y1)}, ${px(x2)} ${py(y2)}, ${px(1)} ${py(1)}`,
    c1: [px(x1), py(y1)],
    c2: [px(x2), py(y2)]
  };
}

function EasePlot({ points }) {
  const p = easePath(points);
  return (
    <svg className="ease-plot" viewBox="0 0 160 112" aria-hidden="true">
      <line x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x1 + 4} y2={PLOT.y0} stroke="var(--hairline-2)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1={PLOT.x0} y1={PLOT.y1} x2={PLOT.x1 + 4} y2={PLOT.y1} stroke="var(--hairline)" strokeWidth="1" strokeDasharray="2 3" />
      <line x1={PLOT.x0} y1={PLOT.y0} x2={PLOT.x0} y2={PLOT.y1} stroke="var(--hairline)" strokeWidth="1" />
      <line x1={PLOT.x0} y1={PLOT.y1} x2={p.c1[0]} y2={p.c1[1]} stroke="var(--pink-400)" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.7" />
      <line x1={PLOT.x1} y1={PLOT.y0} x2={p.c2[0]} y2={p.c2[1]} stroke="var(--pink-400)" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.7" />
      <path d={p.d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx={p.c1[0]} cy={p.c1[1]} r="2.6" fill="var(--pink-400)" />
      <circle cx={p.c2[0]} cy={p.c2[1]} r="2.6" fill="var(--pink-400)" />
      <text x={PLOT.x0 - 2} y={PLOT.y0 + 8} fontSize="6" fill="var(--text-secondary)" fontFamily="var(--font-mono)">0</text>
      <text x={PLOT.x1 - 2} y={PLOT.y1 - 4} fontSize="6" fill="var(--text-secondary)" fontFamily="var(--font-mono)">1</text>
    </svg>
  );
}

function DemoStage() {
  const [mode, setMode] = React.useState("player");
  const [playK, setPlayK] = React.useState(0);
  const [listK, setListK] = React.useState(0);
  const [fx, setFx] = React.useState(null);
  const timer = React.useRef(null);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const fire = (type, dur) => {
    setFx((f) => ({ type, k: (f ? f.k : 0) + 1 }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFx(null), dur);
  };

  const pressPlay = () => {
    setMode("player");
    setPlayK((k) => k + 1);
  };
  const stamp = () => { setMode("player"); fire("stamp", 1400); };
  const curtain = () => { setMode("player"); fire("curtain", 900); };
  const swipe = (dir) => { setMode("player"); fire(dir, 450); };
  const stagger = () => { setMode("list"); setListK((k) => k + 1); };

  const rows = ["雨のリハーサル", "夜明けまでのセットリスト", "放課後のアンプ", "三拍子的雨", "无人知晓的和弦", "安可前的十秒"];

  return (
    <div className="stage">
      <span className="stage-lab">Motion Demo · 可点击重放</span>
      <div className="stage-inner">
        {mode === "player" ? (
          <div className="mini-player">
            <span className="mini-cover"></span>
            <div className="mini-info">
              <div className="mini-title">雨のリハーサル</div>
              <div className="mini-sub">网易云 · 03:47</div>
              <div className="mini-bar">
                <span className="buf"></span>
                <span className="prog"></span>
              </div>
            </div>
            <span className="mini-time">01:12</span>
            <button
              type="button"
              className={"playbtn" + (playK ? " press" : "")}
              key={playK}
              onClick={pressPlay}
              aria-label="播放（可重放按下动效）"
            >
              <IconPlay size={14} />
            </button>
          </div>
        ) : (
          <div className="stagger-list" key={listK}>
            {rows.map((r, i) => (
              <div className="st-row in" key={r} style={{ animationDelay: i * 45 + "ms" }}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <span className="t">{r}</span>
              </div>
            ))}
          </div>
        )}

        {fx && fx.type === "curtain" ? <span className="curtain" key={"cur" + fx.k}></span> : null}
        {fx && (fx.type === "veil-l" || fx.type === "veil-r") ? (
          <span className={"veil" + (fx.type === "veil-r" ? " right" : "")} key={"veil" + fx.k}></span>
        ) : null}
        {fx && fx.type === "stamp" ? (
          <span className="stamp-demo" key={"st" + fx.k}>
            <span className="stamp-mark">盖章</span>
            <span className="ink-ring" style={{ marginLeft: 0 }}></span>
          </span>
        ) : null}
      </div>

      <div className="stage-btns">
        <button type="button" className="btn small" onClick={pressPlay}>播放键按下</button>
        <button type="button" className="btn small ghost" onClick={stamp}>拨片盖章</button>
        <button type="button" className="btn small ghost" onClick={curtain}>幕布</button>
        <button type="button" className="btn small ghost" onClick={() => swipe("veil-l")}>切歌 · 左扫</button>
        <button type="button" className="btn small ghost" onClick={() => swipe("veil-r")}>切歌 · 右扫</button>
        <button type="button" className="btn small ghost" onClick={stagger}>列表入场</button>
      </div>
      <div className="stage-caption">
        播放键 380ms · 盖章 ink 450ms · 幕布 500ms · 纱帘 150ms · 入场 stagger 45ms
      </div>
    </div>
  );
}

function MotionSection({ motionLevel }) {
  return (
    <Section
      id="motion"
      num="04"
      kicker="Motion Tokens"
      title="动效 Token"
      meta="3 曲线 · 5 时长"
    >
      <p className="lede">
        三条缓动曲线与五档时长构成全部动效词汇。所有动画只走 transform / opacity / filter /
        stroke-dashoffset，并且可中断、可逆。
      </p>

      <SubHead num="4.1" title="缓动曲线" desc="点击可复制 cubic-bezier" />
      <div className="ease-grid">
        {EASINGS.map((e) => (
          <button
            type="button"
            className="card ease-card"
            key={e.token}
            onClick={() => copyText(e.value, "已复制 " + e.token)}
            style={{ textAlign: "left" }}
          >
            <div className="ease-name">{e.token}</div>
            <EasePlot points={e.points} />
            <div className="ease-run">
              <i style={{ animationTimingFunction: e.value }}></i>
            </div>
            <div className="ease-code">{e.value}</div>
            <div className="small">{e.note}</div>
          </button>
        ))}
      </div>

      <SubHead num="4.2" title="时长阶梯" desc="按真实毫秒等比" />
      <div className="card pad">
        <div className="dur-list">
          {DURATIONS.map((d, i) => (
            <div className="dur-row" key={d.token}>
              <span className="dur-name">{d.token}</span>
              <span className="dur-track">
                <span className="dur-bar" style={{ width: (d.ms / 2000) * 100 + "%", opacity: 0.95 - i * 0.13 }}></span>
              </span>
              <span className="dur-val">{d.ms}ms</span>
            </div>
          ))}
        </div>
        <div className="dur-row" style={{ marginTop: 10, borderTop: "1px solid var(--hairline)", paddingTop: 10 }}>
          <span className="dur-val">说明</span>
          <span className="small">条长 = 2000ms 满格。--dur-ambient 只用于主题切换与氛围过渡，不做交互反馈。</span>
          <span></span>
        </div>
      </div>

      <SubHead num="4.3" title="节奏规则" desc="4 条" />
      <div className="rules">
        {RHYTHM_RULES.map((r) => (
          <div className="rule" key={r.b}><span><b>{r.b}</b> · {r.t}</span></div>
        ))}
      </div>

      <SubHead num="4.4" title="动效档位" desc="设置内持久化 · reduced-motion 自动降级" />
      <div className="level-grid">
        {MOTION_LEVELS.map((l) => (
          <div className="level" key={l.key} data-active={String(l.key === motionLevel)}>
            <b>{l.label}</b>
            <span>{l.desc}</span>
          </div>
        ))}
      </div>
      <p className="small" style={{ marginTop: 10 }}>
        当前页面档位：<b className="mono" style={{ color: "var(--accent-text)" }}>{{ full: "完整", light: "轻动效", off: "关闭装饰动效" }[motionLevel] || motionLevel}</b>
        {" "}· 可在右下角「风格」面板切换，或直接把系统设为减少动态效果查看降级。
      </p>

      <SubHead num="4.5" title="动效演示台" desc="用文档里的真实参数播放" />
      <DemoStage />
    </Section>
  );
}

Object.assign(window, { MotionSection });
