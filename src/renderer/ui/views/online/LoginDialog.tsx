import { useEffect, useRef, useState } from "react";

export interface LoginDialogProps {
  /** 拿到 key 与服务端画好的二维码图 */
  start(): Promise<{ key: string; qrImage: string }>;
  poll(key: string): Promise<{ code: number; loggedIn: boolean; message: string; qrImage?: string }>;
  /** 扫码提示（哪个 App 扫） */
  scanHint: string;
  /** 手机号登录：发短信验证码（仅网易云源提供） */
  sendCaptcha?(phone: string): Promise<{ ok: boolean; message: string }>;
  /** 手机号登录：用验证码换登录态 */
  loginByCaptcha?(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  onSuccess(): void;
  onClose(): void;
}

/**
 * 登录弹层，两种方式：
 *
 *   扫码 —— 最省事，但**手机端网易云 App 有自己的设备环境检测**，
 *           账号/设备被标记时会直接弹"检测到当前设备环境异常"。
 *   手机号 + 短信验证码 —— 不经过 App 的设备检测，是扫码被拦时的备选。
 *
 * 轮询用 setTimeout 链（ui/ 里禁 setInterval），只在 801/802 继续，
 * 用运行代次作废旧轮询。
 */
export function LoginDialog({ start, poll, scanHint, sendCaptcha, loginByCaptcha, onSuccess, onClose }: LoginDialogProps) {
  const [mode, setMode] = useState<"qr" | "phone">("qr");

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
  useEffect(() => {
    startRef.current = start;
    pollRef.current = poll;
    successRef.current = onSuccess;
  }, [start, poll, onSuccess]);

  const begin = async (): Promise<void> => {
    runId.current += 1;
    const myRun = runId.current;
    const alive = (): boolean => runId.current === myRun;

    if (timer.current) window.clearTimeout(timer.current);
    setStopped(false);
    setQrImage("");
    setQrNote("正在获取二维码…");

    try {
      const session = await startRef.current();
      if (!alive()) return;
      setQrImage(session.qrImage);
      setQrNote(scanHint);

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

  useEffect(() => {
    void begin();
    return () => {
      runId.current += 1;
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="dialog-mask" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>扫码登录</h2>

        {sendCaptcha && loginByCaptcha ? (
          <div className="dialog-tabs">
            <button type="button" className={mode === "qr" ? "on" : ""} onClick={() => setMode("qr")}>
              扫码
            </button>
            <button type="button" className={mode === "phone" ? "on" : ""} onClick={() => setMode("phone")}>
              手机号
            </button>
          </div>
        ) : null}

        {mode === "qr" ? (
          <>
            {qrImage ? <img className="qr" src={qrImage} alt="登录二维码" /> : <div className="qr qr--empty" />}
            <p className="dialog-note">{qrNote}</p>
            <div className="dialog-actions">
              <button type="button" className="primary" onClick={() => void begin()}>
                {stopped ? "刷新" : "换一张"}
              </button>
              <button type="button" onClick={onClose}>
                关闭
              </button>
            </div>
            <p className="dialog-hint">扫码被手机端拦截时，改用「手机号」登录。</p>
          </>
        ) : (
          <>
            <label className="field">
              <span>手机号</span>
              <input
                value={phone}
                inputMode="tel"
                placeholder="11 位手机号"
                onChange={(e) => setPhone(e.target.value.trim())}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => void send()} disabled={busy || countdown > 0}>
                {countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}
              </button>
            </div>

            <label className="field">
              <span>验证码</span>
              <input value={code} inputMode="numeric" placeholder="短信里的验证码" onChange={(e) => setCode(e.target.value)} />
            </label>

            <p className="dialog-note">{phoneNote}</p>

            <div className="dialog-actions">
              <button type="button" className="primary" onClick={() => void submit()} disabled={busy}>
                登录
              </button>
              <button type="button" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
