/* 02 · 字体与字阶 */

function TypeSection() {
  return (
    <Section
      id="type"
      num="02"
      kicker="Typography"
      title="字体与字阶"
      meta="3 字体栈 · 6 层字阶"
    >
      <p className="lede">
        三个字体栈各守一块地盘：标题用站酷小薇，正文用系统黑体，手写体只出现在拟声词、便签、批注与印章上。
        字号来源全站唯一 —— 六层阶梯之外不新增字号。
      </p>

      <SubHead num="2.1" title="字体栈" desc="手写体有硬边界" />
      <div className="stack-grid">
        {FONT_STACKS.map((f) => (
          <div className="card stack-card" key={f.token} data-comment-anchor={"font-" + f.token.replace("--font-", "")}>
            <span className="tag line">{f.label}</span>
            <div className="stack-sample" style={f.sampleStyle}>{f.sample}</div>
            <div className="stack-code">{f.code}</div>
            {f.note ? <div className="stack-note">{f.note}</div> : null}
          </div>
        ))}
      </div>
      <Note rot="r">歌名正文一律 --font-body，手写体一越界，可读性就塌了。</Note>

      <SubHead num="2.2" title="六层字阶" desc="全站唯一字号来源 · 实际字号渲染" />
      <div className="scale-list">
        {TYPE_SCALE.map((s) => (
          <div className="scale-row" key={s.token}>
            <div className="scale-meta">
              <span className="scale-token">{s.token}</span>
              <span className="scale-spec">{s.size} · {s.weight}</span>
              <span className="scale-spec" style={{ color: "var(--text-secondary)" }}>{s.use}</span>
            </div>
            <div
              className="scale-sample"
              style={{
                fontSize: s.px,
                lineHeight: s.lh + "px",
                fontWeight: s.weight,
                letterSpacing: s.caps ? ".08em" : undefined
              }}
            >
              {s.sample}
            </div>
          </div>
        ))}
      </div>

      <SubHead num="2.3" title="排版规则" desc="三条硬规则" />
      <div className="rule-grid">
        <div className="card info-card">
          <div className="info-card-head">
            <b>数字统一等宽</b>
            <span className="tag line">tabular-nums</span>
          </div>
          <p>时长、序号、进度时间全部使用等宽数字，滚动时数字不跳宽。</p>
          <div className="ellipsis-demo" style={{ marginTop: 12 }}>
            <div className="ellipsis-line">
              <span className="n">01</span>
              <span className="t">雨のリハーサル</span>
              <span className="d mono">03:47</span>
            </div>
            <div className="ellipsis-line">
              <span className="n">02</span>
              <span className="t">夜明けまでのセットリスト</span>
              <span className="d mono">04:12</span>
            </div>
            <div className="ellipsis-line">
              <span className="n">03</span>
              <span className="t">放課後のアンプ</span>
              <span className="d mono">02:58</span>
            </div>
          </div>
        </div>
        <div className="card info-card">
          <div className="info-card-head">
            <b>溢出与分隔</b>
            <span className="tag line">ellipsis</span>
          </div>
          <p>单行溢出用 ellipsis，hover 出全文 tooltip；多艺人不折行，以「 / 」分隔。</p>
          <div className="ellipsis-demo" style={{ marginTop: 12 }}>
            <div className="ellipsis-line">
              <span className="t" title="小春 / 灯 / 立希 / 素世 / 睦">小春 / 灯 / 立希 / 素世 / 睦 / 乐奈 / 初华 / 若麦 / 海铃 / 喵梦</span>
            </div>
            <p className="small" style={{ marginTop: 2 }}>hover 查看全文</p>
          </div>
        </div>
        <div className="card info-card">
          <div className="info-card-head">
            <b>中英混排</b>
            <span className="tag line">+0.05em</span>
          </div>
          <p>中日 / 中西混排统一 letter-spacing +0.05em，避免字面挤在一起。</p>
          <div style={{ marginTop: 10, fontSize: 14, letterSpacing: ".05em" }}>
            Setlist 第 3 幕 · Side A 40:12
          </div>
        </div>
        <div className="card info-card">
          <div className="info-card-head">
            <b>表头与徽标</b>
            <span className="tag line">caption / micro</span>
          </div>
          <p>
            表头用 <span className="mono">--fs-caption</span> 再加{" "}
            <span className="mono">letter-spacing .08em</span>；徽标与音源标签用{" "}
            <span className="mono">--fs-micro</span>。
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
            <span className="tag">VIP</span>
            <span className="tag" style={{ color: "#C20C0C" }}>网易云</span>
            <span className="tag" style={{ color: "#31C27C" }}>QQ音乐</span>
            <span className="tag line">HI-RES</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

Object.assign(window, { TypeSection });
