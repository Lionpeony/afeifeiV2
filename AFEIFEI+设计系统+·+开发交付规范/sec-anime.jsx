/* 06 · 二次元表现层 */

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0; // 无符号右移：避免负索引历史 bug
}

const COVER_PALETTES = [
  ["#FF9EBB", "#B8A9E8", "#7EC8E3"],
  ["#FFD166", "#FF9EBB", "#B8A9E8"],
  ["#7EC8E3", "#B8A9E8", "#FF9EBB"],
  ["#FFC66E", "#7EC8E3", "#B8A9E8"]
];

function CoverShape({ seed }) {
  const kind = seed % 4;
  const common = { stroke: "#3D2B39", strokeWidth: 1.2, fill: "none", opacity: 0.34, strokeLinecap: "round", strokeLinejoin: "round" };
  if (kind === 0) {
    return (
      <g {...common}>
        <circle cx="54" cy="100" r="22" />
        <circle cx="54" cy="100" r="7" />
        <path d="M70 86 L98 44" strokeWidth="3.4" />
        <rect x="94" y="34" width="11" height="13" rx="2" transform="rotate(28 99 40)" />
      </g>
    );
  }
  if (kind === 1) {
    return (
      <g {...common}>
        <path d="M70 44c14 9 25 18 25 31 0 13-11 25-25 40-14-15-25-27-25-40 0-13 11-22 25-31z" />
      </g>
    );
  }
  if (kind === 2) {
    return (
      <g {...common}>
        <path d="M70 40l8 25 26 1-21 16 7 25-20-15-20 15 7-25-21-16 26-1z" />
      </g>
    );
  }
  return (
    <g {...common}>
      <circle cx="50" cy="104" r="10" />
      <circle cx="88" cy="95" r="10" />
      <path d="M60 104V52l38-9v52" />
      <path d="M60 64l38-9" />
    </g>
  );
}

function Cover({ title, seed, live }) {
  const h = hashStr(title);
  const pal = COVER_PALETTES[h % COVER_PALETTES.length];
  const angle = 100 + (h % 6) * 22;
  return (
    <div className="cover" style={{ background: `linear-gradient(${angle}deg, ${pal[0]}, ${pal[1]} 55%, ${pal[2]})`, outline: live ? "1px dashed var(--pink-400)" : "none", outlineOffset: live ? 3 : 0 }}>
      <svg className="art" viewBox="0 0 140 140" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <CoverShape seed={h} />
        <rect x="-10" y="20" width="70" height="15" fill="#FFFFFF" opacity="0.4" transform={`rotate(-18 25 27)`} />
      </svg>
      <span className="c-title">{title}</span>
    </div>
  );
}

