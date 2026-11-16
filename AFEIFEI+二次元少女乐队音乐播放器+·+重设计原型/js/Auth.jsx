/* ---------- 入场登记（未登录第一屏） ---------- */
const FakeQR = ({ seed = "afeifei", size = 96 }) => {
  const n = 11;
  const h = hashStr(seed);
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const finder = (x < 4 && y < 4) || (x > n - 5 && y < 4) || (x < 4 && y > n - 5);
      if (finder) continue;
      const bit = (h >>> ((x * 5 + y * 7) % 29)) & 1;
      if (bit) cells.push([x, y]);
    }
  }
  const Finder = ({ fx, fy }) => (
    <g>
      <rect x={fx} y={fy} width="4" height="4" rx="1" />
      <rect x={fx + 1} y={fy + 1} width="2" height="2" fill="#fff" />
    </g>
  );
  return (
    <svg className="auth-src__qr" width={size} height={size} viewBox={"0 0 " + n + " " + n} aria-hidden="true">
      <rect width={n} height={n} fill="#fff" />
      <g fill="#2E2028">
        {cells.map(([x, y], i) => <rect key={i} x={x} y={y} width="1" height="1" />)}
        <Finder fx={0} fy={0} /><Finder fx={n - 4} fy={0} /><Finder fx={0} fy={n - 4} />
      </g>
    </svg>
  );
};

function Auth() {
  const { accounts, linkAccount, enterApp, skipLogin } = useApp();
  const linkedAny = Object.values(accounts).some(Boolean);

  return (
    <div className="auth" data-screen-label="入场登记">
      <span className="auth__glow auth__glow--a"></span>
      <span className="auth__glow auth__glow--b"></span>

      <div className="auth__ticket">
        <Tape w={96} rot={-2.2} style={{ top: -13, left: "50%", marginLeft: -48 }} />
        <div className="auth__top">
          <span className="eyebrow">AFEIFEI · 后台入口 · NO. 001</span>
          <span className="auth__no">ADMIT ONE</span>
        </div>

        <h1 className="display auth__title">
          今晚的演出<br />需要<span className="marker">你的门票</span>
        </h1>
        <p className="body auth__lead">
          这个播放器本身不带音乐。登记一个音源账号，歌单和推荐才从你那边取过来。
          <span className="hand auth__lead-hand">（原型里是模拟登录，点一下就成）</span>
        </p>

        <div className="auth__sources">
          {Object.values(SOURCES).map(src => {
            const on = accounts[src.id];
            return (
              <button key={src.id}
                className={"auth-src" + (on ? " is-linked" : "")}
                onClick={() => linkAccount(src.id)}
                style={{ "--src": src.tone }}>
                <span className="auth-src__bar" style={{ background: src.tone }}></span>
                <span className="auth-src__head">
                  <span className="auth-src__dot" style={{ background: src.tone }}></span>
                  <span className="auth-src__name">{src.name}</span>
                  <span className="auth-src__state">{on ? "已登记" : "未登录"}</span>
                </span>
                <span className="auth-src__body">
                  <FakeQR seed={src.id + "afeifei"} size={94} />
                  <span className="auth-src__meta">
                    {on ? (
                      <>
                        <span className="auth-src__account">{src.account}</span>
                        <span className="auth-src__line">歌单 5 个 · 每日推荐 33 首</span>
                        <span className="auth-src__ok"><IconCheck size={13} /> 数据已同步</span>
                      </>
                    ) : (
                      <>
                        <span className="auth-src__line">扫码登录 / 账号密码</span>
                        <span className="auth-src__hint hand">点这张卡 = 模拟登录成功</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="auth__foot">
          <button className="btn btn-primary auth__enter" disabled={!linkedAny}
            onClick={enterApp}>
            {linkedAny ? "拉开幕布，进后台" : "先登记一个账号"}
            <IconArrowRight size={15} />
          </button>
          <button className="auth__skip hand" onClick={skipLogin}>
            先随便逛逛（不要账号）
          </button>
        </div>

        <span className="auth__fine">所有曲目、歌单、榜单均为虚构演示数据 · 不连接真实音乐平台</span>
      </div>
    </div>
  );
}

Object.assign(window, { Auth, FakeQR });
