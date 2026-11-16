/* AFEIFEI Design System — spec page shell */

const TOC = [
  { id: "cover", num: "00", label: "封面与红线" },
  { id: "color", num: "01", label: "颜色 Token" },
  { id: "type", num: "02", label: "字体与字阶" },
  { id: "layout", num: "03", label: "间距 / 圆角 / 栅格" },
  { id: "motion", num: "04", label: "动效 Token" },
  { id: "components", num: "05", label: "组件状态" },
  { id: "anime", num: "06", label: "二次元表现层" },
  { id: "eggs", num: "07", label: "彩蛋索引" },
  { id: "a11y", num: "08", label: "无障碍" },
  { id: "delivery", num: "09", label: "Token 汇总" },
  { id: "limits", num: "10", label: "已知限制" }
];

const THEME_MODES = [
  { key: "light", label: "明亮" },
  { key: "dark", label: "熄灯" },
  { key: "system", label: "跟随" }
];

const MOTION_UI = { "完整": "full", "轻动效": "light", "关闭装饰": "off" };
const DENSITY_UI = { "标准": "standard", "紧凑": "compact" };

function Seal() {
  return (
    <svg className="seal" viewBox="0 0 160 160" role="img" aria-label="AFEIFEI 设计系统 v4.2 规范印章">
      <defs>
        <path id="sealArc" d="M80,80 m-59,0 a59,59 0 1,1 118,0 a59,59 0 1,1 -118,0" />
      </defs>
      <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" strokeWidth="2" opacity=".6" />
      <circle cx="80" cy="80" r="47" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".45" />
      <circle cx="80" cy="80" r="42" fill="none" stroke="currentColor" strokeWidth="0.8" opacity=".3" />
      <text className="seal-ring">
        <textPath href="#sealArc" startOffset="14%">
          AFEIFEI · SPEC v4.2 · 2026.11.16 ·
        </textPath>
      </text>
      <text x="80" y="76" textAnchor="middle" className="seal-big">v4.2</text>
      <text x="80" y="94" textAnchor="middle" className="seal-small">汇总版 · SPEC</text>
    </svg>
  );
}

function Hero() {
  return (
    <header className="hero" id="cover" data-screen-label="00 · 封面">
      <div className="hero-top">
        <div>
          <div className="hero-eyebrow"><span className="dot"></span>Design System Specification</div>
          <div className="hero-word">AFEIFEI</div>
          <div className="hero-cn">设计系统<em>规范</em></div>
          <div className="hero-meta">
            <span className="tag">v4.2 汇总版</span>
            <span className="tag line">2026-11-16</span>
            <span className="tag line">对比度 WCAG 实算</span>
            <span className="tag line">桌面端 · 多音源聚合</span>
          </div>
          <p className="lede hero-lede">
            二次元少女乐队音乐播放器的开发交付规范。这份页面是唯一的 Token 事实源：
            亮暗双主题、六层字阶、三档动效曲线、组件五态与十七个彩蛋，全部可在线对照评审。
            <strong> 点色卡即复制变量，右上角切换亮暗。</strong>
          </p>
        </div>
        <div className="hero-side">
          <Seal />
          <div className="hero-tips">
            <span className="kicker">How to read</span>
            <ul>
              <li>点色卡 / 曲线即复制</li>
              <li>右上角切换亮暗</li>
              <li>右下角调档位与密度</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat"><b>30</b><span>颜色 Token（亮 15 · 暗 8 · 音源 4 · 状态 3）</span></div>
        <div className="stat"><b>3<i>×</i>6</b><span>字体栈 × 字阶层级</span></div>
        <div className="stat"><b>8</b><span>动效 Token（3 曲线 · 5 时长）</span></div>
        <div className="stat"><b>17</b><span>彩蛋 · E01 — E17</span></div>
      </div>

      <div className="redlines">
        <span className="tape"></span>
        <div className="redlines-head">
          <span>红线 · 不可违反</span>
          <span>RED LINES / 4</span>
        </div>
        <ul>
          {["无角色脸", "无官方 Logo", "无原作截图", "无台词与曲名原文外露"].map((t) => (
            <li key={t}><span className="x"><IconX /></span>{t}</li>
          ))}
        </ul>
        <p className="redlines-foot">
          另有两条颜色纪律：暖黄与薄荷蓝永不作小文字色；<span className="mono">--brand-pink-400</span>{" "}
          永不作交互面。
        </p>
      </div>
    </header>
  );
}

