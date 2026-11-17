/* ---------- 扫码登录（乐迷会员卡） ---------- */
const QRCode = ({ seed = "afeifei", size = 208 }) => {
  const n = 21;
  const h1 = hashStr(seed);
  const h2 = hashStr(seed + "·afeifei");
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue;
      if (x === 6 || y === 6) {           /* 定位用的时序线 */
        if ((x + y) % 2 === 0) cells.push([x, y]);
        continue;
      }
      const a = (h1 >>> ((x * 7 + y * 11) % 31)) & 1;
      const b = (h2 >>> ((x * 13 + y * 5) % 29)) & 1;
      if (a ^ b) cells.push([x, y]);
    }
  }
  const Finder = ({ fx, fy }) => (
    <g>
      <rect x={fx} y={fy} width="7" height="7" rx="1.6" />
      <rect x={fx + 1} y={fy + 1} width="5" height="5" fill="#fff" />
      <rect x={fx + 2} y={fy + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg className="qr" width={size} height={size} viewBox="-2 -2 25 25" role="img" aria-label="模拟二维码">
      <rect x="-2" y="-2" width="25" height="25" fill="#fff" />
      <g fill="#2E2028">
        {cells.map(([x, y], i) => <rect key={i} x={x} y={y} width="1" height="1" />)}
        <Finder fx={0} fy={0} />
        <Finder fx={n - 7} fy={0} />
        <Finder fx={0} fy={n - 7} />
      </g>
    </svg>
  );
};

const SCAN_QP = new URLSearchParams(location.search);

const SCAN_STEPS = [
  { key: "wait", label: "打开手机扫一扫", hint: "扫左边这张票上的码" },
  { key: "scanned", label: "在手机上确认登录", hint: "手机上会弹一个确认" },
  { key: "ok", label: "歌单和推荐同步过来", hint: "大概两秒钟" }
];

function ScanLogin() {
  const { loginSrc, closeScan, linkAccount, accounts, reduce, onoma, toast } = useApp();
  const src = loginSrc ? SOURCES[loginSrc] : null;
  const forced = SCAN_QP.get("scanstate");
  const [state, setState] = React.useState(forced || "wait");
  const [mode, setMode] = React.useState(SCAN_QP.get("scanmode") === "code" ? "code" : "qr");
  const [code, setCode] = React.useState("");
  const timers = React.useRef([]);

  React.useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState(forced || "wait");
    setMode(SCAN_QP.get("scanmode") === "code" ? "code" : "qr");
    setCode("");
    if (!loginSrc || forced) return;
    if (accounts[loginSrc]) return;
    /* 模拟手机扫码：扫到之后停在“待确认”，不给自动登录，等人点一下 */
    timers.current.push(setTimeout(() => {
      setState(s => (s === "wait" ? "scanned" : s));
      if (window.Sound) Sound.pluck();
    }, 2000));
    return () => timers.current.forEach(clearTimeout);
  }, [loginSrc]);

  React.useEffect(() => {
    if (state !== "ok" || SCAN_QP.get("scanstate")) return;
    const t = setTimeout(() => closeScan(), 1500);
    return () => clearTimeout(t);
  }, [state, closeScan]);

  if (!loginSrc) return null;

  const confirm = () => {
    setState("ok");
    linkAccount(loginSrc);
    onoma("ポンッ", { tone: "coral", x: window.innerWidth / 2 + 120, y: window.innerHeight / 2 - 60 });
  };

  const stepIndex = state === "wait" ? 0 : state === "scanned" ? 1 : 3;

  return (
    <div className="scan-ov" role="dialog" aria-modal="true" aria-label={"登录" + src.name} onClick={closeScan}>
      <div className={"scan" + (state === "ok" ? " is-ok" : "") + (mode === "code" ? " is-code" : "")}
        onClick={e => e.stopPropagation()}>
        <span className="scan__strip" aria-hidden="true"></span>
        <span className="scan__hole" aria-hidden="true"></span>

        <div className="scan__head">
          <span className="scan__brand">
            <b>AFEIFEI</b>
            <span>FAN CLUB · 会员登记</span>
          </span>
          <span className="scan__no">No.{String(hashStr(src.id + "no") % 9000 + 1000)}</span>
        </div>

        <div className={"scan__body" + (mode === "code" ? " is-code" : "")}>
          <div className="scan__qrbox">
            <div className={"scan__qr" + (state === "ok" ? " is-done" : "")}>
              <div className="scan__corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
              <QRCode seed={src.id + "·" + src.account + "·afeifei"} size={196} />
              {state !== "ok" && <span className="scan__laser" aria-hidden="true"></span>}
              <span className="scan__mark" aria-hidden="true"><IconPick size={34} /></span>
            </div>
            {state === "ok" && <span className="scan__stamp">已登记</span>}
            <span className="scan__qrfoot hand">
              {state === "ok" ? "登记完成 · 电子票已存" : "扫不出东西，它是画出来的"}
            </span>
          </div>

          <div className="scan__side">
            <span className="scan__eyebrow">{mode === "qr" ? "扫码登录" : "验证码登录"}</span>
            <h2 className="scan__title" style={{ color: src.tone }}>{src.name}</h2>
            <span className="scan__account">{src.account}</span>

            {mode === "qr" ? (
              <>
                <ol className="scan__steps">
                  {SCAN_STEPS.map((st, i) => (
                    <li key={st.key}
                      className={"scan__step" + (i < stepIndex ? " is-done" : i === stepIndex ? " is-now" : "")}>
                      <span className="scan__step-no">
                        {i < stepIndex ? <IconCheck size={11} /> : i + 1}
                      </span>
                      <span className="scan__step-text">
                        <b>{st.label}</b>
                        <span>{st.hint}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="scan__foot">
                  {state === "ok" ? (
                    <span className="scan__ok"><IconCheck size={14} />同步完成 · 歌单 5 个 / 每日推荐 33 首</span>
                  ) : state === "scanned" ? (
                    <button className="btn btn-primary btn-sm scan__confirm" onClick={confirm}>
                      <IconCheck size={13} />模拟在手机上确认
                    </button>
                  ) : (
                    <span className="scan__waiting">
                      <i></i><i></i><i></i><span className="hand">等着手机扫过去…</span>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="scan__tip">收一条短信验证码，作用跟扫码一样，只是少了那张票。</p>
                <div className="scan__code">
                  {[0, 1, 2, 3].map(i => (
                    <span key={i} className={"scan__cell" + (code.length === i ? " is-focus" : "") + (code[i] ? " is-fill" : "")}>
                      {code[i] || ""}
                    </span>
                  ))}
                  <input className="scan__codeinput" value={code} inputMode="numeric" autoFocus
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setCode(v);
                      if (v.length === 4) setTimeout(confirm, 220);
                    }}
                    aria-label="四位验证码" />
                </div>
                <span className="scan__tip hand">随便按四个数字就当你收到了</span>
              </>
            )}

            <div className="scan__switch">
              <button className="scan__link" onClick={() => setMode(m => m === "qr" ? "code" : "qr")}>
                {mode === "qr" ? "扫码不方便？用验证码" : "还是扫码吧"}
              </button>
            </div>
          </div>
        </div>

        <div className="scan__perf" aria-hidden="true"></div>
        <div className="scan__footbar">
          <span className="scan__note">原型内的登录是模拟的，不会连到平台。</span>
          <button className="scan__close" onClick={closeScan}>
            收起<IconX size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { QRCode, ScanLogin });
