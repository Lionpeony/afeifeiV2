/* 07 · 彩蛋索引 */

function EggsSection() {
  const [on, setOn] = React.useState(() => new Set());
  const [stamping, setStamping] = React.useState(null);

  const toggle = (id) => {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setStamping(id);
    window.setTimeout(() => setStamping((s) => (s === id ? null : s)), 400);
  };

  const all = () => setOn(new Set(EGGS.map((e) => e.id)));
  const reset = () => setOn(new Set());

  return (
    <Section
      id="eggs"
      num="07"
      kicker="Easter Eggs"
      title="彩蛋索引"
      meta="17 项 · 集章卡入口在设置页"
    >
      <p className="lede">
        十七个彩蛋，全部可跳过、可忽略。集章卡的入口在设置页，盖满不是目标 ——
        它们只是让每次打开播放器时，稍微像走进一间有人气的排练室。
      </p>

      <div className="stampcard">
        {EGGS.map((e) => (
          <button
            type="button"
            className={"egg" + (stamping === e.id ? " stamping" : "")}
            key={e.id}
            data-on={String(on.has(e.id))}
            onClick={() => toggle(e.id)}
            aria-pressed={on.has(e.id)}
            title={e.note || e.name}
          >
            <span className="eno">{e.id}</span>
            <span className="chk"><IconCheck size={12} /></span>
            <span className="ename">{e.name}</span>
            {e.note ? <span className="small" style={{ fontSize: 9.5, lineHeight: 1.4 }}>{e.note}</span> : null}
          </button>
        ))}
      </div>

      <div className="egg-toolbar">
        <span className="egg-count">已盖章 <b>{String(on.size).padStart(2, "0")}</b> / 17</span>
        <span style={{ flex: 1 }}></span>
        <button type="button" className="btn small ghost" onClick={all}>全部盖章</button>
        <button type="button" className="btn small ghost" onClick={reset}>重置</button>
      </div>

      <div className="rule-grid" style={{ marginTop: 22 }}>
        <div className="card info-card">
          <div className="info-card-head"><b>冷却与边界</b><span className="tag line">永不阻塞</span></div>
          <p>
            E06 文案 5 首冷却；所有彩蛋动画 <span className="mono">pointer-events: none</span>，
            永不阻塞播放控件。E09 仅在夜间主题出现。
          </p>
        </div>
        <div className="card info-card">
          <div className="info-card-head"><b>盖章交互</b><span className="tag line">1.6 → 0.95 → 1</span></div>
          <p>
            点任意一格即可盖／撤章：卡体先放大到 1.14 再回落到 1，与拨片盖章同一套撞击帧节奏。
          </p>
        </div>
      </div>
    </Section>
  );
}

Object.assign(window, { EggsSection });