function AnimeSection() {
  const [onoma, setOnoma] = React.useState(null);
  const [burst, setBurst] = React.useState(0);
  const [title, setTitle] = React.useState("无人知晓的和弦");

  const pop = (o) => {
    const rot = (Math.random() * 12 - 6).toFixed(1) + "deg";
    setOnoma({ word: o.word, mean: o.mean, k: Date.now(), rot });
  };

  return (
    <Section
      id="anime"
      num="06"
      kicker="Anime Expression Layer"
      title="二次元表现层"
      meta="5 组表现 Token"
    >
      <p className="lede">
        手写字体、集中线、贴纸视差与程序化封面构成乐队的“手作感”。它们是纯装饰层：
        <span className="mono"> pointer-events: none </span>
        是默认约定，且永不阻塞播放控件。
      </p>

      <div className="anime-grid">
        <div className="card anime-card">
          <h4>拟声词 <span className="tag line">760ms 弹出淡出</span></h4>
          <div className="onoma-stage">
            {onoma ? (
              <span className="onoma" key={onoma.k} style={{ "--rot": onoma.rot }}>{onoma.word}</span>
            ) : (
              <span className="small">点下面的词，看它怎么弹出来</span>
            )}
            <span className="onoma-hint">手写体 + 2px 描边 + 旋转 −6°~6°</span>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {ANIME_LAYER.onomatopoeia.map((o) => (
              <button type="button" className="btn small ghost" key={o.word} onClick={() => pop(o)}>
                {o.word} <span style={{ opacity: .6, fontSize: 10 }}>{o.mean}</span>
              </button>
            ))}
          </div>
          <p className="small">跟音效开关联动；关闭音效时拟声词不出现。</p>
        </div>

        <div className="card anime-card">
          <h4>集中线 <span className="tag line">0.6s · 峰值 0.12</span></h4>
          <div className="onoma-stage" style={{ overflow: "hidden" }}>
            <div className={"burst" + (burst ? " run" : "")} key={"b" + burst}></div>
            <button type="button" className="btn small" onClick={() => setBurst((b) => b + 1)}>
              触发幕布 / 暗号解锁
            </button>
            <span className="onoma-hint">repeating-conic-gradient</span>
          </div>
          <p className="small">
            幕布、秘密 live、暗号解锁时出现；0.6s 结束，峰值不透明度 0.12，永远不接管指针事件。
          </p>
        </div>

        <div className="card anime-card">
          <h4>贴纸微视差 <span className="tag line">220ms</span></h4>
          <div className="parallax" style={{ marginTop: 4 }}>
            <div className="p-cover"></div>
            <span className="sticker">
              <svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="21" fill="#FFF8F5" stroke="#FFD166" strokeWidth="1.4" strokeDasharray="3 3" />
                <g transform="translate(12 12) scale(1)">
                  <path d="M12 2.6c3.6 2.4 6.4 4.6 6.4 8.2 0 3.2-2.9 6.4-6.4 10.6-3.5-4.2-6.4-7.4-6.4-10.6 0-3.6 2.8-5.8 6.4-8.2z" fill="#FF6B9D" stroke="#3D2B39" strokeOpacity=".2" />
                </g>
              </svg>
            </span>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>hover 这张卡</div>
            <p className="small" style={{ marginTop: 4, maxWidth: "60%" }}>
              卡体 scale(1.008)，贴纸反向位移 −1.5px，220ms。
            </p>
          </div>
          <p className="small">贴纸永远贴住卡片边缘，不跟着卡体放大 —— 一张贴纸被撕下来过，就会有厚度。</p>
        </div>

        <div className="card anime-card">
          <h4>E17 吉祥物路过 <span className="tag line">9s · 每 session 1–2 次</span></h4>
          <div style={{ marginTop: 14 }}>
            <div className="mascot-band">
              <span className="b-arrow"></span>
              <span className="b-tag">9s</span>
            </div>
            <div className="row-cap" style={{ marginTop: 8 }}>
              <span>贴底缘 24px 高度带</span>
              <span>间隔 &gt; 30min</span>
            </div>
          </div>
          <p className="small">
            只走底缘一条 24px 的带子，横穿 9s。每 session 出现 1–2 次且间隔大于 30 分钟，绝不在播放控件附近出现。
          </p>
        </div>

        <div className="card anime-card" style={{ gridColumn: "1 / -1" }}>
          <h4>程序化封面 <span className="tag line">hash 歌名 → 三色渐变 + 固定组合</span></h4>
          <div className="hash-row">
            <input
              className="hash-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入歌名，实时生成封面"
              aria-label="输入歌名以生成封面"
            />
            <span className="hash-out">hash {hashStr(title)}</span>
            <span className="tag line">同名同图</span>
          </div>
          <div className="cover-grid" style={{ marginTop: 12 }}>
            {["雨のリハーサル", "夜明けまでのセットリスト", "放課後のアンプ"].map((t) => (
              <Cover key={t} title={t} />
            ))}
            <Cover title={title || "未命名"} live />
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            三色渐变底 + 吉他 / 拨片 / 星星 / 音符 / 胶带的固定组合，同一歌名永远得到同一张图。
            取模必须用无符号右移：有符号右移在负 hash 上会产生负索引，这是修过的历史 bug。
          </p>
          <div className="code-block" style={{ marginTop: 10, fontSize: 11 }}>
            <span className="c">// hash 取模：无符号右移</span>{"\n"}
            <span className="k">const</span> h = <span className="s">hashStr</span>(title);{"\n"}
            <span className="k">const</span> i = (h <span className="v">{">>>"}</span> 0) % palettes.length;{"\n"}
            <span className="c">// 错误写法：h % palettes.length —— 负值会取到 undefined</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

Object.assign(window, { AnimeSection });
