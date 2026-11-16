import { useEffect, useRef, useState } from "react";

export interface LoginDialogProps {
  /** 拿到 key 与服务端画好的二维码图；QQ 源带通道参数（码用哪个 App 扫） */
  start(channel?: string): Promise<{ key: string; qrImage: string }>;
  poll(key: string): Promise<{ code: number; loggedIn: boolean; message: string; qrImage?: string }>;
  /** 扫码提示（哪个 App 扫）；有 channels 时被选中通道的 hint 覆盖 */
  scanHint: string;
  /** 可选扫码通道（QQ 源）：显示切换标签，换通道会重新取码 */
  channels?: { id: string; name: string; hint: string }[];
  /** 手机号登录：发短信验证码（仅网易云源提供） */
  sendCaptcha?(phone: string): Promise<{ ok: boolean; message: string }>;
  /** 手机号登录：用验证码换登录态 */
  loginByCaptcha?(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  /** 音源名（网易云 / QQ 音乐）：标题展示「登录 {音源}」，弹层不知道也能跑 */
  sourceName?: string;
  onSuccess(): void;
  onClose(): void;
}

/**
 * 扫码登录面板（2026-11-10 重设计）：**不再是独立模态**，作为账号弹层右栏的内嵌面板挂载。
 *
 *   扫码 —— 最省事，但**手机端网易云 App 有自己的设备环境检测**，
 *           账号/设备被标记时会直接弹"检测到当前设备环境异常"。
 *   手机号 + 短信验证码 —— 不经过 App 的设备检测，是扫码被拦时的备选。
 *
 * 轮询用 setTimeout 链（ui/ 里禁 setInterval），只在 801/802 继续，
 * 用运行代次作废旧轮询。
 */
export function LoginDialog({ start, poll, scanHint, channels, sendCaptcha, loginByCaptcha, sourceName, onSuccess, onClose }: LoginDialogProps) {
  const [mode, setMode] = useState<"qr" | "phone">("qr");
  const [channel, setChannel] = useState(channels?.[0]?.id ?? "");

  const [qrImage, setQrImage] = useState("");
  const [qrNote, setQrNote] = useState("正在获取二维码…");
  const [stopped, setStopped] = useState(false);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneNote, setPhoneNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const timer = useRef<number | undefined>(undefined);
  const runId = useRef(0);

  const startRef = useRef(start);
  const pollRef = useRef(poll);
  const successRef = useRef(onSuccess);
  const closeRef = useRef(onClose);
  useEffect(() => {
    startRef.current = start;
    pollRef.current = poll;
    successRef.current = onSuccess;
    closeRef.current = onClose;
  }, [start, poll, onSuccess, onClose]);

  const begin = async (): Promise<void> => {
    runId.current += 1;
    const myRun = runId.current;
    const alive = (): boolean => runId.current === myRun;

    if (timer.current) window.clearTimeout(timer.current);
    setStopped(false);
    setQrImage("");
    setQrNote("正在获取二维码…");

    try {
      const session = await startRef.current(channel || undefined);
      if (!alive()) return;
      setQrImage(session.qrImage);
      setQrNote(channels?.find((c) => c.id === channel)?.hint ?? scanHint);

      const tick = async (): Promise<void> => {
        if (!alive()) return;
        try {
          const result = await pollRef.current(session.key);
          if (!alive()) return;
          setQrNote(result.message);
          // 页面自动刷新过二维码（QQ 源），同步更新图
          if (result.qrImage) setQrImage(result.qrImage);

          if (result.loggedIn) {
            successRef.current();
            return;
          }
          if (result.code !== 801 && result.code !== 802) {
            setStopped(true);
            return;
          }
        } catch (err) {
          if (!alive()) return;
          setQrNote(err instanceof Error ? err.message : "网络错误，稍后重试");
          setStopped(true);
          return;
        }
        timer.current = window.setTimeout(() => void tick(), 2000);
      };

      timer.current = window.setTimeout(() => void tick(), 2000);
    } catch (err) {
      if (!alive()) return;
      setQrNote(err instanceof Error ? err.message : "拿不到二维码");
      setStopped(true);
    }
  };

  // 挂载与换通道都重新取码（begin 内部用运行代次作废旧轮询）
  useEffect(() => {
    void begin();
    return () => {
      runId.current += 1;
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  // 切到手机号模式就停掉扫码轮询，别让它在后台白跑
  useEffect(() => {
    if (mode !== "phone") return;
    runId.current += 1;
    if (timer.current) window.clearTimeout(timer.current);
  }, [mode]);

  // 60 秒倒计时：ui/ 里禁 setInterval，用「状态驱动 + setTimeout」
  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  const send = async (): Promise<void> => {
    if (!sendCaptcha) return;
    if (!/^1\d{10}$/.test(phone)) {
      setPhoneNote("请输入 11 位手机号");
      return;
    }
    setBusy(true);
    try {
      const result = await sendCaptcha(phone);
      setPhoneNote(result.message);
      if (result.ok) setCountdown(60);
    } catch (err) {
      setPhoneNote(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!loginByCaptcha) return;
    if (code.trim().length < 4) {
      setPhoneNote("请输入收到的验证码");
      return;
    }
    setBusy(true);
    try {
      const result = await loginByCaptcha(phone, code.trim());
      setPhoneNote(result.message);
      if (result.ok) onSuccess();
    } catch (err) {
      setPhoneNote(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-pane">
      <header className="login-head">
        <span className="login-src">
          <i className="sig-dot" aria-hidden="true" />
          {sourceName ?? "账号"} · 未登录
        </span>
        <button type="button" className="login-close" aria-label="收起登录面板" onClick={() => closeRef.current()}>
          ×
        </button>
      </header>

      {mode === "qr" ? (
        <>
          {channels && channels.length > 1 ? (
            <div className="login-tabs">
              {channels.map((c) => (
                <button key={c.id} type="button" className={channel === c.id ? "on" : ""} onClick={() => setChannel(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
          <h3 className="login-title">扫码登录</h3>
          {/* 码卡：key 换一次 = 取码动画重播一次（显影 + 扫描光带扫一遍） */}
          <div className={`qr-card${stopped ? " off" : ""}`} key={qrImage || "empty"}>
            {qrImage ? <img className="qr" src={qrImage} alt="登录二维码" /> : <div className="qr qr--empty" />}
            {qrImage && !stopped ? <i className="qr-sweep" aria-hidden="true" /> : null}
          </div>
          <p className={`sig-status${stopped ? " off" : ""}`}>
            <span>{qrNote}</span>
          </p>
          <div className="login-ops">
            <button type="button" className="hot" onClick={() => void begin()}>
              {stopped ? "刷新" : "换一张"}
            </button>
            {sendCaptcha && loginByCaptcha ? (
              <button type="button" onClick={() => setMode("phone")}>
                手机号登录
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <h3 className="login-title">手机号登录</h3>
          <label className="login-field">
            <span>手机号</span>
            <input
              value={phone}
              inputMode="tel"
              placeholder="11 位手机号"
              onChange={(e) => setPhone(e.target.value.trim())}
            />
          </label>
          <div className="login-ops">
            <button type="button" onClick={() => void send()} disabled={busy || countdown > 0}>
              {countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}
            </button>
          </div>

          <label className="login-field">
            <span>验证码</span>
            <input value={code} inputMode="numeric" placeholder="短信里的验证码" onChange={(e) => setCode(e.target.value)} />
          </label>

          <p className={`sig-status${busy ? "" : " off"}`}>
            <span>{phoneNote || "等待发送验证码"}</span>
          </p>

          <div className="login-ops">
            <button type="button" className="hot" onClick={() => void submit()} disabled={busy}>
              登录
            </button>
            <button type="button" onClick={() => setMode("qr")}>
              返回扫码
            </button>
          </div>
        </>
      )}
    </div>
  );
}
