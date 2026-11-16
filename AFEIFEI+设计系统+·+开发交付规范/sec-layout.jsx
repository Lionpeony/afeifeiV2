/* 03 · 间距 / 圆角 / 栅格 */

function LayoutSection() {
  return (
    <Section
      id="layout"
      num="03"
      kicker="Spacing · Radius · Grid"
      title="间距 / 圆角 / 栅格"
      meta="8px 基准"
    >
      <p className="lede">
        间距以 8px 为基准，模块纵向统一 32。圆角只有三档职责：卡片 16、按钮全胶囊、封面 4 加 1px 内描边做出印刷卡纸感。
      </p>

      <SubHead num="3.1" title="间距阶梯" desc="4 档" />
      <div className="card pad">
        <div className="space-list">
          {SPACING.map((s) => (
            <div className="space-row" key={s.token}>
              <span className="space-token">{s.token}</span>
              <span className="space-track">
                <span className="space-bar" style={{ width: s.px * 5 }}></span>
              </span>
              <span className="space-val">{s.px}px</span>
            </div>
          ))}
        </div>
        <p className="small" style={{ marginTop: 12 }}>
          卡片内距 16、区块内距 24、模块之间 32。间距不写任意值，只从这四档里取。
        </p>
      </div>

      <SubHead num="3.2" title="圆角" desc="3 档职责" />
      <div className="radius-grid">
        <div className="card radius-tile">
          <div className="radius-shape r-card">16</div>
          <div className="radius-meta">
            <b>--radius-card · 16px</b>
            <span>卡片 / 弹层 / 浮层</span>
          </div>
        </div>
        <div className="card radius-tile">
          <div className="radius-shape r-btn">999</div>
          <div className="radius-meta">
            <b>--radius-btn · 999px</b>
            <span>按钮 / 标签 / 胶囊</span>
          </div>
        </div>
        <div className="card radius-tile">
          <div className="radius-shape r-cover">4</div>
          <div className="radius-meta">
            <b>--radius-cover · 4px</b>
            <span>封面 + 1px 内描边</span>
          </div>
        </div>
      </div>

      <SubHead num="3.3" title="布局骨架" desc="侧栏 200 · 内容区自适应 · 播放栏 72" />
      <div className="card pad">
        <div className="wire" role="img" aria-label="布局示意：左侧栏定宽 200px，内容区自适应，底部播放栏固定 72px">
          <div className="wire-side">
            <i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
          <div className="wire-main">
            <span className="wire-hd"></span>
            {[0, 1, 2, 3].map((i) => (
              <div className="wrow" key={i}>
                <span className="wc"></span>
                <span className="wl"></span>
                <span className="wl s"></span>
                <span className="wd"></span>
              </div>
            ))}
          </div>
          <div className="wire-bar">
            <span className="wc"></span>
            <span className="wp"></span>
            <span className="wk"></span>
            <span className="wire-lab bar">播放栏 72</span>
          </div>
          <span className="wire-lab side">侧栏 200</span>
          <span className="wire-lab row">曲目行 48 / 40</span>
        </div>
        <p className="small" style={{ marginTop: 12 }}>
          示意，非等比 —— 尺寸以标注为准。侧栏与播放栏固定，内容区独立滚动；页面转场时侧栏与播放栏不动。
        </p>
      </div>

      <SubHead num="3.4" title="曲目行密度" desc="1:1 实际高度" />
      <div className="rule-grid">
        <div className="card pad">
          <div className="row-cap"><span>DEFAULT · 48px</span><span>设置可切</span></div>
          <div className="rowstack">
            <div className="row-demo">
              <span className="c"></span>
              <span className="t">雨のリハーサル</span>
              <span className="d">03:47</span>
            </div>
            <div className="row-demo">
              <span className="c"></span>
              <span className="t">放課後のアンプ</span>
              <span className="d">02:58</span>
            </div>
          </div>
        </div>
        <div className="card pad">
          <div className="row-cap"><span>COMPACT · 40px</span><span>紧凑模式</span></div>
          <div className="rowstack">
            <div className="row-demo tight">
              <span className="c" style={{ width: 22, height: 22 }}></span>
              <span className="t">雨のリハーサル</span>
              <span className="d">03:47</span>
            </div>
            <div className="row-demo tight">
              <span className="c" style={{ width: 22, height: 22 }}></span>
              <span className="t">放課後のアンプ</span>
              <span className="d">02:58</span>
            </div>
          </div>
        </div>
      </div>

      <SubHead num="3.5" title="断点与滚动条" desc="桌面优先" />
      <div className="rule-grid">
        <div className="card pad">
          <div className="bp-list">
            {BREAKPOINTS.map((b) => (
              <div className="bp-row" key={b.range}>
                <span className="r">{b.range}</span>
                <span>{b.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card pad">
          <div className="row-cap"><span>SCROLLBAR · 8px</span><span>hover 加深</span></div>
          <div className="scroll-demo" tabIndex="0" aria-label="滚动条样式示例">
            {["奶油轨道 + 莓粉 30% 滑块", "圆角滑块，hover 加深至 60%", "8px 宽，不占内容区留白", "滚动条与卡片同一圆角语言", "暗色主题下轨道换 #352E48", "滑块在暗色下降为 40% 透明", "滚动条不参与页面转场动画", "始终 8px，不随断点变化"].map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            轨道 <span className="mono">--bg-sub</span>，滑块{" "}
            <span className="mono">rgba(214,51,132,.3)</span>，hover 提到 60%。
          </p>
        </div>
      </div>
    </Section>
  );
}

Object.assign(window, { LayoutSection });
