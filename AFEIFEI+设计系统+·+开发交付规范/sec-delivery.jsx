/* 09 · Token 汇总（可复制） + 10 · 已知限制 */

const CSS_TEXT = `/* AFEIFEI Design System — v4.2 tokens */
:root {
  /* color · light「排练室」 */
  --bg-base: #FFF8F5;
  --bg-sub: #FFE8EF;
  --bg-card: #FFFFFF;
  --text-primary: #3D2B39;
  --text-secondary: #6B5A68;
  --brand-pink-400: #FF6B9D;   /* 仅装饰 */
  --brand-pink-600: #D63384;   /* 交互主色 */
  --brand-pink-700: #B7286C;
  --lavender-600: #7B5FC9;
  --mint-400: #7EC8E3;         /* 仅装饰 */
  --coral-600: #C62A3F;
  --marker-yellow: #FFD166;    /* 禁作文字色 */
  --gradient-tri: 90deg, #FF9EBB, #B8A9E8, #7EC8E3;
  --shadow-pink: 0 4px 20px rgba(255, 107, 157, .15);
  --shadow-pop: 0 8px 32px rgba(61, 43, 57, .18);

  /* color · source & state */
  --src-netease: #C20C0C;
  --src-qq: #31C27C;
  --tag-vip: #B8860B;
  --tag-unavailable: 0.4;      /* 用于 opacity */
  --state-success: #2E7D5B;
  --state-warning: var(--coral-600);
  --focus-ring: 0 0 0 3px rgba(214, 51, 132, .35);

  /* type */
  --font-display: "ZCOOL XiaoWei", "Yozai", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-body: "PingFang SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  --font-hand: "ZCOOL KuaiLe", "Long Cang", cursive;
  --fs-display: 28px/36px;
  --fs-title: 20px/28px;
  --fs-heading: 16px/24px;
  --fs-body: 14px/22px;
  --fs-caption: 12px/18px;
  --fs-micro: 11px/16px;

  /* space · radius */
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --radius-card: 16px;
  --radius-btn: 999px;
  --radius-cover: 4px;

  /* motion */
  --ease-out-soft: cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-curtain: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-tap: 120ms;
  --dur-fast: 220ms;
  --dur-base: 380ms;
  --dur-curtain: 500ms;
  --dur-ambient: 2000ms;
}

:root[data-theme="dark"] {
  --bg-base: #2A2438;
  --bg-sub: #352E48;
  --bg-card: #3D3554;
  --text-primary: #F4EAF2;
  --text-secondary: #B8ABC7;
  --brand-pink-400: #FF85B0;
  --brand-pink-600: #E06A9E;   /* 不作实心白字按钮 */
  --lamplet-amber: #FFC66E;    /* 夜间主题限定 */
}`;

function renderCssLines(text) {
  return text.split("\n").map((line, i) => {
    const comment = line.match(/^(\s*)(\/\*.*\*\/)\s*$/);
    if (comment) {
      return (
        <div key={i}><span className="c">{comment[1]}{comment[2]}</span></div>
      );
    }
    const decl = line.match(/^(\s*)(--[\w-]+)(:\s*)(.*?)(;?)\s*(?:\/\*\s*(.*?)\s*\*\/)?$/);
    if (decl) {
      return (
        <div key={i}>
          {decl[1]}
          <span className="k">{decl[2]}</span>
          <span className="c">: </span>
          <span className="v">{decl[4]}</span>
          <span className="c">{decl[5]}</span>
          {decl[6] ? <span className="c">  /* {decl[6]} */</span> : null}
        </div>
      );
    }
    return <div key={i}><span className="c">{line}</span></div>;
  });
}

function DeliverySection() {
  return (
    <Section
      id="delivery"
      num="09"
      kicker="Handoff"
      title="Token 汇总"
      meta="可直接复制"
    >
      <p className="lede">
        下面是全量变量，顺序与本文档章节一致。<span className="mono"> :root </span>
        为亮色默认，<span className="mono"> :root[data-theme="dark"] </span> 覆盖为夜间主题。
        直接粘贴到全局样式即可开工。
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <button type="button" className="btn" onClick={() => copyText(CSS_TEXT, "已复制全部 Token（CSS）")}>
          复制全部 Token
        </button>
        <span className="tag line">CSS 变量 · {CSS_TEXT.split("\n").length} 行</span>
        <span className="small" style={{ marginLeft: "auto" }}>
          30 颜色 · 3 字体栈 · 6 字阶 · 4 间距 · 3 圆角 · 8 动效
        </span>
      </div>

      <div className="code-wrap">
        <div className="code-block" tabIndex="0" aria-label="Token CSS 代码">{renderCssLines(CSS_TEXT)}</div>
      </div>
      <div className="code-foot">
        <span>共 {CSS_TEXT.split("\n").length} 行 · 区内可滚动</span>
        <span>暗色以 data-theme="dark" 覆盖，不新增第二套变量名</span>
      </div>
    </Section>
  );
}

function LimitsSection() {
  return (
    <Section
      id="limits"
      num="10"
      kicker="Known Limits"
      title="已知限制与待办"
      meta="5 项 · 显式列出"
    >
      <p className="lede">
        以下问题不藏着：它们会影响验收，需要在接入真实后端时逐条回归。
      </p>
      <div className="limits">
        {LIMITS.map((l) => (
          <div className="limit" key={l.n}>
            <span className="n">{l.n}</span>
            <p><b>{l.b}</b> · {l.t}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

Object.assign(window, { DeliverySection, LimitsSection, CSS_TEXT });