function App() {
  const TWEAK_DEFAULTS = window.TWEAK_DEFAULTS || { motion: "完整", density: "标准", notes: true };
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [themeMode, setThemeMode] = React.useState(() => {
    try { return localStorage.getItem("afeifei-doc-theme") || "light"; } catch (e) { return "light"; }
  });
  const [systemDark, setSystemDark] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [active, setActive] = React.useState("cover");
  const [progress, setProgress] = React.useState(0);
  const [toasts, setToasts] = React.useState([]);

  /* system color scheme + reduced motion */
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener("change", on);
    else mq.addListener(on);

    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onRm = () => setReducedMotion(rm.matches);
    onRm();
    if (rm.addEventListener) rm.addEventListener("change", onRm);
    else rm.addListener(onRm);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", on);
      else mq.removeListener(on);
      if (rm.removeEventListener) rm.removeEventListener("change", onRm);
      else rm.removeListener(onRm);
    };
  }, []);

  const resolvedTheme = themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;

  React.useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    try { localStorage.setItem("afeifei-doc-theme", themeMode); } catch (e) {}
  }, [resolvedTheme, themeMode]);

  const motionLevel = reducedMotion && t.motion === "完整" ? "off" : (MOTION_UI[t.motion] || "full");
  const density = DENSITY_UI[t.density] || "standard";

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = motionLevel;
    root.dataset.density = density;
    root.dataset.notes = t.notes ? "on" : "off";
  }, [motionLevel, density, t.notes]);

  /* scroll spy + progress */
  React.useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(h > 0 ? Math.min(100, Math.max(0, (window.scrollY / h) * 100)) : 0);
        let cur = "cover";
        for (const item of TOC) {
          const el = document.getElementById(item.id);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= 160) cur = item.id;
        }
        setActive(cur);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  /* toasts */
  React.useEffect(() => {
    const handler = (e) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-2), { id, msg: e.detail }]);
      window.setTimeout(() => {
        setToasts((list) => list.filter((x) => x.id !== id));
      }, 2000);
    };
    window.addEventListener("doc-toast", handler);
    return () => window.removeEventListener("doc-toast", handler);
  }, []);

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 78, behavior: "smooth" });
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="tri-strip"></div>
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">AF</span>
            <span className="brand-name">AFEIFEI 设计系统规范</span>
            <span className="brand-ver">v4.2</span>
          </div>
          <div className="topbar-right">
            <span className="progress-read">READ <b>{Math.round(progress)}%</b></span>
            <div className="seg" role="group" aria-label="主题切换">
              {THEME_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={themeMode === m.key}
                  onClick={() => setThemeMode(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="shell">
        <aside>
          <nav className="toc" aria-label="文档目录">
            <div className="toc-label">Setlist / 目录</div>
            <div className="toc-list">
              {TOC.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="toc-item"
                  aria-current={active === item.id ? "true" : "false"}
                  onClick={() => go(item.id)}
                >
                  <span className="idx">{item.num}</span>
                  <span className="lbl">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="toc-foot">
              全部数值为 WCAG 实算。<br />
              未达标的色已在色卡标注 <b>禁止用途</b>。<br /><br />
              <button type="button" className="btn ghost small" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                回到封面
              </button>
            </div>
          </nav>
        </aside>

        <main>
          <Hero />
          <ColorSection />
          <TypeSection />
          <LayoutSection />
          <MotionSection motionLevel={motionLevel} />
          <ComponentsSection />
          <AnimeSection />
          <EggsSection />
          <A11ySection />
          <DeliverySection />
          <LimitsSection />

          <footer className="doc-foot">
            <div className="f-left">
              <b>AFEIFEI</b>
              <span className="small">设计系统开发交付规范 · v4.2 汇总版</span>
            </div>
            <div className="f-right">
              TOKENS VERIFIED 2026-11-16<br />
              红线：无角色脸 / 无官方 Logo / 无原作截图
            </div>
          </footer>
        </main>
      </div>

      <div className="toast-layer" aria-live="polite">
        {toasts.map((x) => (
          <div className="toast" key={x.id}>
            <IconCheck size={13} />
            <span>{x.msg}</span>
          </div>
        ))}
      </div>

      <TweaksPanel title="风格">
        <TweakSection label="动效" />
        <TweakRadio
          label="档位"
          value={t.motion}
          options={["完整", "轻动效", "关闭装饰"]}
          onChange={(v) => setTweak("motion", v)}
        />
        <TweakSection label="版式" />
        <TweakRadio
          label="表格密度"
          value={t.density}
          options={["标准", "紧凑"]}
          onChange={(v) => setTweak("density", v)}
        />
        <TweakToggle
          label="手写批注"
          value={t.notes}
          onChange={(v) => setTweak("notes", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
