/* 05 · 组件状态 */

function ComponentsSection() {
  return (
    <Section
      id="components"
      num="05"
      kicker="Component States"
      title="组件状态"
      meta="5 态 · 8 条动效规格"
    >
      <p className="lede">
        交互主色 <span className="mono">--brand-pink-600</span> 承担全部可点击面。hover 只加深不提亮，
        保证白字对比不跌破 4.5:1；按下时下移 2px，给出可感知的物理反馈。
      </p>

      <SubHead num="5.1" title="状态矩阵" desc="亮色主题组件样本 · 白字底实测 4.50:1" />
      <div className="state-grid">
        {COMPONENT_STATES.map((s) => (
          <div className="state-cell" key={s.key}>
            <button type="button" className={"pbtn " + s.key} disabled={s.key === "disabled"} tabIndex={s.key === "focus" ? 0 : -1}>
              播放全部
            </button>
            <span className="lbl">{s.label}</span>
            <span className="small" style={{ fontSize: 10.5, lineHeight: 1.5 }}>{s.def}</span>
          </div>
        ))}
      </div>
      <Note>hover 加深不提亮 —— 一亮白字就掉对比度，这是拿计算换来的规矩。</Note>

      <SubHead num="5.2" title="关键动效规格" desc="实现时逐条对照" />
      <div className="card" style={{ padding: "6px 14px 8px" }}>
        <table className="spec-table">
          <thead>
            <tr>
              <th scope="col">场景</th>
              <th scope="col">参数</th>
              <th scope="col">曲线</th>
            </tr>
          </thead>
          <tbody>
            {KEY_MOTIONS.map((m) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td>{m.spec}</td>
                <td className="mono">{m.curve}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SubHead num="5.3" title="进度条分层" desc="结构示意" />
      <div className="card pad">
        <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--ink-soft-2)", overflow: "hidden" }}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "63%", background: "rgba(255,209,102,.55)" }}></span>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "41%", background: "var(--accent)" }}></span>
        </div>
        <div style={{ display: "flex", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
          <span className="small"><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "var(--accent)", marginRight: 6 }}></i>莓粉进度 · 已播放</span>
          <span className="small"><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "rgba(255,209,102,.55)", marginRight: 6 }}></i>暖黄缓冲层 · 12% 不透明度</span>
        </div>
        <p className="small" style={{ marginTop: 10 }}>
          缓冲层是唯一允许使用暖黄的大面积元素；它永远不作为文字色出现。
        </p>
      </div>
    </Section>
  );
}

Object.assign(window, { ComponentsSection });
