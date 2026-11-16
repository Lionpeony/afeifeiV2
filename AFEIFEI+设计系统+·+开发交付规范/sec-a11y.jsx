/* 08 · 无障碍 */

function A11ySection() {
  return (
    <Section
      id="a11y"
      num="08"
      kicker="Accessibility"
      title="无障碍硬指标"
      meta="4 条 · 实算达标"
    >
      <p className="lede">
        对比度不是审美偏好，是可验证的硬指标。本文档每个交互面 Token 都按 WCAG 相对亮度公式算过，
        未达标的色（pink-400 作白字底 2.68:1）被明确禁止用于承载文字。
      </p>

      <div className="check-grid">
        {A11Y.map((a) => (
          <div className="check" key={a.title}>
            <IconCheck size={15} />
            <div>
              <b>{a.title}</b>
              <p>{a.text}</p>
            </div>
          </div>
        ))}
      </div>

      <SubHead num="8.1" title="键盘路径" desc="三处全局按键" />
      <div className="card pad kbd-card">
        <div className="kbd-list">
          <div className="kbd-row"><span className="kbd">/</span> 聚焦搜索框</div>
          <div className="kbd-row"><span className="kbd">Esc</span> 关闭当前浮层 / 退出全屏播放</div>
          <div className="kbd-row"><span className="kbd">Tab</span> 焦点顺序按「侧栏 → 内容 → 播放栏」推进</div>
        </div>
        <div className="kbd-focus">
          <span className="kicker">Focus Visible</span>
          <p className="small">用 Tab 键聚焦这个链接，看到统一的描边环。</p>
          <a href="#a11y" className="btn ghost small" style={{ padding: "8px 14px" }}>播放队列（示例焦点）</a>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-secondary)" }}>0 0 0 3px rgba(214,51,132,.35)</span>
        </div>
      </div>
    </Section>
  );
}

Object.assign(window, { A11ySection });
