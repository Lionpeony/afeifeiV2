/* 01 · 颜色 Token */

const ColorNote = ({ text }) => <Note>{text}</Note>;

function ColorSection() {
  return (
    <Section
      id="color"
      num="01"
      kicker="Color Tokens"
      title="颜色 Token"
      meta="30 项 · 双主题"
    >
      <p className="lede">
        全部对比度数值为 WCAG 相对亮度公式实算结果（2026-11-16）。亮色为默认主题，暗色由
        <span className="mono"> prefers-color-scheme </span>
        与手动三档（明亮 / 熄灯 / 跟随系统）共同驱动。点任意色卡即可复制变量。
      </p>

      <SubHead num="1.1" title="亮色主题「排练室」（默认）" desc="15 项 · 含渐变与阴影" />
      <div className="swatches">
        {LIGHT_COLORS.map((c) => <Swatch key={c.token} item={c} />)}
      </div>
      <ColorNote text="对比度是算出来的，配色才有底气 —— 2.68:1 那一格只能当装饰。" />

      <SubHead num="1.2" title="暗色主题「排练室熄灯」" desc="8 项 · 雨夜紫黑" />
      <div className="plate-dark">
        <div className="plate-label">
          <span>DARK PLATE · 按真实底色预览</span>
          <span>prefers-color-scheme + 手动三档</span>
        </div>
        <div className="swatches">
          {DARK_COLORS.map((c) => <Swatch key={c.token} item={c} darkMode />)}
        </div>
        <div className="plate-note">
          <b>暗色按钮规范：</b>底 <span className="mono">#3D3554</span> + 描边 1px{" "}
          <span className="mono">#FF85B0</span> + 字 <span className="mono">#F4EAF2</span>（描边按钮）。
          禁止低对比实心粉底白字。
          <div>
            <span className="dark-btn-demo">播放全部 12 首</span>
          </div>
        </div>
      </div>

      <SubHead num="1.3" title="音源语义色" desc="多音源聚合标识" />
      <div className="swatches">
        {SOURCE_COLORS.map((c) => <Swatch key={c.token} item={c} />)}
      </div>

      <SubHead num="1.4" title="状态色" desc="3 项" />
      <div className="swatches">
        {STATE_COLORS.map((c) => <Swatch key={c.token} item={c} />)}
      </div>

      <div className="rule-grid" style={{ marginTop: 26 }}>
        <div className="card info-card">
          <div className="info-card-head">
            <b>一个交互色，两个明度</b>
            <span className="tag line">pink 400 / 600</span>
          </div>
          <p>
            <span className="mono">--brand-pink-400</span> 只做皮肤：贴纸、柔光、渐变、胶带。
            一切需要承载白字或小图标的交互面，一律用 <span className="mono">--brand-pink-600</span>，
            按下态降一级到 700。
          </p>
        </div>
        <div className="card info-card">
          <div className="info-card-head">
            <b>阴影只有两档</b>
            <span className="tag line">2 levels</span>
          </div>
          <p>
            卡片用 <span className="mono">--shadow-pink</span>，弹层用{" "}
            <span className="mono">--shadow-pop</span>。禁止出现第三档层级，更深的效果用描边与底色区分。
          </p>
        </div>
      </div>
    </Section>
  );
}

Object.assign(window, { ColorSection });
