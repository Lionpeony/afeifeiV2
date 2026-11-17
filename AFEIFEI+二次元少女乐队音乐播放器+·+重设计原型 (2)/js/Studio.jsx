/* ---------- 排练室 · 定时关闭 / 音质 / EQ ---------- */
const QUALITY_LEVELS = [
  { id: "standard", short: "标准", label: "标准音质", spec: "128 kbps · MP3", note: "流量省着点，排练室里也够用" },
  { id: "hq", short: "HQ", label: "高品质", spec: "320 kbps · MP3", note: "默认档，底鼓和贝斯不糊在一起" },
  { id: "lossless", short: "SQ", label: "无损", spec: "1411 kbps · FLAC", note: "耳返里能听出换弦的手感" },
  { id: "hires", short: "HR", label: "Hi-Res", spec: "24bit / 96kHz", note: "台侧监听才用得上，比较费带宽" }
];

const EQ_FREQS = ["60", "240", "1k", "4k", "12k"];
const EQ_PRESETS = [
  { id: "flat", name: "平直", bands: [0, 0, 0, 0, 0] },
  { id: "night", name: "夜练", bands: [-2, -1, 0, 1, 2] },
  { id: "vocal", name: "主唱", bands: [-1, 0, 2, 1, 0] },
  { id: "bass", name: "贝斯手", bands: [4, 2, 0, -1, 0] },
  { id: "phones", name: "耳机", bands: [1, 0, -1, 1, 2] }
];

const sleepLabel = (mode, minutes) => {
  if (mode === "song") return "播完这首就关灯";
  if (mode === "timer") return `${minutes} 分钟后关灯`;
  return "没有在倒计时";
};

const fmtLeft = s => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

/* 竖推子：一条可拖的 EQ 频段 */
function EqBand({ value, label, onChange }) {
  const ref = React.useRef(null);
  const drag = React.useRef(false);
  const val = Math.max(-6, Math.min(6, value));
  const pct = ((val + 6) / 12) * 100;

  const apply = e => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const k = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    onChange(Math.round((k * 12 - 6) * 2) / 2);
  };

  return (
    <div className="eqband">
      <span className="eqband__val" style={val === 0 ? undefined : undefined}>{val > 0 ? "+" + val : val}</span>
      <div className="eqband__track" ref={ref} role="slider" tabIndex={0}
        aria-label={"频段 " + label + " 赫兹"} aria-valuemin={-6} aria-valuemax={6} aria-valuenow={val}
        onPointerDown={e => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); apply(e); }}
        onPointerMove={e => { if (drag.current) apply(e); }}
        onPointerUp={() => { drag.current = false; }}
        onPointerCancel={() => { drag.current = false; }}
        onKeyDown={e => {
          if (e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(6, val + 0.5)); }
          if (e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(-6, val - 0.5)); }
        }}>
        <span className="eqband__mid"></span>
        {val >= 0 ? (
          <span className="eqband__fill" style={{ bottom: "50%", height: (pct / 2) + "%" }}></span>
        ) : (
          <span className="eqband__fill" style={{ top: "50%", height: ((100 - pct) / 2) + "%" }}></span>
        )}
        <span className="eqband__knob" style={{ top: (100 - pct) + "%" }}></span>
      </div>
      <span className="eqband__label">{label}</span>
    </div>
  );
}

