import { useEffect, useRef, useState } from "react";

export interface LoginDialogProps {
  /** 拿到 key 与服务端画好的二维码图（不需要前端再引二维码库） */
  start(): Promise<{ key: string; qrImage: string }>;
  poll(key: string): Promise<{ code: number; loggedIn: boolean; message: string }>;
  onSuccess(): void;
  onClose(): void;
}

/**
 * 扫码登录弹层。
 *
 * 三个刻意的设计：
 *   1. **轮询用 setTimeout 链**，不用 setInterval —— 802（待确认）时手机可能停十几秒，
 *      setInterval 会让请求堆在一起。
 *   2. **只在 801/802 继续轮询**。800（过期）与其它码都停下来等用户手动刷新，
 *      无限重试是最容易被服务端风控的行为。
 *   3. **运行代次（runId）作废旧轮询**。点"刷新"会换新二维码，旧 key 的在途请求必须立刻失效，
 *      否则两个 tick 会互相覆盖界面提示。
 */
export function LoginDialog({ start, poll, onSuccess, onClose }: LoginDialogProps) {
  const [qrImage, setQrImage] = useState("");
  const [note, setNote] = useState("正在获取二维码…");
  const [stopped, setStopped] = useState(false);

  const timer = useRef<number | undefined>(undefined);
  const runId = useRef(0);

  // props 是父组件的内联函数，每次渲染都是新引用；锁进 ref，effect 只跑一次
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
    setNote("正在获取二维码…");

    try {
      const session = await startRef.current();
      if (!alive()) return;
      setQrImage(session.qrImage);
      setNote("请打开网易云音乐 App → 扫一扫");

      const tick = async (): Promise<void> => {
        if (!alive()) return;
        try {
          const result = await pollRef.current(session.key);
          if (!alive()) return;
          setNote(result.message);

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
          setNote(err instanceof Error ? err.message : "网络错误，稍后重试");
          setStopped(true);
          return;
        }
        timer.current = window.setTimeout(() => void tick(), 2000);
      };

      timer.current = window.setTimeout(() => void tick(), 2000);
    } catch (err) {
      if (!alive()) return;
      setNote(err instanceof Error ? err.message : "拿不到二维码");
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

  return (
    <div className="dialog-mask" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>登录网易云</h2>
        {qrImage ? <img className="qr" src={qrImage} alt="登录二维码" /> : <div className="qr qr--empty" />}
        <p className="dialog-note">{note}</p>
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={() => void begin()}>
            {stopped ? "刷新" : "换一张"}
          </button>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
