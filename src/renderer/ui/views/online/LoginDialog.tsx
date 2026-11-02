import { useEffect, useRef, useState } from "react";

export interface LoginDialogProps {
  start(): Promise<{ key: string; qrImage: string }>;
  poll(key: string): Promise<{ code: number | string; loggedIn: boolean; message: string }>;
  onSuccess(): void;
  onClose(): void;
}

/**
 * 扫码登录弹层。
 *
 * 轮询用 setTimeout 链而不是 setInterval：802（已扫码待确认）时手机可能停留十几秒，
 * setInterval 会让请求堆在一起；链式等待保证"上一次回来才发下一次"。
 */
export function LoginDialog({ start, poll, onSuccess, onClose }: LoginDialogProps) {
  const [qrImage, setQrImage] = useState("");
  const [note, setNote] = useState("正在获取二维码…");
  const [expired, setExpired] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  /**
   * 三个 props 都是父组件里的内联箭头函数，**每次渲染都是新引用**。
   * 如果把它们放进下面那个 effect 的依赖里，任何一次 setNote 都会让 effect 重跑，
   * 于是反复取新二维码、反复轮询 —— 所以这里锁进 ref，effect 只跑一次。
   */
  const startRef = useRef(start);
  const pollRef = useRef(poll);
  const successRef = useRef(onSuccess);
  useEffect(() => {
    startRef.current = start;
    pollRef.current = poll;
    successRef.current = onSuccess;
  }, [start, poll, onSuccess]);

  useEffect(() => {
    let alive = true;

    const begin = async (): Promise<void> => {
      setExpired(false);
      setNote("正在获取二维码…");
      try {
        const session = await startRef.current();
        if (!alive) return;
        setQrImage(session.qrImage);
        setNote("请打开网易云音乐 App → 扫一扫");

        const tick = async (): Promise<void> => {
          if (!alive) return;
          try {
            const result = await pollRef.current(session.key);
            if (!alive) return;
            setNote(result.message);
            if (result.loggedIn) {
              successRef.current();
              return;
            }
            if (result.code === 800) {
              setExpired(true);
              return;
            }
          } catch (err) {
            if (!alive) return;
            setNote(err instanceof Error ? err.message : "网络错误，稍后重试");
          }
          timer.current = window.setTimeout(() => void tick(), 2000);
        };

        timer.current = window.setTimeout(() => void tick(), 2000);
      } catch (err) {
        if (!alive) return;
        setNote(err instanceof Error ? err.message : "拿不到二维码");
      }
    };

    void begin();

    return () => {
      alive = false;
      if (timer.current) window.clearTimeout(timer.current);
    };
    // 空依赖：props 已锁进 ref，effect 只该跑一次
  }, []);

  return (
    <div className="dialog-mask" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>登录网易云</h2>
        {qrImage ? <img className="qr" src={qrImage} alt="登录二维码" /> : <div className="qr qr--empty" />}
        <p className="dialog-note">{note}</p>
        <div className="dialog-actions">
          {expired ? (
            <button type="button" className="primary" onClick={() => window.location.reload()}>
              刷新
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