function StudioDrawer() {
  const {
    studio, setStudio, sleep, startSleep, stopSleep, sleepLeft,
    quality, setQuality, eq, setEq, playing, source, toast
  } = useApp();
  const [tab, setTab] = React.useState(studio && studio.tab ? studio.tab : "sleep");

  React.useEffect(() => {
    if (studio && studio.tab) setTab(studio.tab);
  }, [studio]);

  React.useEffect(() => {
    const fn = e => { if (e.key === "Escape") setStudio(null); };
    if (studio) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [studio, setStudio]);

  if (!studio) return null;
  const total = (sleep.minutes || 30) * 60;
  const ratio = sleep.mode === "timer" && total ? Math.max(0, Math.min(100, (1 - sleepLeft / total) * 100)) : 0;

  const setBand = i => v => {
    const bands = eq.bands.slice();
    bands[i] = v;
    setEq({ preset: "custom", bands });
  };

  const pickPreset = p => setEq({ preset: p.id, bands: p.bands.slice() });

  return (
    <React.Fragment>
      <div className="studio-mask" onClick={() => setStudio(null)}></div>
      <aside className="studio" role="dialog" aria-modal="true" aria-label="排练室">
        <div className="studio__head">
          <div className="studio__kicker">STUDIO · 台侧调音</div>
          <h2 className="studio__title">排练室</h2>
          <button className="icon-btn studio__close" onClick={() => setStudio(null)} title="收起" aria-label="收起排练室">
            <IconX size={16} />
          </button>
        </div>

        <div className="studio__tabs" role="tablist">
          {[["sleep", "定时关闭"], ["quality", "音质"], ["eq", "均衡器"]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id}
              className={"studio__tab" + (tab === id ? " is-on" : "")} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        <div className="studio__body">
          {tab === "sleep" && (
            <React.Fragment>
              <div className="sleep-now">
                <div className="sleep-now__ring" style={{ "--p": ratio + "%" }}>
                  <b>{sleep.mode === "off" ? "--:--" : sleep.mode === "song" ? "曲终" : fmtLeft(sleepLeft)}</b>
                </div>
                <div className="sleep-now__text">
                  <b>{sleepLabel(sleep.mode, sleep.minutes)}</b>
                  <span>{sleep.mode === "off" ? "挑一个时长，到点我会把灯关掉。" : "还剩 " + fmtLeft(sleepLeft) + "，到点音量先渐弱再暂停。"}</span>
                </div>
              </div>

              <div className="studio__label">倒计时</div>
              <div className="sleep-opts">
                {[15, 30, 60].map(m => (
                  <button key={m} className={"sleep-opt" + (sleep.mode === "timer" && sleep.minutes === m ? " is-on" : "")}
                    onClick={() => startSleep(m)}>
                    <b>{m} 分钟</b>
                    <span>{m === 15 ? "睡前一节" : m === 30 ? "一张专辑" : "整场排练"}</span>
                  </button>
                ))}
                <button className={"sleep-opt" + (sleep.mode === "song" ? " is-on" : "")} onClick={() => startSleep("song")}>
                  <b>播完这首</b>
                  <span>唱完再关</span>
                </button>
              </div>

              <div className="studio__label">当前</div>
              <button className={"btn btn-sm " + (sleep.mode === "off" ? "btn-ghost" : "btn-soft")}
                onClick={stopSleep} disabled={sleep.mode === "off"}>
                {sleep.mode === "off" ? "没有在倒计时" : "取消定时"}
              </button>

              <div className="studio__note">
                <IconMoon size={13} />
                <span>原型内不会真的关掉系统，只把播放暂停一次。真实客户端可以配合系统睡眠。</span>
              </div>
            </React.Fragment>
          )}

          {tab === "quality" && (
            <React.Fragment>
              <div className="studio__label">播放音质 · {SOURCES[source].name}</div>
              <div className="q-list">
                {QUALITY_LEVELS.map(q => (
                  <button key={q.id} className={"q-opt" + (quality === q.id ? " is-on" : "")}
                    onClick={() => { setQuality(q.id); toast(`音质切到「${q.label}」`, { icon: "check" }); }}>
                    <span className="q-opt__badge">{q.short}</span>
                    <span className="q-opt__text">
                      <b>{q.label}</b>
                      <span>{q.spec} · {q.note}</span>
                    </span>
                    {quality === q.id && <IconCheck size={15} className="q-opt__tick" />}
                  </button>
                ))}
              </div>
              <div className="studio__note">
                <IconCloud size={13} />
                <span>音质跟着音源走。切到没登录的音源时，会退回标准档；离线包里的曲目按已下载的音质播放。</span>
              </div>
            </React.Fragment>
          )}

          {tab === "eq" && (
            <React.Fragment>
              <div className="studio__label">预设</div>
              <div className="eq__presets">
                {EQ_PRESETS.map(p => (
                  <button key={p.id} className={"eq__preset" + (eq.preset === p.id ? " is-on" : "")}
                    onClick={() => pickPreset(p)}>{p.name}</button>
                ))}
              </div>

              <div className="studio__label">频段 · 增益</div>
              <div className="eq__stage">
                <div className="eq__bands">
                  {EQ_FREQS.map((f, i) => (
                    <EqBand key={f} label={f} value={eq.bands[i]} onChange={setBand(i)} />
                  ))}
                </div>
                <div className={"eq__meter" + (playing ? " is-live" : "")} aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => (
                    <i key={i} style={{
                      animationDelay: (i * 90) + "ms",
                      height: (16 + ((i * 37) % 60)) + "%"
                    }}></i>
                  ))}
                </div>
              </div>

              <div className="eq__foot">
                <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {eq.preset === "custom" ? "手调中 · 台侧听见的低音比前排多一格" : "预设：" + (EQ_PRESETS.find(p => p.id === eq.preset) || {}).name}
                </span>
                <button className="eq__reset" onClick={() => pickPreset(EQ_PRESETS[0])}>
                  <IconRefresh size={12} />重置
                </button>
              </div>

              <div className="studio__note">
                <IconVolume size={13} />
                <span>原型没有真实音频内核，推子不会改变声音；接线后这里会挂到 Web Audio 的 BiquadFilter 链上。</span>
              </div>
            </React.Fragment>
          )}
        </div>
      </aside>
    </React.Fragment>
  );
}

Object.assign(window, { StudioDrawer, QUALITY_LEVELS, EQ_PRESETS, EQ_FREQS });
