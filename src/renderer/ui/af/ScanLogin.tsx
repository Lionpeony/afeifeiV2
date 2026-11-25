/* 扫码登录 · 乐迷会员票（真实二维码 + 轮询状态机；验证码备选） */
import { useEffect, useRef, useState } from "react";

import { hashStr } from "./art.js";
import { useDialogFocus } from "./dialog-focus.js";
import { IconCheck, IconPick, IconX } from "./icons.js";

export interface ScanLoginProps {
  sourceId: string | null;
  sourceName: string;
  sourceTone: string;
  account?: string;
  start(channel?: string): Promise<{ key: string; qrImage: string }>;
  poll(key: string): Promise<{ code: number; loggedIn: boolean; message: string; qrImage?: string }>;
  sendCaptcha?(phone: string): Promise<{ ok: boolean; message: string }>;
  loginByCaptcha?(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  onSuccess(): void;
  onClose(): void;
}

/** 音源接口可能一直不回包：超时就当失败，让「刷新二维码」永远有出路 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => { window.clearTimeout(t); resolve(v); },
      (e) => { window.clearTimeout(t); reject(e); },
    );
  });
}

const STEPS = [
  { key: "wait", label: "打开手机扫一扫", hint: "扫左边这张票上的码" },
  { key: "scanned", label: "在手机上确认登录", hint: "手机上会弹一个确认" },
  { key: "ok", label: "歌单和推荐同步过来", hint: "大概两秒钟" },
];

function QRCode({ seed = "afeifei", size = 196 }: { seed?: string; size?: number }) {
  const n = 21;
  const h1 = hashStr(seed);
  const h2 = hashStr(seed + "·afeifei");
  const inFinder = (x: number, y: number): boolean => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  const cells: [number, number][] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue;
      if (x === 6 || y === 6) {
        if ((x + y) % 2 === 0) cells.push([x, y]);
        continue;
      }
      const a = (h1 >>> ((x * 7 + y * 11) % 31)) & 1;
      const b = (h2 >>> ((x * 13 + y * 5) % 29)) & 1;
      if (a ^ b) cells.push([x, y]);
    }
  }
  const Finder = ({ fx, fy }: { fx: number; fy: number }) => (
    <g>
      <rect x={fx} y={fy} width="7" height="7" rx="1.6" />
      <rect x={fx + 1} y={fy + 1} width="5" height="5" fill="var(--white)" />
      <rect x={fx + 2} y={fy + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg className="qr" width={size} height={size} viewBox="-2 -2 25 25" role="img" aria-label="登录二维码">
      <rect x="-2" y="-2" width="25" height="25" fill="var(--white)" />
      <g fill="var(--scan-ink)">
        {cells.map(([x, y], i) => <rect key={i} x={x} y={y} width="1" height="1" />)}
        <Finder fx={0} fy={0} />
        <Finder fx={n - 7} fy={0} />
        <Finder fx={0} fy={n - 7} />
      </g>
    </svg>
  );
}

export function ScanLogin(props: ScanLoginProps) {
  const { sourceId, sourceName, sourceTone, account, start, poll, sendCaptcha, loginByCaptcha, onSuccess, onClose } = props;
  const [mode, setMode] = useState<"qr" | "code">("qr");
  const [state, setState] = useState<"wait" | "scanned" | "ok">("wait");
  const [qrImage, setQrImage] = useState("");
  const [qrNote, setQrNote] = useState("正在获取二维码…");
  const [stopped, setStopped] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const runId = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialogFocus(Boolean(sourceId), cardRef);

  const beginQr = (resetForm: boolean): void => {
    if (!sourceId) return;
    runId.current += 1;
    const my = runId.current;
    const alive = (): boolean => runId.current === my;
    if (timer.current) window.clearTimeout(timer.current);
    setState("wait");
    setQrImage("");
    setQrNote("正在获取二维码…");
    setStopped(false);
    if (resetForm) {
      setMode("qr");
      setPhone("");
      setCode("");
      setNote("");
    }
    void (async () => {
      try {
        const session = await withTimeout(start(), 20000, "二维码获取超时，点下面刷新");
        if (!alive()) return;
        setQrImage(session.qrImage);
        setQrNote("请打开手机扫一扫");
        const tick = async (): Promise<void> => {
          if (!alive()) return;
          try {
            const r = await withTimeout(poll(session.key), 10000, "查询超时，点下面刷新");
            if (!alive()) return;
            setQrNote(r.message);
            if (r.qrImage) setQrImage(r.qrImage);
            if (r.loggedIn) {
              setState("ok");
              setQrNote("同步完成");
              window.setTimeout(() => onSuccess(), 1500);
              return;
            }
            if (r.code === 802) setState("scanned");
            if (r.code !== 801 && r.code !== 802) {
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
    })();
  };

  useEffect(() => {
    beginQr(true);
    return () => {
      runId.current += 1;
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  if (!sourceId) return null;

  const stepIndex = state === "wait" ? 0 : state === "scanned" ? 1 : 3;

  const submitCode = async (): Promise<void> => {
    if (!loginByCaptcha) return;
    if (!/^1\d{10}$/.test(phone)) {
      setNote("请输入 11 位手机号");
      return;
    }
    if (code.trim().length < 4) {
      setNote("请输入验证码");
      return;
    }
    setBusy(true);
    try {
      const r = await loginByCaptcha(phone, code.trim());
      setNote(r.message);
      if (r.ok) {
        setState("ok");
        window.setTimeout(() => onSuccess(), 1200);
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scan-ov" role="dialog" aria-modal="true" aria-label={"登录" + sourceName} onClick={onClose}>
      <div ref={cardRef} tabIndex={-1} className={"scan" + (state === "ok" ? " is-ok" : "") + (mode === "code" ? " is-code" : "")} onClick={(e) => e.stopPropagation()}>
        <span className="scan__strip" aria-hidden="true"></span>
        <span className="scan__hole" aria-hidden="true"></span>
        <div className="scan__head">
          <span className="scan__brand"><b>AFEIFEI</b><span>FAN CLUB · 会员登记</span></span>
          <span className="scan__no">No.{String((hashStr(sourceId + "no") % 9000) + 1000)}</span>
        </div>

        <div className={"scan__body" + (mode === "code" ? " is-code" : "")}>
          <div className="scan__qrbox">
            <div className={"scan__qr" + (state === "ok" ? " is-done" : "")}>
              <div className="scan__corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
              {qrImage ? <img src={qrImage} alt="登录二维码" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <QRCode seed={sourceId + "·" + (account ?? "") + "·afeifei"} size={196} />}
              {state !== "ok" && !stopped ? <span className="scan__laser" aria-hidden="true"></span> : null}
              <span className="scan__mark" aria-hidden="true"><IconPick size={34} /></span>
            </div>
            {state === "ok" ? <span className="scan__stamp">已登记</span> : null}
            <span className="scan__qrfoot hand">{state === "ok" ? "登记完成 · 电子票已存" : qrNote}</span>
          </div>

          <div className="scan__side">
            <span className="scan__eyebrow">{mode === "qr" ? "扫码登录" : "验证码登录"}</span>
            <h2 className="scan__title" style={{ color: sourceTone }}>{sourceName}</h2>
            <span className="scan__account">{account ?? "真实账号"}</span>

            {mode === "qr" ? (
              <>
                <ol className="scan__steps">
                  {STEPS.map((st, i) => (
                    <li key={st.key} className={"scan__step" + (i < stepIndex ? " is-done" : i === stepIndex ? " is-now" : "")}>
                      <span className="scan__step-no">{i < stepIndex ? <IconCheck size={11} /> : i + 1}</span>
                      <span className="scan__step-text"><b>{st.label}</b><span>{st.hint}</span></span>
                    </li>
                  ))}
                </ol>
                <div className="scan__foot">
                  {state === "ok" ? (
                    <span className="scan__ok"><IconCheck size={14} />同步完成 · 账号数据已就位</span>
                  ) : state === "scanned" ? (
                    <span className="scan__waiting"><i></i><i></i><i></i><span className="hand">等手机确认…</span></span>
                  ) : (
                    <span className="scan__waiting"><i></i><i></i><i></i><span className="hand">{stopped ? "点下面刷新一下" : "等着手机扫过去…"}</span></span>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="scan__tip">收一条短信验证码，作用跟扫码一样，只是少了那张票。</p>
                <label className="login-field"><span>手机号</span><input value={phone} inputMode="tel" placeholder="11 位手机号" onChange={(e) => setPhone(e.target.value.trim())} /></label>
                <div className="login-ops" style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { if (!sendCaptcha) return; void sendCaptcha(phone).then((r) => setNote(r.message)).catch((e: unknown) => setNote(e instanceof Error ? e.message : "发送失败")); }}>发送验证码</button>
                </div>
                <div className="scan__code">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={"scan__cell" + (code.length === i ? " is-focus" : "") + (code[i] ? " is-fill" : "")}>{code[i] ?? ""}</span>
                  ))}
                  <input className="scan__codeinput" value={code} inputMode="numeric" autoFocus onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) window.setTimeout(() => void submitCode(), 220); }} aria-label="验证码" />
                </div>
                <span className="scan__tip hand">{note || "按收到的数字依次填进来"}</span>
              </>
            )}

            <div className="scan__switch">
              <button className="scan__link" onClick={() => setMode((m) => (m === "qr" ? "code" : "qr"))}>{mode === "qr" ? "扫码不方便？用验证码" : "还是扫码吧"}</button>
              {stopped ? <button className="scan__link" style={{ marginLeft: 12 }} onClick={() => beginQr(false)}>刷新二维码</button> : null}
            </div>
          </div>
        </div>

        <div className="scan__perf" aria-hidden="true"></div>
        <div className="scan__footbar">
          <span className="scan__note">登录来自真实音源；二维码由当前账号服务生成。</span>
          <button className="scan__close" onClick={onClose}>收起<IconX size={12} /></button>
        </div>
      </div>
    </div>
  );
}
